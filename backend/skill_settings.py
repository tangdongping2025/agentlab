from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from database import SessionLocal
from models import AppSettingModel
from runtime.registry import _AGENT_REGISTRY

SKILL_SETTINGS_PATH = Path(__file__).resolve().parent / "skill-settings.local.json"
SKILL_SETTING_KEY = "skill_settings"
SKILL_DIRS = [
    Path(__file__).resolve().parent / "skills",
    Path(__file__).resolve().parent.parent / ".claude" / "skills",
]
SKILL_FILENAMES = ("SKILL.md", "skill.md", "README.md")
SUPPORTED_SKILL_AGENT_IDS = {"assistant", "research", "claude-sdk"}
MAX_SKILL_CHARS = 12000


def _known_agent_ids() -> set[str]:
    return set(_AGENT_REGISTRY.keys())


def _parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    match = re.match(r"^---\n(.*?)\n---\n?", text, re.DOTALL)
    if not match:
        return {}, text
    meta = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip("\"'")
    return meta, text[match.end():]


def discover_skills() -> list[dict[str, Any]]:
    skills = []
    seen = set()
    for root in SKILL_DIRS:
        if not root.exists() or not root.is_dir():
            continue
        for child in sorted(p for p in root.iterdir() if p.is_dir()):
            if child.name in seen:
                continue
            md = next((child / name for name in SKILL_FILENAMES if (child / name).is_file()), None)
            if not md:
                continue
            raw = md.read_text(encoding="utf-8", errors="ignore")
            meta, body = _parse_frontmatter(raw)
            truncated = len(body) > MAX_SKILL_CHARS
            if truncated:
                body = body[:MAX_SKILL_CHARS]
            skill_id = child.name
            seen.add(skill_id)
            skills.append({
                "id": skill_id,
                "name": meta.get("name") or skill_id,
                "description": meta.get("description") or "",
                "content": body.strip(),
                "source": str(md),
                "truncated": truncated,
            })
    return skills


def sanitize_skill_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    discovered = {s["id"] for s in discover_skills()}
    known_agents = _known_agent_ids()
    raw_skills = (raw or {}).get("skills") or {}
    result = {}
    for skill_id, cfg in raw_skills.items():
        if skill_id not in discovered or not isinstance(cfg, dict):
            continue
        agent_ids = cfg.get("agentIds", [])
        if not isinstance(agent_ids, list):
            agent_ids = []
        filtered = [a for a in agent_ids if a in known_agents and a in SUPPORTED_SKILL_AGENT_IDS]
        result[skill_id] = {
            "enabled": bool(cfg.get("enabled", False)),
            "agentIds": filtered,
        }
    return {"skills": result}


def _load_legacy_skill_settings() -> dict[str, Any]:
    if not SKILL_SETTINGS_PATH.exists():
        return {"skills": {}}
    try:
        return sanitize_skill_settings(json.loads(SKILL_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return {"skills": {}}


def _upsert_skill_settings(settings: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, SKILL_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=SKILL_SETTING_KEY, setting_value=settings))
        db.commit()
    finally:
        db.close()


def load_skill_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, SKILL_SETTING_KEY)
        if row:
            return sanitize_skill_settings(row.setting_value)
    finally:
        db.close()

    legacy = _load_legacy_skill_settings()
    if SKILL_SETTINGS_PATH.exists():
        _upsert_skill_settings(legacy)
    return legacy


def save_skill_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_skill_settings(raw)
    _upsert_skill_settings(settings)
    return settings


def build_skill_prompt_for_agent(agent_id: str) -> str:
    settings = load_skill_settings()
    skills = {s["id"]: s for s in discover_skills()}
    chunks = []
    for skill_id in sorted(settings["skills"]):
        cfg = settings["skills"][skill_id]
        if not cfg.get("enabled") or agent_id not in cfg.get("agentIds", []):
            continue
        skill = skills.get(skill_id)
        if not skill:
            continue
        chunks.append(f"\n[启用的 Skill: {skill['name']}]\n{skill['content']}\n[/Skill]\n")
    return "".join(chunks)


def build_skill_settings_response() -> dict[str, Any]:
    settings = load_skill_settings()
    skills = []
    for skill in discover_skills():
        cfg = settings["skills"].get(skill["id"], {"enabled": False, "agentIds": []})
        skills.append({
            "id": skill["id"],
            "name": skill["name"],
            "description": skill["description"],
            "source": skill["source"],
            "truncated": skill["truncated"],
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
        })
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsSkill": agent_id in SUPPORTED_SKILL_AGENT_IDS,
            "unsupportedReason": "非 LLM 推理型智能体暂不支持 skill 注入" if agent_id not in SUPPORTED_SKILL_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {"skills": skills, "agents": agents}

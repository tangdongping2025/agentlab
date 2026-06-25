from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from config import settings as app_settings
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
SUPPORTED_SKILL_AGENT_IDS = {"assistant", "research", "claude-sdk", "invest"}
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
    lines = match.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if ":" not in line:
            i += 1
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value == "|":
            block = []
            i += 1
            while i < len(lines) and (lines[i].startswith(" ") or lines[i].startswith("\t")):
                block.append(lines[i].strip())
                i += 1
            meta[key] = "\n".join(block).strip()
            continue
        meta[key] = value.strip("\"'")
        i += 1
    return meta, text[match.end():]


def _check_under_root(target_str: str) -> Path:
    root = Path(app_settings.root_dir).resolve()
    target = Path(target_str).resolve()
    if target != root and root not in target.parents:
        raise ValueError("path must be under root_dir")
    return target


def _scan_skill_root(root: Path, source_type: str, seen: set[str]) -> list[dict[str, Any]]:
    skills = []
    if not root.exists() or not root.is_dir():
        return skills
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
            "sourceType": source_type,
            "truncated": truncated,
        })
    return skills


def discover_skills(cwd: str | None = None) -> list[dict[str, Any]]:
    skills = []
    seen = set()
    for root in SKILL_DIRS:
        skills.extend(_scan_skill_root(root, "platform", seen))
    if cwd:
        workspace_base = _check_under_root(cwd)
        for workspace_root in [workspace_base / ".claude" / "skills", workspace_base / "skills"]:
            skills.extend(_scan_skill_root(workspace_root, "workspace", seen))
    return skills


def _discover_for_settings(cwd: str | None = None) -> list[dict[str, Any]]:
    try:
        return discover_skills(cwd)
    except TypeError:
        return discover_skills()


def sanitize_skill_settings(raw: dict[str, Any] | None, cwd: str | None = None) -> dict[str, Any]:
    discovered = {s["id"] for s in _discover_for_settings(cwd)}
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


def load_skill_settings(cwd: str | None = None) -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, SKILL_SETTING_KEY)
        if row:
            return sanitize_skill_settings(row.setting_value, cwd)
    finally:
        db.close()

    legacy = _load_legacy_skill_settings()
    if SKILL_SETTINGS_PATH.exists():
        _upsert_skill_settings(legacy)
    return sanitize_skill_settings(legacy, cwd)


def save_skill_settings(raw: dict[str, Any], cwd: str | None = None) -> dict[str, Any]:
    settings = sanitize_skill_settings(raw, cwd)
    _upsert_skill_settings(settings)
    return settings


def build_skill_prompt_for_agent(agent_id: str, cwd: str | None = None) -> str:
    settings = load_skill_settings(cwd)
    skills = {s["id"]: s for s in _discover_for_settings(cwd)}
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


def build_skill_settings_response(cwd: str | None = None) -> dict[str, Any]:
    settings = load_skill_settings(cwd)
    skills = []
    for skill in _discover_for_settings(cwd):
        cfg = settings["skills"].get(skill["id"], {"enabled": False, "agentIds": []})
        skills.append({
            "id": skill["id"],
            "name": skill["name"],
            "description": skill["description"],
            "source": skill["source"],
            "sourceType": skill.get("sourceType", "platform"),
            "content": skill["content"],
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

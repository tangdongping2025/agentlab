from __future__ import annotations

from database import SessionLocal
from global_prompt_settings import build_global_prompt_for_agent, load_global_prompt_settings
from task_system_settings import build_task_system_for_agent
from habit_prompt_settings import build_habit_prompt_for_agent
import models
from runtime.claude_sdk_agent import (
    _ALLOWED_TOOLS,
    _AMAP_SERVER_NAME,
    _AMAP_SYSTEM_PROMPT_SUFFIX,
    _DEFAULT_SYSTEM_PROMPT,
    _build_mcp_servers,
)
from skill_settings import _discover_for_settings, build_skill_prompt_for_agent, load_skill_settings

_PREVIEW_LIMIT = 200

SUPPORTED_MEMORY_PREVIEW_AGENT_IDS = {"claude-sdk"}


def _segment(key: str, name: str, text: str, source: str, enabled: bool = True) -> dict:
    return {
        "key": key,
        "name": name,
        "enabled": enabled,
        "chars": len(text),
        "source": source,
        "preview": text[:_PREVIEW_LIMIT],
    }


def _insight_to_out(item) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "description": item.description,
        "sourceSessionIds": item.source_session_ids or [],
        "status": item.status,
        "enabledForPrompt": bool(item.enabled_for_prompt),
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
    }


def _list_insights(kind: str) -> list:
    db = SessionLocal()
    try:
        rows = (
            db.query(models.InsightItemModel)
            .filter(models.InsightItemModel.kind == kind)
            .order_by(models.InsightItemModel.updated_at.desc())
            .all()
        )
        return [_insight_to_out(r) for r in rows]
    finally:
        db.close()


def _skill_breakdown(agent_id: str, cwd: str | None = None) -> list[dict]:
    settings = load_skill_settings(cwd)
    skills = {s["id"]: s for s in _discover_for_settings(cwd)}
    items = []
    for skill_id in sorted(settings["skills"]):
        cfg = settings["skills"][skill_id]
        if not cfg.get("enabled") or agent_id not in cfg.get("agentIds", []):
            continue
        skill = skills.get(skill_id)
        if not skill:
            continue
        name = skill["name"]
        chunk_len = len(f"\n[启用的 Skill: {name}]\n{skill['content']}\n[/Skill]\n")
        items.append({"id": skill_id, "name": name, "chars": chunk_len})
    return items


def _format_skill_preview(items: list[dict], total: int) -> str:
    if not items:
        return "（无启用 skill）"
    lines = []
    for it in items:
        pct = round(it["chars"] * 100 / total) if total else 0
        lines.append(f"{it['name']} · {it['chars']} 字符 · {pct}%")
    return "\n".join(lines)


def build_memory_preview_response(agent_id: str, cwd: str | None = None) -> dict:
    if agent_id not in SUPPORTED_MEMORY_PREVIEW_AGENT_IDS:
        raise ValueError(f"memory preview not supported for agent: {agent_id}")

    global_text = build_global_prompt_for_agent(agent_id)
    task_text = build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT
    skill_text = build_skill_prompt_for_agent(agent_id, cwd)
    skill_items = _skill_breakdown(agent_id, cwd)
    skill_chars = len(skill_text)
    skill_preview = _format_skill_preview(skill_items, skill_chars)
    habit_text = build_habit_prompt_for_agent(agent_id)

    mcp_servers = _build_mcp_servers()
    amap_enabled = _AMAP_SERVER_NAME in mcp_servers
    mcp_text = _AMAP_SYSTEM_PROMPT_SUFFIX if amap_enabled else ""

    segments = [
        _segment("global", "全局系统提示词", global_text, "global_prompt_settings · app_settings.global_prompt", enabled=bool(global_text)),
        _segment("task", "任务段", task_text, "用户覆盖(启用)或 _DEFAULT_SYSTEM_PROMPT(代码默认);运行时 task.system 优先级更高"),
        {
            "key": "skill",
            "name": "技能",
            "enabled": bool(skill_items),
            "chars": skill_chars,
            "source": "build_skill_prompt_for_agent",
            "preview": skill_preview,
        },
        _segment("habit", "习惯偏好", habit_text, "build_habit_prompt_for_agent", enabled=bool(habit_text)),
        _segment("mcp", "MCP 提示", mcp_text, "claude_sdk_agent.py(_build_options,amap 启用时拼入)", enabled=amap_enabled),
    ]

    tools_mcp = [f"mcp__{_AMAP_SERVER_NAME}__*"] if amap_enabled else []
    gp = load_global_prompt_settings()

    return {
        "segments": segments,
        "totalChars": sum(s["chars"] for s in segments),
        "tools": {"system": list(_ALLOWED_TOOLS), "mcp": tools_mcp},
        "habits": _list_insights("habit"),
        "knowledge": _list_insights("knowledge"),
        "globalPrompt": {"enabled": bool(gp.get("enabled")), "chars": len(gp.get("prompt") or "")},
    }

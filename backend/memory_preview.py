from __future__ import annotations

from database import SessionLocal
from global_prompt_settings import build_global_prompt_for_agent, load_global_prompt_settings
from habit_prompt_settings import build_habit_prompt_for_agent
import models
from runtime.claude_sdk_agent import (
    _ALLOWED_TOOLS,
    _AMAP_SERVER_NAME,
    _AMAP_SYSTEM_PROMPT_SUFFIX,
    _DEFAULT_SYSTEM_PROMPT,
    _build_mcp_servers,
)
from skill_settings import build_skill_prompt_for_agent

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


def build_memory_preview_response(agent_id: str, cwd: str | None = None) -> dict:
    if agent_id not in SUPPORTED_MEMORY_PREVIEW_AGENT_IDS:
        raise ValueError(f"memory preview not supported for agent: {agent_id}")

    global_text = build_global_prompt_for_agent(agent_id)
    task_text = _DEFAULT_SYSTEM_PROMPT
    skill_text = build_skill_prompt_for_agent(agent_id, cwd)
    habit_text = build_habit_prompt_for_agent(agent_id)

    mcp_servers = _build_mcp_servers()
    amap_enabled = _AMAP_SERVER_NAME in mcp_servers
    mcp_text = _AMAP_SYSTEM_PROMPT_SUFFIX if amap_enabled else ""

    segments = [
        _segment("global", "全局系统提示词", global_text, "global_prompt_settings · app_settings.global_prompt", enabled=bool(global_text)),
        _segment("task", "任务段", task_text, "task.system 或 _DEFAULT_SYSTEM_PROMPT(当前会话未设 task.system → 默认)"),
        _segment("skill", "技能", skill_text, "build_skill_prompt_for_agent", enabled=bool(skill_text)),
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

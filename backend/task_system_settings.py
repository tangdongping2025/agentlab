from __future__ import annotations

from typing import Any

from database import SessionLocal
from models import AppSettingModel
from runtime.registry import _AGENT_REGISTRY

TASK_SYSTEM_SETTING_KEY = "task_system"
SUPPORTED_TASK_SYSTEM_AGENT_IDS = {"claude-sdk"}
MAX_TASK_SYSTEM_CHARS = 20000
_DEFAULT_PREVIEW_LIMIT = 200


def sanitize_task_system_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    content = (raw or {}).get("content", "")
    if not isinstance(content, str):
        content = ""
    content = content[:MAX_TASK_SYSTEM_CHARS]
    return {
        "enabled": bool((raw or {}).get("enabled", False)),
        "content": content,
    }


def load_task_system_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, TASK_SYSTEM_SETTING_KEY)
        if row:
            return sanitize_task_system_settings(row.setting_value)
        return {"enabled": False, "content": ""}
    finally:
        db.close()


def save_task_system_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_task_system_settings(raw)
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, TASK_SYSTEM_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=TASK_SYSTEM_SETTING_KEY, setting_value=settings))
        db.commit()
        return settings
    finally:
        db.close()


def build_task_system_for_agent(agent_id: str) -> str | None:
    if agent_id not in SUPPORTED_TASK_SYSTEM_AGENT_IDS:
        return None
    settings = load_task_system_settings()
    content = settings["content"].strip()
    if not settings["enabled"] or not content:
        return None
    return content


def build_task_system_settings_response() -> dict[str, Any]:
    # 延迟 import:claude_sdk_agent 模块级 import 本模块(接入 :117),模块级反 import 会循环
    from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT

    settings = load_task_system_settings()
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsTaskSystem": agent_id in SUPPORTED_TASK_SYSTEM_AGENT_IDS,
            "unsupportedReason": "任务段覆盖仅支持 claude-sdk Agent" if agent_id not in SUPPORTED_TASK_SYSTEM_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {**settings, "defaultPreview": _DEFAULT_SYSTEM_PROMPT[:_DEFAULT_PREVIEW_LIMIT], "agents": agents}

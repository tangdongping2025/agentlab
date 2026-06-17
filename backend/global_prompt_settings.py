from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from runtime.registry import _AGENT_REGISTRY

GLOBAL_PROMPT_SETTINGS_PATH = Path(__file__).resolve().parent / "global-prompt-settings.local.json"
SUPPORTED_GLOBAL_PROMPT_AGENT_IDS = {"assistant", "research", "claude-sdk"}
MAX_GLOBAL_PROMPT_CHARS = 20000


def sanitize_global_prompt_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    prompt = (raw or {}).get("prompt", "")
    if not isinstance(prompt, str):
        prompt = ""
    prompt = prompt[:MAX_GLOBAL_PROMPT_CHARS]
    return {
        "enabled": bool((raw or {}).get("enabled", False)),
        "prompt": prompt,
    }


def load_global_prompt_settings() -> dict[str, Any]:
    if not GLOBAL_PROMPT_SETTINGS_PATH.exists():
        return {"enabled": False, "prompt": ""}
    try:
        return sanitize_global_prompt_settings(json.loads(GLOBAL_PROMPT_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return {"enabled": False, "prompt": ""}


def save_global_prompt_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_global_prompt_settings(raw)
    GLOBAL_PROMPT_SETTINGS_PATH.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return settings


def build_global_prompt_for_agent(agent_id: str) -> str:
    if agent_id not in SUPPORTED_GLOBAL_PROMPT_AGENT_IDS:
        return ""
    settings = load_global_prompt_settings()
    prompt = settings["prompt"].strip()
    if not settings["enabled"] or not prompt:
        return ""
    return f"[全局系统提示词]\n{prompt}\n[/全局系统提示词]\n\n"


def build_global_prompt_settings_response() -> dict[str, Any]:
    settings = load_global_prompt_settings()
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsGlobalPrompt": agent_id in SUPPORTED_GLOBAL_PROMPT_AGENT_IDS,
            "unsupportedReason": "非 LLM 推理型智能体暂不支持全局提示词注入" if agent_id not in SUPPORTED_GLOBAL_PROMPT_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {**settings, "agents": agents}

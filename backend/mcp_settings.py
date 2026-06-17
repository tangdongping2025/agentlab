from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from database import SessionLocal
from models import AppSettingModel
from runtime.registry import _AGENT_REGISTRY

MCP_SETTINGS_PATH = Path(__file__).resolve().parent / "mcp-settings.local.json"
MCP_SETTING_KEY = "mcp_settings"
AMAP_SERVER_ID = "amap-maps"
AMAP_SECRET_ENV = "AMAP_MAPS_API_KEY"
AMAP_PREINSTALLED_ENTRY = "/opt/mcp/node_modules/@amap/amap-maps-mcp-server/build/index.js"
LAUNCH_MODES = {"auto", "npx", "bundled"}
SUPPORTED_MCP_AGENT_IDS = {"claude-sdk", "assistant", "research"}
DEFAULT_MCP_SETTINGS = {
    "servers": {
        AMAP_SERVER_ID: {
            "enabled": True,
            "agentIds": ["claude-sdk"],
            "launchMode": "auto",
        }
    }
}


def _known_agent_ids() -> set[str]:
    return set(_AGENT_REGISTRY.keys())


def sanitize_mcp_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw_servers = (raw or {}).get("servers") or {}
    raw_amap = raw_servers.get(AMAP_SERVER_ID) or {}
    enabled = raw_amap.get("enabled", DEFAULT_MCP_SETTINGS["servers"][AMAP_SERVER_ID]["enabled"])
    launch_mode = raw_amap.get("launchMode", "auto")
    if launch_mode not in LAUNCH_MODES:
        launch_mode = "auto"
    known = _known_agent_ids()
    agent_ids = raw_amap.get("agentIds", ["claude-sdk"])
    if not isinstance(agent_ids, list):
        agent_ids = ["claude-sdk"]
    agent_ids = [a for a in agent_ids if a in known and a in SUPPORTED_MCP_AGENT_IDS]
    if not agent_ids and "claude-sdk" in known:
        agent_ids = ["claude-sdk"]
    return {
        "servers": {
            AMAP_SERVER_ID: {
                "enabled": bool(enabled),
                "agentIds": agent_ids,
                "launchMode": launch_mode,
            }
        }
    }


def _load_legacy_mcp_settings() -> dict[str, Any]:
    if not MCP_SETTINGS_PATH.exists():
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)
    try:
        return sanitize_mcp_settings(json.loads(MCP_SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return sanitize_mcp_settings(DEFAULT_MCP_SETTINGS)


def _upsert_mcp_settings(settings: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, MCP_SETTING_KEY)
        if row:
            row.setting_value = settings
        else:
            db.add(AppSettingModel(setting_key=MCP_SETTING_KEY, setting_value=settings))
        db.commit()
    finally:
        db.close()


def load_mcp_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, MCP_SETTING_KEY)
        if row:
            return sanitize_mcp_settings(row.setting_value)
    finally:
        db.close()

    legacy = _load_legacy_mcp_settings()
    if MCP_SETTINGS_PATH.exists():
        _upsert_mcp_settings(legacy)
    return legacy


def save_mcp_settings(raw: dict[str, Any]) -> dict[str, Any]:
    settings = sanitize_mcp_settings(raw)
    _upsert_mcp_settings(settings)
    return settings


def select_amap_command(launch_mode: str) -> tuple[str | None, list[str], str | None]:
    preinstalled_exists = os.path.isfile(AMAP_PREINSTALLED_ENTRY)
    if launch_mode == "bundled":
        if not preinstalled_exists:
            return None, [], "bundled entry missing"
        return "node", [AMAP_PREINSTALLED_ENTRY], None
    if launch_mode == "npx":
        if sys.platform == "win32":
            return "cmd", ["/c", "npx", "-y", "@amap/amap-maps-mcp-server"], None
        return "npx", ["-y", "@amap/amap-maps-mcp-server"], None
    if sys.platform != "win32" and preinstalled_exists:
        return "node", [AMAP_PREINSTALLED_ENTRY], None
    if sys.platform == "win32":
        return "cmd", ["/c", "npx", "-y", "@amap/amap-maps-mcp-server"], None
    return "npx", ["-y", "@amap/amap-maps-mcp-server"], None


def build_mcp_settings_response() -> dict[str, Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"][AMAP_SERVER_ID]
    agents = [
        {
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsMcp": agent_id in SUPPORTED_MCP_AGENT_IDS,
            "unsupportedReason": "非 LLM tool-use 智能体暂不支持 MCP" if agent_id not in SUPPORTED_MCP_AGENT_IDS else "",
        }
        for agent_id, cls in _AGENT_REGISTRY.items()
    ]
    return {
        "servers": [{
            "id": AMAP_SERVER_ID,
            "name": "高德地图",
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
            "launchMode": cfg["launchMode"],
            "secretEnv": AMAP_SECRET_ENV,
            "secretConfigured": bool(os.environ.get(AMAP_SECRET_ENV, "").strip()),
            "supportedAgentIds": sorted(SUPPORTED_MCP_AGENT_IDS),
            "unsupportedReason": "Echo 等非工具循环智能体暂不支持 MCP",
        }],
        "agents": agents,
    }


def diagnose_mcp_settings() -> dict[str, Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"][AMAP_SERVER_ID]
    command, args, error = select_amap_command(cfg["launchMode"])
    return {
        "servers": [{
            "id": AMAP_SERVER_ID,
            "enabled": cfg["enabled"],
            "agentIds": cfg["agentIds"],
            "launchMode": cfg["launchMode"],
            "secretEnv": AMAP_SECRET_ENV,
            "secretConfigured": bool(os.environ.get(AMAP_SECRET_ENV, "").strip()),
            "platform": sys.platform,
            "nodeAvailable": shutil.which("node") is not None,
            "npmAvailable": shutil.which("npm") is not None,
            "npxAvailable": shutil.which("npx") is not None,
            "bundledEntry": AMAP_PREINSTALLED_ENTRY,
            "bundledEntryExists": os.path.isfile(AMAP_PREINSTALLED_ENTRY),
            "selectedCommand": command or "",
            "selectedArgs": args,
            "error": error or "",
        }]
    }

from __future__ import annotations

from fastapi import APIRouter

from mcp_settings import build_mcp_settings_response, diagnose_mcp_settings, save_mcp_settings
from skill_settings import build_skill_settings_response, save_skill_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/mcp")
def get_mcp_settings() -> dict:
    return build_mcp_settings_response()


@router.post("/mcp")
def update_mcp_settings(payload: dict) -> dict:
    save_mcp_settings(payload)
    return build_mcp_settings_response()


@router.post("/mcp/diagnose")
def diagnose_mcp() -> dict:
    return diagnose_mcp_settings()


@router.get("/skills")
def get_skill_settings() -> dict:
    return build_skill_settings_response()


@router.post("/skills")
def update_skill_settings(payload: dict) -> dict:
    save_skill_settings(payload)
    return build_skill_settings_response()

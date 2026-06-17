from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agent_model_settings import (
    ModelConfigSecretError,
    build_agent_model_settings_response,
    save_agent_model_settings,
)
from global_prompt_settings import build_global_prompt_settings_response, save_global_prompt_settings
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


@router.get("/global-prompt")
def get_global_prompt_settings() -> dict:
    return build_global_prompt_settings_response()


@router.post("/global-prompt")
def update_global_prompt_settings(payload: dict) -> dict:
    save_global_prompt_settings(payload)
    return build_global_prompt_settings_response()


@router.get("/agent-models")
def get_agent_model_settings() -> dict:
    return build_agent_model_settings_response()


@router.post("/agent-models")
def update_agent_model_settings(payload: dict) -> dict:
    try:
        return save_agent_model_settings(payload)
    except ModelConfigSecretError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

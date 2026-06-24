from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from config import settings
from database import SessionLocal
from models import AppSettingModel
from runtime.registry import _AGENT_REGISTRY

AGENT_MODEL_SETTING_KEY = "agent_model_settings"
SUPPORTED_MODEL_CONFIG_AGENT_IDS = {"assistant", "research", "claude-sdk"}


class ModelConfigSecretError(Exception):
    pass


@dataclass(frozen=True)
class ResolvedModelConfig:
    api_key: str
    base_url: str
    model: str


def _master_key() -> str:
    return settings.model_config_master_key.strip()


def _get_fernet() -> Fernet:
    master = _master_key()
    if not master:
        raise ModelConfigSecretError("MODEL_CONFIG_MASTER_KEY is required to save API key")
    key = base64.urlsafe_b64encode(hashlib.sha256(master.encode()).digest())
    return Fernet(key)


def _encrypt_api_key(api_key: str) -> str:
    return _get_fernet().encrypt(api_key.encode()).decode()


def _decrypt_api_key(api_key_encrypted: str) -> str:
    try:
        return _get_fernet().decrypt(api_key_encrypted.encode()).decode()
    except InvalidToken as exc:
        raise ModelConfigSecretError("MODEL_CONFIG_MASTER_KEY cannot decrypt saved API key") from exc


def _trim(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _empty_settings() -> dict[str, Any]:
    return {"agents": {}}


def sanitize_agent_model_settings(raw: dict[str, Any] | None, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_agents = (raw or {}).get("agents") or {}
    previous_agents = (previous or {}).get("agents") or {}
    result: dict[str, Any] = {"agents": {}}

    if not isinstance(raw_agents, dict):
        return result

    for agent_id, cfg in raw_agents.items():
        if agent_id not in SUPPORTED_MODEL_CONFIG_AGENT_IDS or not isinstance(cfg, dict):
            continue

        sanitized: dict[str, Any] = {
            "baseUrl": _trim(cfg.get("baseUrl")),
            "model": _trim(cfg.get("model")),
        }
        previous_cfg = previous_agents.get(agent_id) if isinstance(previous_agents, dict) else None
        previous_encrypted = ""
        if isinstance(previous_cfg, dict):
            previous_encrypted = _trim(previous_cfg.get("apiKeyEncrypted"))

        if "apiKey" not in cfg:
            if previous_encrypted:
                sanitized["apiKeyEncrypted"] = previous_encrypted
        else:
            api_key = cfg.get("apiKey")
            if api_key == "":
                pass
            elif isinstance(api_key, str) and api_key:
                sanitized["apiKeyEncrypted"] = _encrypt_api_key(api_key)
            elif previous_encrypted:
                sanitized["apiKeyEncrypted"] = previous_encrypted

        result["agents"][agent_id] = sanitized

    return result


def load_agent_model_settings() -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, AGENT_MODEL_SETTING_KEY)
        if not row:
            return _empty_settings()
        return sanitize_agent_model_settings(row.setting_value, row.setting_value)
    finally:
        db.close()


def _upsert_agent_model_settings(value: dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, AGENT_MODEL_SETTING_KEY)
        if row:
            row.setting_value = value
        else:
            db.add(AppSettingModel(setting_key=AGENT_MODEL_SETTING_KEY, setting_value=value))
        db.commit()
    finally:
        db.close()


def save_agent_model_settings(raw: dict[str, Any]) -> dict[str, Any]:
    previous = load_agent_model_settings()
    sanitized = sanitize_agent_model_settings(raw, previous)
    _upsert_agent_model_settings(sanitized)
    return build_agent_model_settings_response(sanitized)


def build_agent_model_settings_response(current: dict[str, Any] | None = None) -> dict[str, Any]:
    stored = current if current is not None else load_agent_model_settings()
    stored_agents = stored.get("agents") or {}
    agents = []

    for agent_id, cls in _AGENT_REGISTRY.items():
        supports = agent_id in SUPPORTED_MODEL_CONFIG_AGENT_IDS
        cfg = stored_agents.get(agent_id, {}) if isinstance(stored_agents, dict) else {}
        if not isinstance(cfg, dict):
            cfg = {}
        base_url = _trim(cfg.get("baseUrl")) if supports else ""
        model = _trim(cfg.get("model")) if supports else ""
        agents.append({
            "id": agent_id,
            "name": cls.metadata.name,
            "supportsModelConfig": supports,
            "baseUrl": base_url,
            "model": model,
            "effectiveBaseUrl": (base_url or settings.llm_base_url) if supports else "",
            "effectiveModel": (model or settings.llm_model) if supports else "",
            "apiKeyConfigured": bool(_trim(cfg.get("apiKeyEncrypted"))) if supports else False,
            "unsupportedReason": "非 LLM 推理型智能体暂不支持模型配置" if not supports else "",
        })

    return {
        "encryptionConfigured": bool(_master_key()),
        "agents": agents,
    }


def resolve_model_config_for_agent(agent_id: str) -> ResolvedModelConfig:
    if agent_id not in SUPPORTED_MODEL_CONFIG_AGENT_IDS:
        return ResolvedModelConfig(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model,
        )

    stored = load_agent_model_settings()
    cfg = (stored.get("agents") or {}).get(agent_id) or {}
    if not isinstance(cfg, dict):
        cfg = {}

    api_key = settings.llm_api_key
    encrypted = _trim(cfg.get("apiKeyEncrypted"))
    if encrypted:
        try:
            api_key = _decrypt_api_key(encrypted)
        except ModelConfigSecretError:
            pass  # master key 缺失/不匹配,解密失败 → fallback settings.llm_api_key

    return ResolvedModelConfig(
        api_key=api_key,
        base_url=_trim(cfg.get("baseUrl")) or settings.llm_base_url,
        model=_trim(cfg.get("model")) or settings.llm_model,
    )

import pytest
from fastapi.testclient import TestClient


def clear_agent_model_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "agent_model_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_agent_model_settings_encrypts_api_key(monkeypatch):
    import agent_model_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()

    saved = mod.save_agent_model_settings({"agents": {"assistant": {"baseUrl": "https://example.com/api", "model": "demo", "apiKey": "secret-key"}}})

    assistant = next(a for a in saved["agents"] if a["id"] == "assistant")
    assert assistant["baseUrl"] == "https://example.com/api"
    assert assistant["model"] == "demo"
    assert assistant["apiKeyConfigured"] is True
    assert "secret-key" not in str(saved)
    assert "apiKey" not in assistant
    assert "apiKeyEncrypted" not in assistant

    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "agent_model_settings")
        assert "secret-key" not in str(row.setting_value)
        assert row.setting_value["agents"]["assistant"]["apiKeyEncrypted"]
    finally:
        db.close()

    resolved = mod.resolve_model_config_for_agent("assistant")
    assert resolved.api_key == "secret-key"
    assert resolved.base_url == "https://example.com/api"
    assert resolved.model == "demo"


def test_save_agent_model_settings_rejects_api_key_without_master_key(monkeypatch):
    import agent_model_settings as mod

    monkeypatch.setattr(mod.settings, "model_config_master_key", "")
    clear_agent_model_setting()

    with pytest.raises(mod.ModelConfigSecretError):
        mod.save_agent_model_settings({"agents": {"assistant": {"apiKey": "secret-key"}}})


def test_agent_model_settings_api_does_not_return_plain_key(monkeypatch):
    import agent_model_settings as mod
    from main import app

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()

    with TestClient(app) as client:
        resp = client.post("/api/settings/agent-models", json={"agents": {"assistant": {"baseUrl": "https://example.com/api", "model": "demo", "apiKey": "secret-key"}}})

    assert resp.status_code == 200
    body = resp.json()
    assert "secret-key" not in str(body)
    assert "apiKeyEncrypted" not in str(body)
    assistant = next(a for a in body["agents"] if a["id"] == "assistant")
    assert assistant["apiKeyConfigured"] is True


def test_agent_model_settings_api_rejects_key_without_master_key(monkeypatch):
    import agent_model_settings as mod
    from main import app

    monkeypatch.setattr(mod.settings, "model_config_master_key", "")
    clear_agent_model_setting()

    with TestClient(app) as client:
        resp = client.post("/api/settings/agent-models", json={"agents": {"assistant": {"apiKey": "secret-key"}}})

    assert resp.status_code == 400
    assert "MODEL_CONFIG_MASTER_KEY" in resp.json()["detail"]


def test_resolve_model_config_falls_back_to_env(monkeypatch):
    import agent_model_settings as mod

    clear_agent_model_setting()
    monkeypatch.setattr(mod.settings, "llm_api_key", "env-key")
    monkeypatch.setattr(mod.settings, "llm_base_url", "https://env.example/api")
    monkeypatch.setattr(mod.settings, "llm_model", "env-model")

    resolved = mod.resolve_model_config_for_agent("assistant")

    assert resolved.api_key == "env-key"
    assert resolved.base_url == "https://env.example/api"
    assert resolved.model == "env-model"


def test_base_agent_uses_agent_model_config(monkeypatch):
    import agent_model_settings as mod
    import runtime.base_agent as base_agent
    from agents.assistant_agent import AssistantAgent

    monkeypatch.setattr(mod.settings, "model_config_master_key", "test-master-key")
    clear_agent_model_setting()
    mod.save_agent_model_settings({"agents": {"assistant": {"baseUrl": "https://agent.example/api", "model": "agent-model", "apiKey": "agent-key"}}})

    captured = {}

    class FakeProvider:
        def __init__(self, api_key: str, base_url: str, default_model: str):
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            captured["default_model"] = default_model

    monkeypatch.setattr(base_agent, "ArkProvider", FakeProvider)

    AssistantAgent()

    assert captured == {
        "api_key": "agent-key",
        "base_url": "https://agent.example/api",
        "default_model": "agent-model",
    }

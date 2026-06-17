import json
from pathlib import Path


def test_save_global_prompt_settings_roundtrip(tmp_path, monkeypatch):
    import global_prompt_settings as mod

    settings_path = tmp_path / "global-prompt-settings.local.json"
    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", settings_path)

    saved = mod.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    assert saved == {"enabled": True, "prompt": "全局规则"}
    assert mod.load_global_prompt_settings() == saved
    assert json.loads(settings_path.read_text(encoding="utf-8")) == saved


def test_global_prompt_truncates_too_long_prompt(tmp_path, monkeypatch):
    import global_prompt_settings as mod

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")
    monkeypatch.setattr(mod, "MAX_GLOBAL_PROMPT_CHARS", 5)

    saved = mod.save_global_prompt_settings({"enabled": True, "prompt": "123456789"})

    assert saved["prompt"] == "12345"


def test_build_global_prompt_for_agent(tmp_path, monkeypatch):
    import global_prompt_settings as mod

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")
    mod.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    assert "全局规则" in mod.build_global_prompt_for_agent("assistant")
    assert mod.build_global_prompt_for_agent("echo") == ""


def test_build_global_prompt_settings_response(tmp_path, monkeypatch):
    import global_prompt_settings as mod

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")
    mod.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    body = mod.build_global_prompt_settings_response()
    agents = {a["id"]: a for a in body["agents"]}

    assert body["enabled"] is True
    assert body["prompt"] == "全局规则"
    assert agents["assistant"]["supportsGlobalPrompt"] is True
    assert agents["research"]["supportsGlobalPrompt"] is True
    assert agents["claude-sdk"]["supportsGlobalPrompt"] is True
    assert agents["echo"]["supportsGlobalPrompt"] is False


def test_global_prompt_settings_api_roundtrip(tmp_path, monkeypatch):
    import global_prompt_settings as mod
    from fastapi.testclient import TestClient
    from main import app

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")

    with TestClient(app) as client:
        resp = client.get("/api/settings/global-prompt")
        assert resp.status_code == 200
        body = resp.json()
        assert body["enabled"] is False
        assert body["prompt"] == ""

        resp = client.post("/api/settings/global-prompt", json={"enabled": True, "prompt": "全局规则"})
        assert resp.status_code == 200
        body = resp.json()
        agents = {a["id"]: a for a in body["agents"]}
        assert body["enabled"] is True
        assert body["prompt"] == "全局规则"
        assert agents["assistant"]["supportsGlobalPrompt"] is True
        assert agents["echo"]["supportsGlobalPrompt"] is False

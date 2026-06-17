import json
from pathlib import Path


def clear_global_prompt_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "global_prompt")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_app_settings_table_stores_global_prompt():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        db.merge(AppSettingModel(setting_key="global_prompt", setting_value={"enabled": True, "prompt": "规则"}))
        db.commit()
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == {"enabled": True, "prompt": "规则"}
    finally:
        db.close()



def test_save_global_prompt_settings_roundtrip(tmp_path, monkeypatch):
    import global_prompt_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "global-prompt-settings.local.json")
    clear_global_prompt_setting()

    saved = mod.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    assert saved == {"enabled": True, "prompt": "全局规则"}
    assert mod.load_global_prompt_settings() == saved
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_global_prompt_imports_legacy_json(tmp_path, monkeypatch):
    import global_prompt_settings as mod
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    settings_path = tmp_path / "global-prompt-settings.local.json"
    settings_path.write_text(json.dumps({"enabled": True, "prompt": "旧规则"}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "GLOBAL_PROMPT_SETTINGS_PATH", settings_path)
    clear_global_prompt_setting()

    loaded = mod.load_global_prompt_settings()

    assert loaded == {"enabled": True, "prompt": "旧规则"}
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "global_prompt")
        assert row.setting_value == loaded
    finally:
        db.close()



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
    clear_global_prompt_setting()

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

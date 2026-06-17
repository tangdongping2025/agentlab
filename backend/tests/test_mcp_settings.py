from pathlib import Path


def clear_mcp_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_default_mcp_settings_when_file_missing(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "missing.json")
    clear_mcp_setting()
    settings = load_mcp_settings()
    assert settings["servers"]["amap-maps"]["enabled"] is True
    assert settings["servers"]["amap-maps"]["agentIds"] == ["claude-sdk"]
    assert settings["servers"]["amap-maps"]["launchMode"] == "auto"


def test_save_mcp_settings_filters_unknown_and_secret(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings, save_mcp_settings
    path = tmp_path / "mcp-settings.local.json"
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", path)
    clear_mcp_setting()
    save_mcp_settings({
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk", "unknown"],
                "launchMode": "npx",
                "env": {"AMAP_MAPS_API_KEY": "leak"},
                "apiKey": "leak",
            },
            "unknown-server": {"enabled": True},
        }
    })
    saved = load_mcp_settings()
    assert saved == {
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk"],
                "launchMode": "npx",
            }
        }
    }
    assert not path.exists()
    assert "leak" not in str(saved)


def test_save_mcp_settings_writes_app_settings(tmp_path, monkeypatch):
    import mcp_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "mcp-settings.local.json"
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", legacy_path)
    clear_mcp_setting()

    saved = mod.save_mcp_settings({"servers": {"amap-maps": {"enabled": False, "agentIds": ["assistant"], "launchMode": "npx"}}})

    assert legacy_path.exists() is False
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_mcp_settings_imports_legacy_json(tmp_path, monkeypatch):
    import json
    import mcp_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "mcp-settings.local.json"
    legacy_path.write_text(json.dumps({"servers": {"amap-maps": {"enabled": False, "agentIds": ["assistant"], "launchMode": "bundled"}}}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", legacy_path)
    clear_mcp_setting()

    loaded = mod.load_mcp_settings()

    assert loaded["servers"]["amap-maps"]["enabled"] is False
    assert loaded["servers"]["amap-maps"]["agentIds"] == ["assistant"]
    assert loaded["servers"]["amap-maps"]["launchMode"] == "bundled"
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "mcp_settings")
        assert row.setting_value == loaded
    finally:
        db.close()


def test_mcp_settings_accepts_base_agent_ids(monkeypatch, tmp_path):
    import mcp_settings as mod
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    clear_mcp_setting()
    body = mod.save_mcp_settings({
        "servers": {
            "amap-maps": {
                "enabled": True,
                "agentIds": ["claude-sdk", "assistant", "research", "echo", "unknown"],
                "launchMode": "auto",
            }
        }
    })
    assert body["servers"]["amap-maps"]["agentIds"] == ["claude-sdk", "assistant", "research"]


def test_mcp_settings_api_roundtrip(client, tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    clear_mcp_setting()
    resp = client.get("/api/settings/mcp")
    assert resp.status_code == 200
    body = resp.json()
    assert body["servers"][0]["id"] == "amap-maps"
    assert body["servers"][0]["secretEnv"] == "AMAP_MAPS_API_KEY"
    assert "secretValue" not in body["servers"][0]

    resp = client.post("/api/settings/mcp", json={
        "servers": {
            "amap-maps": {
                "enabled": False,
                "agentIds": ["claude-sdk"],
                "launchMode": "bundled",
                "apiKey": "must-not-save",
            }
        }
    })
    assert resp.status_code == 200
    body = resp.json()
    server = body["servers"][0]
    assert server["enabled"] is False
    assert server["launchMode"] == "bundled"


def test_mcp_diagnose_does_not_leak_secret(client, monkeypatch, tmp_path):
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "secret-value")
    clear_mcp_setting()
    resp = client.post("/api/settings/mcp/diagnose")
    assert resp.status_code == 200
    body = resp.json()
    text = str(body)
    assert body["servers"][0]["secretConfigured"] is True
    assert "secret-value" not in text

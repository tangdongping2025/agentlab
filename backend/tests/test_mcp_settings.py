from pathlib import Path


def test_default_mcp_settings_when_file_missing(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "missing.json")
    settings = load_mcp_settings()
    assert settings["servers"]["amap-maps"]["enabled"] is True
    assert settings["servers"]["amap-maps"]["agentIds"] == ["claude-sdk"]
    assert settings["servers"]["amap-maps"]["launchMode"] == "auto"


def test_save_mcp_settings_filters_unknown_and_secret(tmp_path, monkeypatch):
    from mcp_settings import load_mcp_settings, save_mcp_settings
    path = tmp_path / "mcp-settings.local.json"
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", path)
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
    assert "leak" not in path.read_text(encoding="utf-8")


def test_mcp_settings_api_roundtrip(client, tmp_path, monkeypatch):
    monkeypatch.setattr("mcp_settings.MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
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
    resp = client.post("/api/settings/mcp/diagnose")
    assert resp.status_code == 200
    body = resp.json()
    text = str(body)
    assert body["servers"][0]["secretConfigured"] is True
    assert "secret-value" not in text

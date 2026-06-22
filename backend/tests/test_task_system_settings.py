from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT


def clear_task_system_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "task_system")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_save_task_system_settings_roundtrip():
    import task_system_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    clear_task_system_setting()

    saved = mod.save_task_system_settings({"enabled": True, "content": "自定义任务指令"})

    assert saved == {"enabled": True, "content": "自定义任务指令"}
    assert mod.load_task_system_settings() == saved
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "task_system")
        assert row.setting_value == saved
    finally:
        db.close()


def test_task_system_truncates_too_long_content(monkeypatch):
    import task_system_settings as mod

    clear_task_system_setting()
    monkeypatch.setattr(mod, "MAX_TASK_SYSTEM_CHARS", 5)

    saved = mod.save_task_system_settings({"enabled": True, "content": "123456789"})

    assert saved["content"] == "12345"


def test_build_task_system_for_agent():
    import task_system_settings as mod

    clear_task_system_setting()
    mod.save_task_system_settings({"enabled": True, "content": "  自定义任务指令  "})

    assert mod.build_task_system_for_agent("claude-sdk") == "自定义任务指令"
    assert mod.build_task_system_for_agent("echo") is None

    mod.save_task_system_settings({"enabled": False, "content": "自定义任务指令"})
    assert mod.build_task_system_for_agent("claude-sdk") is None


def test_build_task_system_settings_response():
    import task_system_settings as mod

    clear_task_system_setting()
    mod.save_task_system_settings({"enabled": True, "content": "自定义任务指令"})

    body = mod.build_task_system_settings_response()
    agents = {a["id"]: a for a in body["agents"]}

    assert body["enabled"] is True
    assert body["content"] == "自定义任务指令"
    assert body["defaultPreview"] == _DEFAULT_SYSTEM_PROMPT[:200]
    assert agents["claude-sdk"]["supportsTaskSystem"] is True
    assert agents["assistant"]["supportsTaskSystem"] is False


def test_task_system_settings_api_roundtrip():
    from fastapi.testclient import TestClient
    from main import app

    clear_task_system_setting()

    with TestClient(app) as client:
        resp = client.get("/api/settings/task-system")
        assert resp.status_code == 200
        body = resp.json()
        assert body["enabled"] is False
        assert body["content"] == ""
        assert body["defaultPreview"] == _DEFAULT_SYSTEM_PROMPT[:200]

        resp = client.post("/api/settings/task-system", json={"enabled": True, "content": "自定义任务指令"})
        assert resp.status_code == 200
        body = resp.json()
        agents = {a["id"]: a for a in body["agents"]}
        assert body["enabled"] is True
        assert body["content"] == "自定义任务指令"
        assert agents["claude-sdk"]["supportsTaskSystem"] is True
        assert agents["assistant"]["supportsTaskSystem"] is False

def test_memory_preview_returns_five_segments_and_tools(tmp_path, monkeypatch):
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    gp.save_global_prompt_settings({"enabled": True, "prompt": "全局规则"})

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        resp = client.get("/api/settings/memory-preview")
        assert resp.status_code == 200
        data = resp.json()
        keys = [s["key"] for s in data["segments"]]
        assert keys == ["global", "task", "skill", "habit", "mcp"]
        assert data["totalChars"] == sum(s["chars"] for s in data["segments"])
        assert "Read" in data["tools"]["system"]
        assert isinstance(data["habits"], list)
        assert isinstance(data["knowledge"], list)
        assert data["globalPrompt"]["enabled"] is True
        for s in data["segments"]:
            assert {"key", "name", "enabled", "chars", "source", "preview"} <= set(s.keys())
        global_seg = next(s for s in data["segments"] if s["key"] == "global")
        assert "全局规则" in global_seg["preview"]
        assert global_seg["enabled"] is True
        task_seg = next(s for s in data["segments"] if s["key"] == "task")
        assert "coding 助手" in task_seg["preview"]


def test_memory_preview_lists_habits_and_knowledge(tmp_path, monkeypatch):
    import uuid
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    from database import SessionLocal, create_tables
    from models import InsightItemModel

    create_tables()
    hid, kid = str(uuid.uuid4()), str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.merge(InsightItemModel(id=hid, kind="habit", title="偏好A", description="d", status="accepted", enabled_for_prompt=True))
        db.merge(InsightItemModel(id=kid, kind="knowledge", title="知识B", description="d", status="accepted", enabled_for_prompt=False))
        db.commit()
    finally:
        db.close()

    from fastapi.testclient import TestClient
    from main import app

    try:
        with TestClient(app) as client:
            data = client.get("/api/settings/memory-preview").json()
            assert any(h["title"] == "偏好A" and h["enabledForPrompt"] is True for h in data["habits"])
            assert any(k["title"] == "知识B" for k in data["knowledge"])
    finally:
        db = SessionLocal()
        try:
            for rid in (hid, kid):
                row = db.get(InsightItemModel, rid)
                if row:
                    db.delete(row)
            db.commit()
        finally:
            db.close()


def test_memory_preview_skill_segment_lists_enabled_skills(tmp_path, monkeypatch):
    import global_prompt_settings as gp
    monkeypatch.setattr(gp, "GLOBAL_PROMPT_SETTINGS_PATH", tmp_path / "g.json")
    gp.save_global_prompt_settings({"enabled": True, "prompt": "x"})

    import memory_preview
    monkeypatch.setattr(memory_preview, "_skill_breakdown", lambda aid, cwd: [
        {"id": "buffett", "name": "buffett", "chars": 9831},
        {"id": "skill-creator", "name": "skill-creator", "chars": 12000},
    ])
    monkeypatch.setattr(memory_preview, "build_skill_prompt_for_agent", lambda aid, cwd: "x" * 21831)

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        data = client.get("/api/settings/memory-preview").json()
        skill_seg = next(s for s in data["segments"] if s["key"] == "skill")
        assert skill_seg["chars"] == 21831
        assert "buffett" in skill_seg["preview"]
        assert "skill-creator" in skill_seg["preview"]
        assert "9831" in skill_seg["preview"]
        assert "45%" in skill_seg["preview"]  # 9831/21831 ≈ 45%


def test_memory_preview_task_segment_uses_override(monkeypatch):
    import memory_preview as mp

    monkeypatch.setattr(mp, "build_task_system_for_agent", lambda aid: "我的任务指令", raising=False)
    resp = mp.build_memory_preview_response("claude-sdk")
    task_seg = next(s for s in resp["segments"] if s["key"] == "task")
    assert task_seg["preview"] == "我的任务指令"


def test_memory_preview_task_segment_falls_back_to_default(monkeypatch):
    import memory_preview as mp
    from runtime.claude_sdk_agent import _DEFAULT_SYSTEM_PROMPT

    monkeypatch.setattr(mp, "build_task_system_for_agent", lambda aid: None, raising=False)
    resp = mp.build_memory_preview_response("claude-sdk")
    task_seg = next(s for s in resp["segments"] if s["key"] == "task")
    assert task_seg["preview"] == _DEFAULT_SYSTEM_PROMPT[:200]

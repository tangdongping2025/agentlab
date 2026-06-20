from pathlib import Path


def clear_skill_setting():
    from database import create_tables, SessionLocal
    from models import AppSettingModel

    create_tables()
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        if row:
            db.delete(row)
            db.commit()
    finally:
        db.close()


def test_discover_skills_reads_allowed_markdown(monkeypatch, tmp_path):
    import skill_settings as mod
    root = tmp_path / "skills"
    skill_dir = root / "brainstorming"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("""---
name: brainstorming
description: 帮助澄清需求
---

# Brainstorming

先确认问题定义。
""", encoding="utf-8")
    monkeypatch.setattr(mod, "SKILL_DIRS", [root])

    skills = mod.discover_skills()

    assert [s["id"] for s in skills] == ["brainstorming"]
    assert skills[0]["name"] == "brainstorming"
    assert skills[0]["description"] == "帮助澄清需求"
    assert skills[0]["truncated"] is False


def test_discover_skills_reads_workspace_skills_directory(monkeypatch, tmp_path):
    import skill_settings as mod
    from config import settings

    monkeypatch.setattr(mod, "SKILL_DIRS", [])
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    cwd = tmp_path / "project"
    skill_dir = cwd / "skills" / "buffett"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("""---
name: buffett
description: 巴菲特投资分析
---

# Buffett

用长期主义分析企业。
""", encoding="utf-8")

    skills = mod.discover_skills(str(cwd))

    assert [s["id"] for s in skills] == ["buffett"]
    assert skills[0]["sourceType"] == "workspace"
    assert skills[0]["description"] == "巴菲特投资分析"


def test_discover_skills_reads_multiline_frontmatter_description(monkeypatch, tmp_path):
    import skill_settings as mod
    root = tmp_path / "skills"
    skill_dir = root / "buffett"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("""---
name: buffett
description: |
  Activates Warren Buffett's complete investment thinking system.
  Trigger whenever the topic involves investment analysis.
---

# Buffett
""", encoding="utf-8")
    monkeypatch.setattr(mod, "SKILL_DIRS", [root])

    skills = mod.discover_skills()

    assert skills[0]["description"] == "Activates Warren Buffett's complete investment thinking system.\nTrigger whenever the topic involves investment analysis."


def test_save_skill_settings_filters_unknowns(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    clear_skill_setting()
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})

    saved = mod.save_skill_settings({
        "skills": {
            "brainstorming": {"enabled": True, "agentIds": ["assistant", "echo", "unknown"], "secret": "leak"},
            "unknown-skill": {"enabled": True, "agentIds": ["assistant"]},
        }
    })

    assert saved == {"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}


def test_save_skill_settings_writes_app_settings(monkeypatch, tmp_path):
    import skill_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "skill-settings.local.json"
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", legacy_path)
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    clear_skill_setting()

    saved = mod.save_skill_settings({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}})

    assert legacy_path.exists() is False
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        assert row.setting_value == saved
    finally:
        db.close()


def test_load_skill_settings_imports_legacy_json(monkeypatch, tmp_path):
    import json
    import skill_settings as mod
    from database import SessionLocal
    from models import AppSettingModel

    legacy_path = tmp_path / "skill-settings.local.json"
    legacy_path.write_text(json.dumps({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", legacy_path)
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    clear_skill_setting()

    loaded = mod.load_skill_settings()

    assert loaded == {"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}
    db = SessionLocal()
    try:
        row = db.get(AppSettingModel, "skill_settings")
        assert row.setting_value == loaded
    finally:
        db.close()


def test_build_skill_prompt_for_agent(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    clear_skill_setting()
    monkeypatch.setattr(mod, "discover_skills", lambda: [{
        "id": "brainstorming",
        "name": "brainstorming",
        "description": "帮助澄清需求",
        "content": "# Brainstorming\n先确认问题定义。",
        "source": "test",
        "truncated": False,
    }])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})
    mod.save_skill_settings({"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}})

    prompt = mod.build_skill_prompt_for_agent("assistant")

    assert "[启用的 Skill: brainstorming]" in prompt
    assert "先确认问题定义" in prompt
    assert mod.build_skill_prompt_for_agent("research") == ""


def test_skill_settings_api_roundtrip(client, monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    clear_skill_setting()
    monkeypatch.setattr(mod, "discover_skills", lambda: [{
        "id": "brainstorming",
        "name": "brainstorming",
        "description": "帮助澄清需求",
        "content": "secret content should not be returned",
        "source": "test/SKILL.md",
        "truncated": False,
    }])

    resp = client.get("/api/settings/skills")
    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["id"] == "brainstorming"
    assert body["skills"][0]["description"] == "帮助澄清需求"
    assert body["skills"][0]["content"] == "secret content should not be returned"
    assert body["skills"][0]["sourceType"] == "platform"
    assert any(a["id"] == "assistant" and a["supportsSkill"] for a in body["agents"])

    resp = client.post("/api/settings/skills", json={
        "skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant", "echo"]}}
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["agentIds"] == ["assistant"]


def test_skill_settings_api_discovers_and_saves_workspace_skill(client, monkeypatch, tmp_path):
    import skill_settings as mod
    from config import settings

    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    monkeypatch.setattr(mod, "SKILL_DIRS", [])
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    clear_skill_setting()
    cwd = tmp_path / "project"
    skill_dir = cwd / ".claude" / "skills" / "repo-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("""---
name: repo-skill
description: 仓库内技能
---

# Repo Skill

只能手动启用。
""", encoding="utf-8")

    resp = client.get("/api/settings/skills", params={"cwd": str(cwd)})

    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["id"] == "repo-skill"
    assert body["skills"][0]["sourceType"] == "workspace"
    assert body["skills"][0]["enabled"] is False
    assert body["skills"][0]["agentIds"] == []

    resp = client.post("/api/settings/skills", params={"cwd": str(cwd)}, json={
        "skills": {"repo-skill": {"enabled": True, "agentIds": ["claude-sdk"]}}
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["id"] == "repo-skill"
    assert body["skills"][0]["enabled"] is True
    assert body["skills"][0]["agentIds"] == ["claude-sdk"]

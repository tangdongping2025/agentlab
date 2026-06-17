from pathlib import Path


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


def test_save_skill_settings_filters_unknowns(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
    monkeypatch.setattr(mod, "discover_skills", lambda: [{"id": "brainstorming", "name": "brainstorming", "description": "", "content": "x", "source": "", "truncated": False}])
    monkeypatch.setattr(mod, "_known_agent_ids", lambda: {"assistant", "research", "claude-sdk", "echo"})

    saved = mod.save_skill_settings({
        "skills": {
            "brainstorming": {"enabled": True, "agentIds": ["assistant", "echo", "unknown"], "secret": "leak"},
            "unknown-skill": {"enabled": True, "agentIds": ["assistant"]},
        }
    })

    assert saved == {"skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant"]}}}


def test_build_skill_prompt_for_agent(monkeypatch, tmp_path):
    import skill_settings as mod
    monkeypatch.setattr(mod, "SKILL_SETTINGS_PATH", tmp_path / "skill-settings.local.json")
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
    assert "content" not in body["skills"][0]
    assert any(a["id"] == "assistant" and a["supportsSkill"] for a in body["agents"])

    resp = client.post("/api/settings/skills", json={
        "skills": {"brainstorming": {"enabled": True, "agentIds": ["assistant", "echo"]}}
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["skills"][0]["agentIds"] == ["assistant"]

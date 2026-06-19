def test_build_habit_prompt_includes_only_enabled_habits(client, db):
    client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    enabled_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "重视验证和验收",
        "description": "完成判断需要可检查证据。",
        "sourceSessionIds": ["s2"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{enabled_id}", json={"enabledForPrompt": True})
    knowledge_id = client.post("/api/db/insights", json={
        "kind": "knowledge",
        "title": "知识库素材",
        "description": "不应注入提示词。",
        "sourceSessionIds": ["s3"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{knowledge_id}", json={"enabledForPrompt": True})

    from habit_prompt_settings import build_habit_prompt_for_agent
    prompt = build_habit_prompt_for_agent("assistant")

    assert "用户协作偏好" in prompt
    assert "重视验证和验收" in prompt
    assert "偏好先设计和计划" not in prompt
    assert "知识库素材" not in prompt


def test_build_habit_prompt_skips_unsupported_agent(client, db):
    insight_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "重视验证和验收",
        "description": "完成判断需要可检查证据。",
        "sourceSessionIds": ["s2"],
        "status": "accepted",
    }).json()["id"]
    client.patch(f"/api/db/insights/{insight_id}", json={"enabledForPrompt": True})

    from habit_prompt_settings import build_habit_prompt_for_agent
    assert build_habit_prompt_for_agent("echo") == ""

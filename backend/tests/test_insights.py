def test_create_and_list_insight_item(client, db):
    payload = {
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "多次提到设计、规格或计划。",
        "sourceSessionIds": ["s1", "s2"],
        "status": "accepted",
    }
    res = client.post("/api/db/insights", json=payload)
    assert res.status_code == 200
    created = res.json()
    assert created["kind"] == "habit"
    assert created["sourceSessionIds"] == ["s1", "s2"]

    listed = client.get("/api/db/insights").json()
    assert listed["items"][0]["title"] == "偏好先设计和计划"


def test_insight_defaults_disabled_for_prompt(client, db):
    res = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    assert res.status_code == 200
    assert res.json()["enabledForPrompt"] is False


def test_update_insight_enabled_for_prompt(client, db):
    insight_id = client.post("/api/db/insights", json={
        "kind": "habit",
        "title": "偏好先设计和计划",
        "description": "适合先明确方案再实现。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    }).json()["id"]

    patch = client.patch(f"/api/db/insights/{insight_id}", json={"enabledForPrompt": True})
    assert patch.status_code == 200
    assert patch.json()["enabledForPrompt"] is True

    listed = client.get("/api/db/insights").json()["items"]
    assert listed[0]["enabledForPrompt"] is True


def test_delete_insight_item(client, db):
    res = client.post("/api/db/insights", json={
        "kind": "knowledge",
        "title": "知识库素材",
        "description": "后续可整理为知识库素材。",
        "sourceSessionIds": ["s1"],
        "status": "accepted",
    })
    insight_id = res.json()["id"]

    delete_res = client.delete(f"/api/db/insights/{insight_id}")
    assert delete_res.status_code == 200
    assert client.get("/api/db/insights").json()["items"] == []

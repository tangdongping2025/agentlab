def test_create_uses_client_id(client, db):
    resp = client.post("/api/db/sessions", json={
        "id": "my-fixed-id", "name": "测试", "sceneId": "restaurant",
        "selectedTools": ["anysearch"], "contextStrategy": "sliding", "contextSize": 32768,
    })
    assert resp.status_code == 200
    assert resp.json()["id"] == "my-fixed-id"


def test_create_generates_id_when_absent(client, db):
    resp = client.post("/api/db/sessions", json={"name": "x"})
    assert resp.status_code == 200
    assert resp.json()["id"]  # 非空


def test_get_session_returns_full(client, db):
    sid = client.post("/api/db/sessions", json={"name": "s"}).json()["id"]
    got = client.get(f"/api/db/sessions/{sid}")
    assert got.status_code == 200
    assert got.json()["id"] == sid
    assert got.json()["messages"] == []


def test_get_missing_returns_404(client, db):
    assert client.get("/api/db/sessions/nope").status_code == 404


def test_list_sessions_orders_by_updated_desc(client, db):
    import time
    client.post("/api/db/sessions", json={"name": "a"})
    time.sleep(1.1)  # MySQL DATETIME 秒精度，需跨秒区分 updated_at
    client.post("/api/db/sessions", json={"name": "b"})
    resp = client.get("/api/db/sessions")
    assert resp.status_code == 200
    names = [s["name"] for s in resp.json()]
    assert names == ["b", "a"]


def test_list_includes_messages(client, db):
    # 先建空会话（本任务没 messages 端点，但 list 应返回 messages 数组结构）
    client.post("/api/db/sessions", json={"name": "s"})
    item = client.get("/api/db/sessions").json()[0]
    assert "messages" in item


def test_update_session_with_messages_and_total_tokens(client):
    sid = client.post("/api/db/sessions", json={"name": "s"}).json()["id"]
    resp = client.put(f"/api/db/sessions/{sid}", json={
        "messages": [
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "嗨", "tokenUsage": {"input": 10, "output": 20}},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["messages"]) == 2
    assert data["messages"][0]["content"] == "你好"
    assert data["totalTokens"] == 30  # 10 + 20


def test_update_missing_returns_404(client):
    resp = client.put("/api/db/sessions/nope", json={"name": "x"})
    assert resp.status_code == 404


def test_update_replaces_messages(client):
    sid = client.post("/api/db/sessions", json={"name": "s"}).json()["id"]
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": "旧"}]})
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": "新1"}, {"role": "user", "content": "新2"}]})
    got = client.get(f"/api/db/sessions/{sid}").json()
    assert len(got["messages"]) == 2  # 不是 3（_sync_messages 删旧重建）
    assert got["messages"][0]["content"] == "新1"


def test_delete_session_cascades_messages(client):
    sid = client.post("/api/db/sessions", json={"name": "s"}).json()["id"]
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": "x"}]})
    resp = client.delete(f"/api/db/sessions/{sid}")
    assert resp.status_code == 200
    assert resp.json() == {"deleted": sid}
    assert client.get(f"/api/db/sessions/{sid}").status_code == 404


def test_delete_missing_returns_404(client):
    assert client.delete("/api/db/sessions/nope").status_code == 404


def test_delete_all_sessions(client):
    client.post("/api/db/sessions", json={"name": "a"})
    client.post("/api/db/sessions", json={"name": "b"})
    resp = client.delete("/api/db/sessions")
    assert resp.status_code == 200
    assert resp.json() == {"deleted_all": True}
    assert client.get("/api/db/sessions").json() == []


def test_create_session_persists_agent_id(client, db):
    """create_session 带 agentId 落库,SessionOut 返回 agentId。"""
    resp = client.post("/api/db/sessions", json={"id": "s-create-agent", "agentId": "claude-sdk"})
    assert resp.status_code == 200
    assert resp.json()["agentId"] == "claude-sdk"
    import models
    got = db.get(models.SessionModel, "s-create-agent")
    assert got.agent_id == "claude-sdk"


def test_session_model_persists_agent_id(db):
    """SessionModel 能存取 agent_id(agent runtime 会话的 agent 标识)。"""
    import models
    sess = models.SessionModel(id="s-agent-test", agent_id="claude-sdk", total_tokens=0)
    db.add(sess)
    db.commit()
    got = db.query(models.SessionModel).filter_by(agent_id="claude-sdk").first()
    assert got is not None
    assert got.agent_id == "claude-sdk"


def test_session_model_agent_id_nullable(db):
    """老会话 agent_id 为 null(向后兼容)。"""
    import models
    sess = models.SessionModel(id="s-null-test", agent_id=None, total_tokens=0)
    db.add(sess)
    db.commit()
    got = db.get(models.SessionModel, "s-null-test")
    assert got.agent_id is None


def test_session_create_schema_has_agent_id():
    from schemas import SessionCreate, SessionUpdate
    c = SessionCreate(agentId="claude-sdk")
    assert c.agentId == "claude-sdk"
    u = SessionUpdate(agentId="echo")
    assert u.agentId == "echo"


def test_session_out_schema_has_agent_id():
    from schemas import SessionOut, SessionListItem
    o = SessionOut(id="s1", agentId="claude-sdk")
    assert o.agentId == "claude-sdk"
    li = SessionListItem(id="s1", agentId="claude-sdk", preview="x")
    assert li.agentId == "claude-sdk"


def test_session_create_with_cwd(client, db):
    resp = client.post("/api/db/sessions", json={"id": "s-cwd1", "agentId": "claude-sdk", "cwd": "D:/proj/x"})
    assert resp.status_code == 200
    assert resp.json()["cwd"] == "D:/proj/x"


def test_session_update_cwd(client, db):
    client.post("/api/db/sessions", json={"id": "s-cwd2"})
    resp = client.put("/api/db/sessions/s-cwd2", json={"cwd": "D:/proj/y"})
    assert resp.status_code == 200
    assert resp.json()["cwd"] == "D:/proj/y"
    assert client.get("/api/db/sessions/s-cwd2").json()["cwd"] == "D:/proj/y"


def test_session_update_cwd_history(client, db):
    client.post("/api/db/sessions", json={"id": "s-hist"})
    resp = client.put("/api/db/sessions/s-hist", json={"cwd": "D:/a", "cwdHistory": ["D:/a"]})
    assert resp.status_code == 200
    assert resp.json()["cwdHistory"] == ["D:/a"]
    resp = client.put("/api/db/sessions/s-hist", json={"cwd": "D:/b", "cwdHistory": ["D:/a", "D:/b"]})
    assert resp.json()["cwdHistory"] == ["D:/a", "D:/b"]

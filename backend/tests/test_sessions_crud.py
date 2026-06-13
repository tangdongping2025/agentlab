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

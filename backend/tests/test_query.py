def _make(client, name, scene, msgs):
    sid = client.post("/api/db/sessions", json={"name": name, "sceneId": scene}).json()["id"]
    if msgs:
        client.put(f"/api/db/sessions/{sid}", json={"messages": msgs})
    return sid


def test_query_returns_all_without_filter(client, db):
    _make(client, "s1", "restaurant", [])
    _make(client, "s2", "research", [])
    resp = client.get("/api/db/sessions/query")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["page"] == 1


def test_query_by_keyword(client, db):
    _make(client, "s1", "restaurant", [{"role": "user", "content": "今天天气真好"}])
    _make(client, "s2", "restaurant", [{"role": "user", "content": "股票行情分析"}])
    resp = client.get("/api/db/sessions/query", params={"q": "股票"})
    data = resp.json()
    assert resp.status_code == 200
    assert data["total"] == 1
    assert data["items"][0]["name"] == "s2"


def test_query_by_name_keyword(client, db):
    _make(client, "投资分析报告", "restaurant", [])
    resp = client.get("/api/db/sessions/query", params={"q": "投资"})
    assert resp.json()["total"] == 1


def test_query_by_scene(client, db):
    _make(client, "s1", "restaurant", [])
    _make(client, "s2", "research", [])
    resp = client.get("/api/db/sessions/query", params={"scene": "research"})
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["sceneId"] == "research"


def test_query_by_token_range(client, db):
    _make(client, "s1", "restaurant", [{"role": "assistant", "content": "x", "tokenUsage": {"input": 5, "output": 5}}])
    _make(client, "s2", "research", [{"role": "assistant", "content": "y", "tokenUsage": {"input": 100, "output": 100}}])
    resp = client.get("/api/db/sessions/query", params={"min_token": 50})
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "s2"


def test_query_pagination(client, db):
    for i in range(5):
        _make(client, f"s{i}", "restaurant", [])
    resp = client.get("/api/db/sessions/query", params={"page": 1, "size": 2})
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5


def test_query_combined_filters(client, db):
    _make(client, "s1", "restaurant", [{"role": "user", "content": "苹果"}])
    _make(client, "s2", "research", [{"role": "user", "content": "苹果"}])
    resp = client.get("/api/db/sessions/query", params={"q": "苹果", "scene": "research"})
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "s2"


def test_query_sessions_filter_by_agent(client, db):
    """query_session 的 agent 参数筛选 agent_id。"""
    import models
    db.add(models.SessionModel(id="q-a", agent_id="claude-sdk", total_tokens=0))
    db.add(models.SessionModel(id="q-b", agent_id="echo", total_tokens=0))
    db.add(models.SessionModel(id="q-old", agent_id=None, total_tokens=0))
    db.commit()
    resp = client.get("/api/db/sessions/query", params={"agent": "claude-sdk"})
    assert resp.status_code == 200
    ids = [it["id"] for it in resp.json()["items"]]
    assert "q-a" in ids
    assert "q-b" not in ids
    assert "q-old" not in ids


def test_query_sessions_no_agent_returns_all_including_null(client, db):
    """不传 agent 时不过滤(含 null 老会话)。"""
    import models
    db.add(models.SessionModel(id="q-all-a", agent_id="echo", total_tokens=0))
    db.add(models.SessionModel(id="q-all-old", agent_id=None, total_tokens=0))
    db.commit()
    resp = client.get("/api/db/sessions/query")
    ids = [it["id"] for it in resp.json()["items"]]
    assert "q-all-a" in ids
    assert "q-all-old" in ids

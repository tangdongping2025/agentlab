def test_migrate_inserts_and_dedups(client, db):
    payload = {"sessions": [
        {"id": "s1", "name": "a", "sceneId": "restaurant", "selectedTools": [],
         "messages": [{"role": "user", "content": "hi"}],
         "createdAt": "2026-06-01T00:00:00", "updatedAt": "2026-06-01T00:00:00"},
        {"id": "s2", "name": "b", "sceneId": "research", "selectedTools": [], "messages": []},
    ]}
    resp = client.post("/api/db/migrate", json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"imported": 2, "skipped": 0}
    assert len(client.get("/api/db/sessions").json()) == 2


def test_migrate_dedups_existing_ids(client, db):
    payload = {"sessions": [
        {"id": "s1", "name": "a", "selectedTools": [], "messages": []},
    ]}
    client.post("/api/db/migrate", json=payload)
    resp = client.post("/api/db/migrate", json=payload)
    assert resp.json() == {"imported": 0, "skipped": 1}


def test_migrate_imports_messages(client, db):
    payload = {"sessions": [
        {"id": "s1", "name": "a", "selectedTools": [],
         "messages": [{"role": "user", "content": "你好"}, {"role": "assistant", "content": "嗨", "tokenUsage": {"input": 10, "output": 20}}],
         "createdAt": "2026-06-01T00:00:00", "updatedAt": "2026-06-01T00:00:00"},
    ]}
    client.post("/api/db/migrate", json=payload)
    got = client.get("/api/db/sessions/s1").json()
    assert len(got["messages"]) == 2
    assert got["totalTokens"] == 30


def test_migrate_preserves_timestamps(client, db):
    payload = {"sessions": [
        {"id": "s1", "name": "a", "selectedTools": [], "messages": [],
         "createdAt": "2025-01-15T10:30:00", "updatedAt": "2025-02-20T14:00:00"},
    ]}
    client.post("/api/db/migrate", json=payload)
    got = client.get("/api/db/sessions/s1").json()
    assert got["createdAt"].startswith("2025-01-15")
    assert got["updatedAt"].startswith("2025-02-20")


def test_migrate_skips_missing_id(client, db):
    payload = {"sessions": [{"name": "no id", "selectedTools": [], "messages": []}]}
    resp = client.post("/api/db/migrate", json=payload)
    assert resp.json() == {"imported": 0, "skipped": 1}

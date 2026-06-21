from __future__ import annotations


def _create_session_with_messages(client, session_id="window-session", count=30):
    resp = client.post("/api/db/sessions", json={"id": session_id, "name": "window"})
    assert resp.status_code == 200
    messages = []
    for i in range(count):
        role = "user" if i % 2 == 0 else "assistant"
        messages.append({"role": role, "content": f"消息{i}"})
    resp = client.put(f"/api/db/sessions/{session_id}", json={"messages": messages})
    assert resp.status_code == 200
    return session_id


def test_get_session_messages_defaults_to_latest_12_in_ascending_seq(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages")

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == list(range(18, 30))
    assert [m["content"] for m in body["messages"]] == [f"消息{i}" for i in range(18, 30)]
    assert body["oldestSeq"] == 18
    assert body["newestSeq"] == 29
    assert body["hasMoreBefore"] is True
    assert body["hasMoreAfter"] is False
    assert body["total"] == 30


def test_get_session_messages_before_seq_returns_older_window(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?beforeSeq=18&limit=12")

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == list(range(6, 18))
    assert body["hasMoreBefore"] is True
    assert body["hasMoreAfter"] is True
    assert body["oldestSeq"] == 6
    assert body["newestSeq"] == 17


def test_get_session_messages_around_seq_includes_target(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?aroundSeq=4&limit=12")

    assert resp.status_code == 200
    body = resp.json()
    seqs = [m["seq"] for m in body["messages"]]
    assert 4 in seqs
    assert seqs == list(range(0, 12))
    assert body["hasMoreBefore"] is False
    assert body["hasMoreAfter"] is True


def test_get_session_messages_rejects_before_and_around_together(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/messages?beforeSeq=18&aroundSeq=4")

    assert resp.status_code == 400


def test_append_session_messages_adds_without_replacing_existing_history(client, db):
    sid = _create_session_with_messages(client, count=2)

    resp = client.post(f"/api/db/sessions/{sid}/messages", json={
        "messages": [
            {"role": "user", "content": "新增问题"},
            {"role": "assistant", "content": "新增回答", "tokenUsage": {"input": 3, "output": 4}},
        ]
    })

    assert resp.status_code == 200
    body = resp.json()
    assert [m["seq"] for m in body["messages"]] == [2, 3]
    got = client.get(f"/api/db/sessions/{sid}").json()
    assert [m["content"] for m in got["messages"]] == ["消息0", "消息1", "新增问题", "新增回答"]
    assert got["totalTokens"] == 7

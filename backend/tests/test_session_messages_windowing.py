from __future__ import annotations

import re
from unicodedata import east_asian_width

from sqlalchemy import event

from database import engine


def _display_width(text: str) -> int:
    return sum(2 if east_asian_width(ch) in {"F", "W"} else 1 for ch in text)


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


def test_get_session_messages_around_seq_missing_returns_404(client, db):
    sid = _create_session_with_messages(client, count=3)

    resp = client.get(f"/api/db/sessions/{sid}/messages?aroundSeq=99&limit=12")

    assert resp.status_code == 404


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


def test_message_index_returns_all_user_tasks_without_full_content(client, db):
    sid = _create_session_with_messages(client, count=30)

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 15
    assert body["items"][0]["messageSeq"] == 0
    assert body["items"][0]["role"] == "user"
    assert body["items"][0]["title"] == "消息0"
    assert body["items"][0]["preview"] == "消息0"
    assert "content" not in body["items"][0]
    assert body["items"][-1]["messageSeq"] == 28


def test_message_index_uses_lightweight_query_shape(client, db):
    sid = _create_session_with_messages(client, session_id="task-index-query-shape", count=4)
    statements = []

    def capture_sql(conn, cursor, statement, parameters, context, executemany):
        if "messages" in statement:
            statements.append(" ".join(statement.lower().split()))

    event.listen(engine, "before_cursor_execute", capture_sql)
    try:
        resp = client.get(f"/api/db/sessions/{sid}/message-index")
    finally:
        event.remove(engine, "before_cursor_execute", capture_sql)

    assert resp.status_code == 200
    message_index_sql = [s for s in statements if "substring" in s and " from messages " in s]
    assert message_index_sql, statements
    select_clause = message_index_sql[-1].split(" from ", 1)[0]
    select_without_substring = re.sub(r"substring\([^)]*\)", "substring(...)", select_clause)
    assert "substring(" in select_clause
    assert not re.search(r"messages\.`?content`?(?:\s+as\s+\w+)?\s*(?:,|$)", select_without_substring)
    assert "messages.payload" not in select_clause


def test_message_index_does_not_truncate_exact_display_width_boundaries(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-exact"}).json()["id"]
    client.put(f"/api/db/sessions/{sid}", json={"messages": [
        {"role": "user", "content": "中" * 18},
        {"role": "user", "content": "中" * 40},
    ]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    title_item, preview_item = resp.json()["items"]
    assert _display_width(title_item["title"]) == 36
    assert not title_item["title"].endswith("…")
    assert _display_width(preview_item["preview"]) == 80
    assert not preview_item["preview"].endswith("…")


def test_message_index_truncates_one_display_width_over_boundaries(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-over-one"}).json()["id"]
    client.put(f"/api/db/sessions/{sid}", json={"messages": [
        {"role": "user", "content": f"{'中' * 18}a"},
        {"role": "user", "content": f"{'中' * 40}a"},
    ]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    title_item, preview_item = resp.json()["items"]
    assert title_item["title"].endswith("…")
    assert _display_width(title_item["title"]) <= 36
    assert preview_item["preview"].endswith("…")
    assert _display_width(preview_item["preview"]) <= 80


def test_message_index_leading_whitespace_scan_limit_returns_marker(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-leading-space"}).json()["id"]
    long_text = f"{' ' * 600}正文"
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": long_text}]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    item = resp.json()["items"][0]
    assert item["title"] == "…"
    assert item["preview"] == "…"
    assert _display_width(item["title"]) <= 36
    assert _display_width(item["preview"]) <= 80


def test_message_index_includes_timestamp(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-timestamp"}).json()["id"]
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": "有时间"}]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    assert resp.json()["items"][0]["timestamp"]


def test_message_index_truncates_long_title_and_preview(client, db):
    sid = client.post("/api/db/sessions", json={"id": "task-index-long"}).json()["id"]
    long_text = f"{'这是一条非常长的用户任务' * 20}\n第二行不进标题"
    client.put(f"/api/db/sessions/{sid}", json={"messages": [{"role": "user", "content": long_text}]})

    resp = client.get(f"/api/db/sessions/{sid}/message-index")

    item = resp.json()["items"][0]
    assert item["title"].endswith("…")
    assert len(item["title"]) <= 37
    assert _display_width(item["title"]) <= 36
    assert item["preview"].startswith("这是一条非常长")
    assert item["preview"].endswith("…")
    assert len(item["preview"]) <= 80
    assert _display_width(item["preview"]) <= 80

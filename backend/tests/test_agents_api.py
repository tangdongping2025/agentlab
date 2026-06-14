import json
import pytest


def test_list_agents_includes_echo(client):
    import agents  # 触发注册
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert "echo" in ids


def test_get_agent_metadata(client):
    import agents
    resp = client.get("/api/agents/echo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "echo"
    assert body["workspace"] == {"type": "chat"}


def test_get_unknown_agent_404(client):
    resp = client.get("/api/agents/nonexistent")
    assert resp.status_code == 404


def test_run_echo_returns_sse_stream(client):
    import agents
    resp = client.post(
        "/api/agents/echo/run",
        json={"messages": [{"role": "user", "content": "你好"}]},
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
    body = resp.text
    assert "你好" in body
    assert '"done"' in body or '"type": "done"' in body

import json
import pytest
from unittest.mock import patch
from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage


def test_list_agents_prioritizes_claude_sdk_and_excludes_echo(client):
    import agents  # 触发注册
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    body = resp.json()
    ids = [a["id"] for a in body]
    assert body[0]["id"] == "claude-sdk"
    assert body[0]["name"] == "龙虾 Agent"
    assert body[0]["description"] == "会使用工具、读写文件、执行命令并观察结果的行动型智能体"
    assert "echo" not in ids


def test_get_echo_agent_404(client):
    import agents
    resp = client.get("/api/agents/echo")
    assert resp.status_code == 404


def test_get_unknown_agent_404(client):
    resp = client.get("/api/agents/nonexistent")
    assert resp.status_code == 404


def test_run_echo_returns_404(client):
    import agents
    resp = client.post(
        "/api/agents/echo/run",
        json={"messages": [{"role": "user", "content": "你好"}]},
    )
    assert resp.status_code == 404


async def _fake_query_for_sse(*, prompt, options=None, transport=None):
    yield AssistantMessage(content=[TextBlock(text="集成PONG")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=1, duration_api_ms=1,
        is_error=False, num_turns=1, session_id="s",
        usage={"input_tokens": 1, "output_tokens": 1},
    )


def test_run_claude_sdk_returns_sse_stream(client):
    import agents
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_for_sse):
        resp = client.post(
            "/api/agents/claude-sdk/run",
            json={"messages": [{"role": "user", "content": "ping"}]},
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
    body = resp.text
    assert "集成PONG" in body
    assert '"type": "done"' in body or '"done"' in body


def test_list_agents_includes_claude_sdk(client):
    import agents
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert "claude-sdk" in ids


def test_run_claude_sdk_accepts_session_id(client):
    import agents
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.events import EventType

    seen = {}

    async def capture_run(self, task, emit):
        seen["sessionId"] = task.sessionId
        await emit.emit(EventType.TEXT, text="ok")
        await emit.emit_done()

    with patch.object(ClaudeSdkAgent, "run", new=capture_run):
        resp = client.post(
            "/api/agents/claude-sdk/run",
            json={"sessionId": "session-123", "messages": [{"role": "user", "content": "ping"}]},
        )
        body = resp.text

    assert resp.status_code == 200
    assert "ok" in body
    assert seen["sessionId"] == "session-123"


def test_run_endpoint_returns_detail_and_category_on_startup_exception(client, monkeypatch):
    """SSE 建立前异常 → 500 JSON {detail, category}。"""
    import agents  # 触发注册

    async def boom_run_agent(agent, task):
        raise RuntimeError("startup blew up")

    monkeypatch.setattr("routers.agents.run_agent", boom_run_agent)

    resp = client.post(
        "/api/agents/claude-sdk/run",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 500
    body = resp.json()
    assert "startup blew up" in body["detail"]
    assert body["category"] == "internal"


def test_claude_sdk_metadata_includes_memory_tab(client):
    import agents  # 触发注册
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    lobster = next(a for a in resp.json() if a["id"] == "claude-sdk")
    assert "记忆" in lobster["workspace"]["tabs"]

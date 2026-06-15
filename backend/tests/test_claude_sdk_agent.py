from unittest.mock import patch
from claude_agent_sdk import (
    AssistantMessage,
    TextBlock,
    ResultMessage,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
)

from runtime.agent import AgentTask
from runtime.events import EventEmitter, EventType


def test_claude_sdk_agent_registered():
    import agents  # 触发注册
    from runtime.registry import get_agent_class
    assert get_agent_class("claude-sdk") is not None


def test_claude_sdk_agent_metadata():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    assert agent is not None
    m = agent.metadata
    assert m.id == "claude-sdk"
    assert m.workspace == {"type": "chat"}
    assert m.capabilities  # 非空,声明能力


async def _fake_query_text_only(*, prompt, options=None, transport=None):
    yield AssistantMessage(content=[TextBlock(text="PONG")], model="glm-5.2")
    yield ResultMessage(
        subtype="success",
        duration_ms=100,
        duration_api_ms=90,
        is_error=False,
        num_turns=1,
        session_id="s1",
        usage={"input_tokens": 10, "output_tokens": 5},
    )


async def test_run_maps_text_done_token_usage():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_text_only):
        await agent.run(
            AgentTask(messages=[{"role": "user", "content": "ping"}]),
            emit,
        )
    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.TEXT in types
    assert EventType.DONE in types
    assert EventType.TOKEN_USAGE in types
    text_evt = next(e for e in events if e.type == EventType.TEXT)
    assert text_evt.data.get("text") == "PONG"
    usage_evt = next(e for e in events if e.type == EventType.TOKEN_USAGE)
    assert usage_evt.data.get("input_tokens") == 10
    assert usage_evt.data.get("output_tokens") == 5


async def _fake_query_with_tools(*, prompt, options=None, transport=None):
    # Claude 自主跑了一轮工具:先思考,调 Bash,拿结果,再回复
    yield AssistantMessage(
        content=[
            ThinkingBlock(thinking="要看目录", signature="sig"),
            ToolUseBlock(id="t1", name="Bash", input={"command": "ls"}),
        ],
        model="glm-5.2",
    )
    yield AssistantMessage(
        content=[
            ToolResultBlock(tool_use_id="t1", content="sample.py\nREADME.md"),
        ],
        model="glm-5.2",
    )
    yield AssistantMessage(content=[TextBlock(text="目录里有 sample.py")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=200, duration_api_ms=180,
        is_error=False, num_turns=2, session_id="s2",
        usage={"input_tokens": 50, "output_tokens": 20},
    )


async def test_run_maps_thinking_tool_call_tool_result():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_with_tools):
        await agent.run(
            AgentTask(messages=[{"role": "user", "content": "目录有啥"}]),
            emit,
        )
    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.THINKING in types
    assert EventType.TOOL_CALL in types
    assert EventType.TOOL_RESULT in types
    think_evt = next(e for e in events if e.type == EventType.THINKING)
    assert "看目录" in think_evt.data.get("thinking", "")
    call_evt = next(e for e in events if e.type == EventType.TOOL_CALL)
    assert call_evt.data.get("name") == "Bash"
    assert call_evt.data.get("params") == {"command": "ls"}
    res_evt = next(e for e in events if e.type == EventType.TOOL_RESULT)
    assert "sample.py" in res_evt.data.get("result", "")


async def _fake_query_raises(*, prompt, options=None, transport=None):
    raise RuntimeError("boom")
    yield  # 让它成为 async generator


async def _fake_query_error_result(*, prompt, options=None, transport=None):
    yield ResultMessage(
        subtype="error_max_turns", duration_ms=1, duration_api_ms=1,
        is_error=True, num_turns=10, session_id="s3",
        result="超过最大轮数",
    )


async def test_run_emits_error_on_query_exception():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_raises):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)


async def test_run_emits_error_on_failed_result():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_error_result):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert "error_max_turns" in err.data.get("error", "")

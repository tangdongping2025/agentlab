import pytest

from unittest.mock import patch
from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage

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

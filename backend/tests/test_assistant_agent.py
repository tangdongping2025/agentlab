import pytest
from unittest.mock import patch

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.registry import get_agent_class, create_agent


def test_assistant_registered():
    import agents  # 触发注册
    assert get_agent_class("assistant") is not None


async def test_assistant_emits_text_from_provider():
    import agents  # noqa
    from runtime.events import EventEmitter
    from infra.llm.base import LLMMessage, StreamEvent

    agent = create_agent("assistant")
    emit = EventEmitter()

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=EventType.TEXT, text="你")
        yield StreamEvent(type=EventType.TEXT, text="好")
        yield StreamEvent(type=EventType.DONE, usage={"input_tokens": 5, "output_tokens": 2})

    with patch.object(agent, "_provider") as mock_prov:
        mock_prov.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    texts = "".join(e.data.get("text", "") for e in events if e.type == EventType.TEXT)
    assert "你好" in texts
    assert events[-1].type == EventType.DONE


async def test_assistant_emits_error_on_provider_failure():
    import agents  # noqa
    from runtime.events import EventEmitter

    agent = create_agent("assistant")
    emit = EventEmitter()

    async def failing_stream(messages, **kw):
        raise RuntimeError("provider down")
        yield  # 让它成为 async generator

    with patch.object(agent, "_provider") as mock_prov:
        mock_prov.stream = failing_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)

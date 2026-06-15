import pytest
from unittest.mock import patch, AsyncMock
from runtime.agent import AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from infra.llm.base import LLMMessage, StreamEvent, EventType as LLMEventType


async def test_apply_strategy_sliding():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content=f"msg{i}") for i in range(15)]
    after, effect = await agent._apply_strategy(msgs, "sliding")
    assert effect["strategy"] == "sliding"
    assert effect["after_count"] == 10
    assert effect["before_count"] == 15
    assert len(effect["beforeMessages"]) == 15
    assert len(effect["afterMessages"]) == 10


async def test_apply_strategy_none():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(5)]
    after, effect = await agent._apply_strategy(msgs, "none")
    assert effect["after_count"] == 1
    assert effect["triggered"] is True


async def test_apply_strategy_full_no_change():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    msgs = [LLMMessage(role="user", content="x") for _ in range(8)]
    after, effect = await agent._apply_strategy(msgs, "full")
    assert effect["after_count"] == 8
    assert effect["triggered"] is False


async def test_run_emits_strategy_effect_and_token_usage():
    from runtime.base_agent import BaseAgent

    class _DummyAgent(BaseAgent):
        metadata = AgentMetadata(id="dummy", name="Dummy", description="", workspace={"type": "chat"})
        tool_names = []
        system_prompt = ""

    agent = _DummyAgent.__new__(_DummyAgent)
    agent._tool_defs = []
    agent._tool_map = {}
    emit = EventEmitter()

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=LLMEventType.TEXT, text="回复")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 12, "output_tokens": 3})

    with patch.object(agent, "_provider", create=True) as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}], config={}), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.ACTION in types
    action_ev = next(e for e in events if e.type == EventType.ACTION)
    assert action_ev.data.get("action") == "strategy_effect"
    assert EventType.TOKEN_USAGE in types
    tu = next(e for e in events if e.type == EventType.TOKEN_USAGE)
    assert tu.data.get("input_tokens") == 12
    assert events[-1].type == EventType.DONE

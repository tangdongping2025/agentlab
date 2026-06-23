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


async def test_apply_strategy_summary():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    agent._generate_summary = AsyncMock(return_value="摘要内容")
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(8)]  # > threshold 6
    after, effect = await agent._apply_strategy(msgs, "summary")
    assert effect["strategy"] == "summary"
    assert effect["triggered"] is True
    assert effect["summary"] == "摘要内容"
    assert effect["summarySourceCount"] == 4  # 8 - recent 4
    assert len(after) == 5  # 摘要 1 条 + recent 4 条
    agent._generate_summary.assert_awaited_once()


async def test_apply_strategy_summary_below_threshold():
    from runtime.base_agent import BaseAgent
    agent = BaseAgent.__new__(BaseAgent)
    agent._generate_summary = AsyncMock(return_value="不应被调用")
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(5)]  # <= threshold 6
    after, effect = await agent._apply_strategy(msgs, "summary")
    assert effect["triggered"] is False
    assert effect["summary"] is None
    agent._generate_summary.assert_not_awaited()
    assert len(after) == 5


async def test_run_emits_network_category_on_connection_error():
    """provider.stream 抛 ConnectionError → catch-all emit_error 带 category='network'。"""
    from runtime.base_agent import BaseAgent

    class _DummyAgent(BaseAgent):
        metadata = AgentMetadata(id="dummy", name="Dummy", description="", workspace={"type": "chat"})
        tool_names = []
        system_prompt = ""

    agent = _DummyAgent.__new__(_DummyAgent)
    agent._tool_defs = []
    agent._tool_map = {}
    emit = EventEmitter()

    async def raising_stream(messages, **kw):
        raise ConnectionError("connection refused")
        yield  # noqa: never reached,保持 async generator 签名

    with patch.object(agent, "_provider", create=True) as mp:
        mp.stream = raising_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}], config={}), emit)

    events = [e async for e in emit]
    error_events = [e for e in events if e.type == EventType.ERROR]
    assert len(error_events) == 1
    assert error_events[0].data["category"] == "network"
    assert "ConnectionError" in error_events[0].data["error"]

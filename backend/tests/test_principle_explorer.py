import pytest
from unittest.mock import patch, AsyncMock
from runtime.agent import AgentTask
from runtime.events import EventType


async def test_apply_strategy_sliding():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content=f"msg{i}") for i in range(15)]
    after, effect = await agent._apply_strategy(msgs, "sliding")
    assert effect["strategy"] == "sliding"
    assert effect["removed_count"] == 5
    assert len(after) == 10


async def test_apply_strategy_none():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(5)]
    after, effect = await agent._apply_strategy(msgs, "none")
    assert len(after) == 1
    assert effect["removed_count"] == 4


async def test_apply_strategy_full():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    msgs = [LLMMessage(role="user", content="x") for _ in range(8)]
    after, effect = await agent._apply_strategy(msgs, "full")
    assert len(after) == 8
    assert effect["removed_count"] == 0


async def test_run_emits_strategy_effect_and_text():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import StreamEvent, EventType as LLMEventType
    from runtime.events import EventEmitter

    agent = PrincipleExplorerAgent()
    emit = EventEmitter()

    async def fake_stream(messages, **kw):
        yield StreamEvent(type=LLMEventType.TEXT, text="回复")
        yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 5, "output_tokens": 2})

    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(
            messages=[{"role": "user", "content": "hi"}],
            config={"strategy": "sliding"},
        ), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.ACTION in types
    action_ev = next(e for e in events if e.type == EventType.ACTION)
    assert action_ev.data.get("action") == "strategy_effect"
    assert action_ev.data.get("strategy") == "sliding"
    assert events[-1].type == EventType.DONE


async def test_apply_strategy_summary_triggers_generate_summary():
    from agents.principle_explorer_agent import PrincipleExplorerAgent
    from infra.llm.base import LLMMessage
    agent = PrincipleExplorerAgent()
    agent._generate_summary = AsyncMock(return_value="摘要内容")
    msgs = [LLMMessage(role="user", content=f"m{i}") for i in range(10)]
    after, effect = await agent._apply_strategy(msgs, "summary")
    assert effect["summary"] == "摘要内容"
    assert effect["removed_count"] == 6  # 10 - recent(4)
    agent._generate_summary.assert_called_once()

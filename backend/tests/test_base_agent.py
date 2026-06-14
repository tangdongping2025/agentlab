import pytest

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.tools.registry import _TOOL_REGISTRY


class _FakeSearchTool:
    name = "search"
    description = "search"
    input_schema = {"type": "object"}
    async def execute(self, **params):
        return f"结果: {params.get('query')}"


async def test_base_agent_tool_use_loop_stream():
    """模拟 stream:LLM 第1轮 tool_use,第2轮最终回复。"""
    from runtime.base_agent import BaseAgent
    from infra.llm.base import StreamEvent, EventType as LLMEventType

    class _TestAgent(BaseAgent):
        from runtime.agent import AgentMetadata
        metadata = AgentMetadata(id="_base_test", name="T", description="d", workspace={"type": "chat"})
        tool_names = ["search"]
        system_prompt = "你是测试"

    _TOOL_REGISTRY["search"] = _FakeSearchTool()
    agent = _TestAgent()
    agent._tool_map = {"search": _FakeSearchTool()}

    call_count = [0]
    async def fake_stream(messages, **kw):
        call_count[0] += 1
        if call_count[0] == 1:
            yield StreamEvent(type=LLMEventType.TEXT, text="我搜一下")
            yield StreamEvent(type=LLMEventType.TOOL_USE, tool_name="search", tool_input={"query": "AI"}, tool_id="t1")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 5, "output_tokens": 3})
        else:
            yield StreamEvent(type=LLMEventType.TEXT, text="AI 是人工智能")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 8, "output_tokens": 5})

    from unittest.mock import patch
    from runtime.events import EventEmitter
    emit = EventEmitter()
    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "什么是AI"}]), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.TOOL_CALL in types
    assert EventType.TOOL_RESULT in types
    assert EventType.DONE in types
    text_events = [e for e in events if e.type == EventType.TEXT]
    assert any("搜一下" in e.data.get("text", "") for e in text_events)
    _TOOL_REGISTRY.pop("search", None)


async def test_base_agent_emits_action_from_tool_result():
    """工具返回 _action 指令 → BaseAgent emit ACTION。"""
    from runtime.base_agent import BaseAgent
    from infra.llm.base import StreamEvent, EventType as LLMEventType
    from runtime.tools.registry import _TOOL_REGISTRY
    from runtime.agent import AgentTask
    from runtime.events import EventEmitter, EventType
    from unittest.mock import patch

    class _ActionTool:
        name = "do_switch"
        description = "switch"
        input_schema = {"type": "object"}
        async def execute(self, **params):
            return '{"_action":"switch_agent","agent_id":"echo"}'

    class _TestAgent(BaseAgent):
        from runtime.agent import AgentMetadata
        metadata = AgentMetadata(id="_act_test", name="T", description="d", workspace={"type": "chat"})
        tool_names = ["do_switch"]
        system_prompt = "test"

    _TOOL_REGISTRY["do_switch"] = _ActionTool()
    agent = _TestAgent()
    agent._tool_map = {"do_switch": _ActionTool()}

    call_count = [0]
    async def fake_stream(messages, **kw):
        call_count[0] += 1
        if call_count[0] == 1:
            yield StreamEvent(type=LLMEventType.TOOL_USE, tool_name="do_switch", tool_input={}, tool_id="t1")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})
        else:
            yield StreamEvent(type=LLMEventType.TEXT, text="已切换")
            yield StreamEvent(type=LLMEventType.DONE, usage={"input_tokens": 1, "output_tokens": 1})

    emit = EventEmitter()
    with patch.object(agent, "_provider") as mp:
        mp.stream = fake_stream
        await agent.run(AgentTask(messages=[{"role": "user", "content": "切换到 echo"}]), emit)

    events = [e async for e in emit]
    actions = [e for e in events if e.type == EventType.ACTION]
    assert len(actions) == 1
    assert actions[0].data.get("_action") == "switch_agent"
    assert actions[0].data.get("agent_id") == "echo"
    _TOOL_REGISTRY.pop("do_switch", None)

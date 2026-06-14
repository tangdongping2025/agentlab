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


async def test_base_agent_tool_use_loop():
    """模拟:LLM 第1轮 tool_use,第2轮最终回复。"""
    from runtime.base_agent import BaseAgent
    from infra.llm.base import CompleteResult

    class _TestAgent(BaseAgent):
        from runtime.agent import AgentMetadata
        metadata = AgentMetadata(id="_base_test", name="T", description="d", workspace={"type": "chat"})
        tool_names = ["search"]
        system_prompt = "你是测试"

    _TOOL_REGISTRY["search"] = _FakeSearchTool()
    agent = _TestAgent()
    agent._tool_map = {"search": _FakeSearchTool()}  # 手动注入(绕过 __init__ 的 get_tool)

    call_count = [0]
    async def fake_complete(messages, **kw):
        call_count[0] += 1
        if call_count[0] == 1:
            return CompleteResult(content="我搜一下", tool_calls=[{"id":"t1","name":"search","input":{"query":"AI"}}], stop_reason="tool_use", usage={"input_tokens":5,"output_tokens":3})
        return CompleteResult(content="AI 是人工智能", tool_calls=None, stop_reason="end_turn", usage={"input_tokens":8,"output_tokens":5})

    from unittest.mock import patch
    from runtime.events import EventEmitter
    emit = EventEmitter()
    with patch.object(agent, "_provider") as mp:
        mp.complete = fake_complete
        await agent.run(AgentTask(messages=[{"role":"user","content":"什么是AI"}]), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.TOOL_CALL in types
    assert EventType.TOOL_RESULT in types
    assert events[-1].type == EventType.DONE
    _TOOL_REGISTRY.pop("search", None)

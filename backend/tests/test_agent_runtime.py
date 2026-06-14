import asyncio
import pytest

from runtime.events import AgentEvent, EventEmitter, EventType
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.registry import register_agent, get_agent_class, list_agents, create_agent


def test_event_type_values():
    assert EventType.TEXT.value == "text"
    assert EventType.THINKING.value == "thinking"
    assert EventType.TOOL_CALL.value == "tool_call"
    assert EventType.DONE.value == "done"
    assert EventType.ERROR.value == "error"


async def test_event_collected_in_order():
    emit = EventEmitter()
    await emit.emit(EventType.TEXT, text="a")
    await emit.emit(EventType.TEXT, text="b")
    await emit.emit_done()
    events = [e async for e in emit]
    assert [e.type for e in events] == [EventType.TEXT, EventType.TEXT, EventType.DONE]
    assert events[0].data == {"text": "a"}
    assert events[2].type == EventType.DONE


async def test_event_emitter_error_ends_stream():
    emit = EventEmitter()
    await emit.emit(EventType.TEXT, text="x")
    await emit.emit_error("boom")
    events = [e async for e in emit]
    assert events[-1].type == EventType.ERROR
    assert events[-1].data == {"error": "boom"}


def test_agent_metadata_construct():
    m = AgentMetadata(id="echo", name="Echo", description="d", workspace={"type": "chat"})
    assert m.id == "echo"
    assert m.workspace == {"type": "chat"}


def test_agent_task_defaults():
    t = AgentTask(messages=[{"role": "user", "content": "hi"}])
    assert t.system is None
    assert t.config == {}


def test_agent_is_abstract():
    with pytest.raises(TypeError):
        Agent()  # ABC 不能直接实例化


def test_register_and_lookup():
    @register_agent
    class _TmpAgent(Agent):
        metadata = AgentMetadata(id="_tmp_test", name="Tmp", description="t", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit_done()

    assert get_agent_class("_tmp_test") is _TmpAgent
    assert "_tmp_test" in list_agents()
    inst = create_agent("_tmp_test")
    assert inst is not None and inst.metadata.id == "_tmp_test"
    assert create_agent("nonexistent") is None
    # 清理,避免污染其他测试
    from runtime import registry
    registry._AGENT_REGISTRY.pop("_tmp_test", None)

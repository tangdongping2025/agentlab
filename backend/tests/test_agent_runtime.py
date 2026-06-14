import asyncio
import pytest

from runtime.events import AgentEvent, EventEmitter, EventType
from runtime.agent import Agent, AgentMetadata, AgentTask


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

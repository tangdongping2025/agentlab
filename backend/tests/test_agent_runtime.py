import asyncio
import pytest

from runtime.events import AgentEvent, EventEmitter, EventType
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.registry import register_agent, get_agent_class, list_agents, create_agent
from runtime.executor import run_agent


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
    assert events[-1].data == {"error": "boom", "category": "internal"}


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


async def test_run_agent_collects_events():
    class _EA(Agent):
        metadata = AgentMetadata(id="_ea_test", name="EA", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit(EventType.TEXT, text="hello")
            await emit.emit_done()

    emit = await run_agent(_EA(), AgentTask(messages=[]))
    events = [e async for e in emit]
    assert [e.type for e in events] == [EventType.TEXT, EventType.DONE]
    assert events[0].data == {"text": "hello"}


async def test_run_agent_catches_exception():
    class _FailAgent(Agent):
        metadata = AgentMetadata(id="_fail_test", name="Fail", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit(EventType.TEXT, text="partial")
            raise RuntimeError("agent crashed")

    emit = await run_agent(_FailAgent(), AgentTask(messages=[]))
    events = [e async for e in emit]
    assert events[-1].type == EventType.ERROR
    assert "agent crashed" in events[-1].data["error"]


async def test_run_agent_exposes_task_handle():
    """executor 必须把 _runner task 挂到 emitter 上,SSE 才能在断连时 cancel。"""
    class _SlowAgent(Agent):
        metadata = AgentMetadata(id="_slow_test", name="Slow", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await asyncio.sleep(60)  # 永远不会自然完成
            await emit.emit_done()

    emit = await run_agent(_SlowAgent(), AgentTask(messages=[]))
    assert emit.task is not None
    assert not emit.task.done()
    emit.task.cancel()
    try:
        await asyncio.wait_for(emit.task, timeout=1.0)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass
    assert emit.task.done()


async def test_cancelled_runner_does_not_emit_error():
    """取消是预期路径,_runner 不应把 CancelledError 当成错误 emit_error。"""
    class _SlowAgent(Agent):
        metadata = AgentMetadata(id="_slow_test2", name="Slow", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit(EventType.TEXT, text="partial")
            await asyncio.sleep(60)
            await emit.emit_done()

    emit = await run_agent(_SlowAgent(), AgentTask(messages=[]))
    # 模拟 SSE 路由:消费一个事件后 cancel(等价客户端早早断连)
    iterator = aiter(emit)
    first = await anext(iterator)
    assert first.type == EventType.TEXT
    emit.task.cancel()
    # 收尾:剩余事件序列里不应有 ERROR
    remaining = []
    try:
        async for ev in iterator:
            remaining.append(ev)
    except Exception:
        pass
    assert all(e.type != EventType.ERROR for e in remaining)

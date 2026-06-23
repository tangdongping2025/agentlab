import pytest

from runtime.agent import Agent, AgentTask
from runtime.events import EventType
from runtime.executor import run_agent


class _BoomAgent(Agent):
    """最小 Agent 桩:run 时抛出指定异常。"""

    def __init__(self, exc):
        self._exc = exc

    async def run(self, task, emit):
        raise self._exc


@pytest.mark.asyncio
async def test_executor_classifies_runtime_error_as_internal():
    emit = await run_agent(_BoomAgent(RuntimeError("boom")), AgentTask(messages=[]))
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data["category"] == "internal"


@pytest.mark.asyncio
async def test_executor_classifies_connection_error_as_network():
    emit = await run_agent(_BoomAgent(ConnectionError("refused")), AgentTask(messages=[]))
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data["category"] == "network"

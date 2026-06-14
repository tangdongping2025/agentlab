import pytest

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.registry import get_agent_class, create_agent


def test_echo_agent_registered():
    import agents  # 触发注册(导入 agents 包)
    assert get_agent_class("echo") is not None


async def test_echo_agent_echos_last_user_message():
    import agents  # noqa
    agent = create_agent("echo")
    from runtime.events import EventEmitter
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "你好"}]), emit)
    events = [e async for e in emit]
    texts = [e.data.get("text", "") for e in events if e.type == EventType.TEXT]
    assert any("你好" in t for t in texts)
    assert events[-1].type == EventType.DONE


async def test_echo_agent_empty_messages():
    import agents  # noqa
    agent = create_agent("echo")
    from runtime.events import EventEmitter
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[]), emit)
    events = [e async for e in emit]
    assert events[-1].type == EventType.DONE  # 即使无消息也正常结束

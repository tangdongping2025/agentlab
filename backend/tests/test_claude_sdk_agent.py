import pytest

from runtime.agent import AgentTask
from runtime.events import EventEmitter, EventType


def test_claude_sdk_agent_registered():
    import agents  # 触发注册
    from runtime.registry import get_agent_class
    assert get_agent_class("claude-sdk") is not None


def test_claude_sdk_agent_metadata():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    assert agent is not None
    m = agent.metadata
    assert m.id == "claude-sdk"
    assert m.workspace == {"type": "chat"}
    assert m.capabilities  # 非空,声明能力

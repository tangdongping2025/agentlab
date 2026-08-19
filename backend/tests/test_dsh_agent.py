"""dsh iframe 型 agent 注册测试(不依赖 DB)。"""
from runtime.registry import get_agent_class, list_agents


def test_dsh_agent_registered():
    assert "dsh" in list_agents()


def test_dsh_agent_metadata_is_iframe():
    cls = get_agent_class("dsh")
    assert cls is not None
    meta = cls.metadata
    assert meta.id == "dsh"
    assert meta.workspace["type"] == "iframe"
    assert "url" in meta.workspace

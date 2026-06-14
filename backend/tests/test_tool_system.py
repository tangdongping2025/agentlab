import pytest
from runtime.tools.base import Tool
from runtime.tools.registry import ToolRegistry, register_tool, get_tool


class _FakeTool:
    name = "fake"
    description = "fake tool"
    input_schema = {"type": "object", "properties": {"x": {"type": "string"}}}
    async def execute(self, **params):
        return f"fake result: {params.get('x')}"


def test_register_and_get_tool():
    register_tool(_FakeTool())
    t = get_tool("fake")
    assert t is not None
    assert t.name == "fake"
    assert get_tool("nonexistent") is None
    # 清理
    from runtime.tools import registry
    registry._TOOL_REGISTRY.pop("fake", None)


async def test_fake_tool_execute():
    t = _FakeTool()
    r = await t.execute(x="hi")
    assert r == "fake result: hi"

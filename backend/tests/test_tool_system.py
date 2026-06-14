import pytest
import httpx
import respx
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


from runtime.tools.anysearch import AnysearchTool


@respx.mock
async def test_anysearch_tool_calls_api():
    respx.post("https://api.anysearch.com/mcp").mock(
        return_value=httpx.Response(200, json={
            "result": {"content": [{"type": "text", "text": "搜索结果: AI 是..."}]}
        })
    )
    tool = AnysearchTool(api_key="test-key")
    r = await tool.execute(query="AI")
    assert "AI 是" in r


@respx.mock
async def test_anysearch_tool_handles_error():
    respx.post("https://api.anysearch.com/mcp").mock(
        return_value=httpx.Response(500, json={"error": {"message": "boom"}})
    )
    tool = AnysearchTool(api_key="test-key")
    r = await tool.execute(query="AI")
    assert "错误" in r or "boom" in r

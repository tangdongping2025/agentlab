import asyncio
import pytest


def test_query_required():
    from runtime.tools.websearch import WebSearchTool
    out = asyncio.run(WebSearchTool().execute())
    assert "query" in out


def test_schema():
    from runtime.tools.websearch import WebSearchTool
    t = WebSearchTool()
    assert t.name == "WebSearch"
    assert t.input_schema["required"] == ["query"]

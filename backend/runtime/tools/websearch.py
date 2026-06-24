from __future__ import annotations

from .registry import register_tool
from .anysearch import AnysearchTool


class WebSearchTool:
    """WebSearch:复用 anysearch 联网搜索(对外暴露 WebSearch 名,与 Claude Code 工具名一致)。"""

    name = "WebSearch"
    description = "联网网页搜索。query 必填。"
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "搜索关键词"},
        },
        "required": ["query"],
    }

    def __init__(self) -> None:
        self._inner = AnysearchTool()

    async def execute(self, **params) -> str:
        return await self._inner.execute(**params)


register_tool(WebSearchTool())

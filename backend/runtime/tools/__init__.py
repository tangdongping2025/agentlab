"""工具系统框架(RQ-2 只搭框架,工具实现推 RQ-4)。

后续:Tool 协议 + ToolRegistry;anysearch 等工具在此注册。
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Tool(Protocol):
    """工具协议(占位,RQ-4 完善)。"""
    name: str
    description: str

    async def execute(self, **params) -> str:
        ...


# 工具注册表(RQ-4 实现)
_TOOL_REGISTRY: dict[str, Tool] = {}


def register_tool(tool: Tool) -> Tool:
    _TOOL_REGISTRY[tool.name] = tool
    return tool

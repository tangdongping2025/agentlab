from __future__ import annotations
from .base import Tool

_TOOL_REGISTRY: dict[str, Tool] = {}


class ToolRegistry:
    @staticmethod
    def register(tool: Tool) -> Tool:
        _TOOL_REGISTRY[tool.name] = tool
        return tool

    @staticmethod
    def get(name: str) -> Tool | None:
        return _TOOL_REGISTRY.get(name)


def register_tool(tool: Tool) -> Tool:
    return ToolRegistry.register(tool)


def get_tool(name: str) -> Tool | None:
    return ToolRegistry.get(name)

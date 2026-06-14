"""工具系统。"""
from .base import Tool
from .registry import ToolRegistry, register_tool, get_tool
from . import anysearch  # noqa: F401  触发 AnysearchTool 注册(_register_default)

__all__ = ["Tool", "ToolRegistry", "register_tool", "get_tool"]

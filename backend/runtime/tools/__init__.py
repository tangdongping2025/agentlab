"""工具系统。"""
from .base import Tool
from .registry import ToolRegistry, register_tool, get_tool
from . import anysearch  # noqa: F401  触发 AnysearchTool 注册(_register_default)
from . import platform  # noqa: F401  触发平台工具注册

__all__ = ["Tool", "ToolRegistry", "register_tool", "get_tool"]

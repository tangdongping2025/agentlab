"""工具系统。"""
from .base import Tool
from .registry import ToolRegistry, register_tool, get_tool
from . import anysearch  # noqa: F401  触发 AnysearchTool 注册(_register_default)
from . import platform  # noqa: F401  触发平台工具注册
from . import file_read  # noqa: F401  Read/Glob/Grep
from . import file_edit  # noqa: F401  Edit
from . import bash  # noqa: F401  Bash
from . import websearch  # noqa: F401  WebSearch

__all__ = ["Tool", "ToolRegistry", "register_tool", "get_tool"]

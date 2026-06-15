from __future__ import annotations

from pathlib import Path

from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage,
)

from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent

# backend/sandbox 绝对路径(cwd 用)
_SANDBOX_DIR = str((Path(__file__).resolve().parent.parent / "sandbox"))

# coding agent 允许的内置工具清单
_ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash", "Edit", "WebSearch"]

_DEFAULT_SYSTEM_PROMPT = (
    "你是一个运行在 context-lab 沙箱目录里的 coding 助手。"
    "可以用 Read/Glob/Grep 读文件、Bash 跑命令、Edit 改文件、WebSearch 搜索。"
    "操作请限制在当前工作目录。"
)


@register_agent
class ClaudeSdkAgent(Agent):
    """第二种 agent 范式:由 Claude Agent SDK 自主跑工具循环,adapter 只映射事件。"""

    metadata = AgentMetadata(
        id="claude-sdk",
        name="Claude SDK Agent",
        description="Claude Agent SDK 驱动的 coding agent(自主工具循环,内置 Read/Edit/Bash...)",
        workspace={"type": "chat"},
        capabilities=["tool_use", "code_edit", "web_search"],
    )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        raise NotImplementedError("Task 3 实现")

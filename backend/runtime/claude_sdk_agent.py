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

    def _build_options(self, task: AgentTask) -> ClaudeAgentOptions:
        return ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            cwd=_SANDBOX_DIR,
            setting_sources=[],
            allowed_tools=list(_ALLOWED_TOOLS),
            system_prompt=task.system or _DEFAULT_SYSTEM_PROMPT,
        )

    @staticmethod
    def _messages_to_prompt(messages: list[dict]) -> str:
        # 保留完整对话历史(含 assistant 回复),让 agent 知道之前做过、不重做;
        # 最后一条是当前请求,前面是已完成的历史
        if not messages:
            return " "
        *history, current = messages
        lines = []
        for m in history:
            role = "用户" if m.get("role") == "user" else "助手"
            lines.append(f"{role}: {m.get('content', '')}")
        prompt = ""
        if lines:
            prompt = "以下是之前的对话历史(已完成,请勿重复执行):\n" + "\n".join(lines) + "\n\n"
        prompt += f"请回答当前最新请求:\n用户: {current.get('content', '')}"
        return prompt

    @staticmethod
    async def _emit_tool_result(block, emit: EventEmitter) -> None:
        content = block.content
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        # name 留空:SDK ToolResultBlock 只有 tool_use_id、无工具名,前端按顺序/ID 关联
        await emit.emit(EventType.TOOL_RESULT, name="", result=str(content) if content else "")

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        try:
            prompt = self._messages_to_prompt(task.messages)
            options = self._build_options(task)
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            await emit.emit(EventType.TEXT, text=block.text)
                        elif isinstance(block, ThinkingBlock):
                            await emit.emit(EventType.THINKING, thinking=block.thinking)
                        elif isinstance(block, ToolUseBlock):
                            await emit.emit(EventType.TOOL_CALL, name=block.name, params=block.input)
                        elif isinstance(block, ToolResultBlock):
                            await self._emit_tool_result(block, emit)
                    if getattr(message, "error", None):
                        await emit.emit_error(f"assistant error: {message.error}")
                elif isinstance(message, ToolResultBlock):
                    await self._emit_tool_result(message, emit)
                elif isinstance(message, ResultMessage):
                    if message.usage:
                        await emit.emit(
                            EventType.TOKEN_USAGE,
                            input_tokens=message.usage.get("input_tokens", 0),
                            output_tokens=message.usage.get("output_tokens", 0),
                        )
                    if message.is_error or message.subtype != "success":
                        await emit.emit_error(
                            f"result {message.subtype}: {getattr(message, 'result', '')}"
                        )
                    else:
                        await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

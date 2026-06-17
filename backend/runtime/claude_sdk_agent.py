from __future__ import annotations

import os
import sys
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
from claude_agent_sdk.types import StreamEvent

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

# 注入高德地图 MCP:key 从环境变量读(由 backend/.env 经 load_dotenv 注入);
# key 缺失则跳过该 server —— 优雅降级,不阻断 agent 启动。
_AMAP_SERVER_NAME = "amap-maps"


def _build_mcp_servers() -> dict:
    servers: dict[str, dict] = {}
    amap_key = os.environ.get("AMAP_MAPS_API_KEY", "").strip()
    if amap_key:
        npx_args = ["-y", "@amap/amap-maps-mcp-server"]
        if sys.platform == "win32":
            command, args = "cmd", ["/c", "npx", *npx_args]
        else:
            command, args = "npx", npx_args
        servers[_AMAP_SERVER_NAME] = {
            "command": command,
            "args": args,
            "env": {"AMAP_MAPS_API_KEY": amap_key},
        }
    return servers


@register_agent
class ClaudeSdkAgent(Agent):
    """第二种 agent 范式:由 Claude Agent SDK 自主跑工具循环,adapter 只映射事件。"""

    metadata = AgentMetadata(
        id="claude-sdk",
        name="Claude SDK Agent",
        description="Claude Agent SDK 驱动的 coding agent(自主工具循环,内置 Read/Edit/Bash...)",
        workspace={"type": "tabs", "tabs": ["对话", "文件"]},
        capabilities=["tool_use", "code_edit", "web_search"],
    )

    def _build_options(self, task: AgentTask) -> ClaudeAgentOptions:
        mcp_servers = _build_mcp_servers()
        allowed_tools = list(_ALLOWED_TOOLS)
        system_prompt = task.system or _DEFAULT_SYSTEM_PROMPT
        if _AMAP_SERVER_NAME in mcp_servers:
            allowed_tools.append(f"mcp__{_AMAP_SERVER_NAME}__*")
            system_prompt += (
                "\n你还接入了高德地图工具(mcp__amap-maps__*):"
                "地理编码/逆地理编码、POI 关键词与周边搜索、"
                "路线规划(步行/驾车/公交/骑行)、距离测量、天气、IP 定位等。"
            )
        return ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            cwd=task.cwd or _SANDBOX_DIR,
            setting_sources=[],
            allowed_tools=allowed_tools,
            system_prompt=system_prompt,
            include_partial_messages=True,
            mcp_servers=mcp_servers,
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
            saw_partial = False
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, StreamEvent):
                    saw_partial = True
                    ev = message.event or {}
                    if ev.get("type") == "content_block_delta":
                        delta = ev.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            await emit.emit(EventType.TEXT, text=delta.get("text", ""))
                        # thinking 不流式:避免每个 delta 一个 THINKING 事件刷屏,
                        # 等完整 ThinkingBlock 再 emit(见下方 AssistantMessage 分支)
                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            if not saw_partial:
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
            import traceback as _tb
            print(_tb.format_exc(), flush=True)
            await emit.emit_error(f"{type(e).__name__}: {e}")

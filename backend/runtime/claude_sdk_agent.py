from __future__ import annotations

import inspect
import os
from dataclasses import fields, is_dataclass
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

from agent_model_settings import resolve_model_config_for_agent
from database import SessionLocal
import models
from global_prompt_settings import build_global_prompt_for_agent
from habit_prompt_settings import build_habit_prompt_for_agent
from mcp_settings import AMAP_PREINSTALLED_ENTRY, AMAP_SERVER_ID, load_mcp_settings, select_amap_command
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.context_compression import (
    append_compression_log,
    build_runtime_context,
    compression_action_payload,
    compression_log_path,
    load_summary_state,
    save_summary_state,
    summary_state_from_result,
)
from skill_settings import build_skill_prompt_for_agent
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
_AMAP_SERVER_NAME = AMAP_SERVER_ID
_AMAP_PREINSTALLED_ENTRY = AMAP_PREINSTALLED_ENTRY


def _claude_options_supports_model() -> bool:
    if is_dataclass(ClaudeAgentOptions):
        return any(field.name == "model" for field in fields(ClaudeAgentOptions))
    model_fields = getattr(ClaudeAgentOptions, "model_fields", None)
    if isinstance(model_fields, dict):
        return "model" in model_fields
    fields_map = getattr(ClaudeAgentOptions, "__fields__", None)
    if isinstance(fields_map, dict):
        return "model" in fields_map
    try:
        return "model" in inspect.signature(ClaudeAgentOptions).parameters
    except (TypeError, ValueError):
        return False


def _build_mcp_servers() -> dict:
    settings = load_mcp_settings()
    amap_cfg = settings["servers"].get(_AMAP_SERVER_NAME, {})
    if not amap_cfg.get("enabled", True):
        return {}
    if "claude-sdk" not in amap_cfg.get("agentIds", []):
        return {}
    amap_key = os.environ.get("AMAP_MAPS_API_KEY", "").strip()
    if not amap_key:
        return {}
    command, args, error = select_amap_command(amap_cfg.get("launchMode", "auto"))
    if error or not command:
        return {}
    return {
        _AMAP_SERVER_NAME: {
            "command": command,
            "args": args,
            "env": {"AMAP_MAPS_API_KEY": amap_key},
        }
    }


@register_agent
class ClaudeSdkAgent(Agent):
    """第二种 agent 范式:由 Claude Agent SDK 自主跑工具循环,adapter 只映射事件。"""

    metadata = AgentMetadata(
        id="claude-sdk",
        name="龙虾 Agent",
        description="会使用工具、读写文件、执行命令并观察结果的行动型智能体",
        workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP"]},
        capabilities=["tool_use", "code_edit", "web_search"],
    )

    def _build_options(self, task: AgentTask) -> ClaudeAgentOptions:
        model_config = resolve_model_config_for_agent("claude-sdk")
        mcp_servers = _build_mcp_servers()
        allowed_tools = list(_ALLOWED_TOOLS)
        system_prompt = build_global_prompt_for_agent("claude-sdk") + (task.system or _DEFAULT_SYSTEM_PROMPT) + build_skill_prompt_for_agent("claude-sdk", task.cwd) + build_habit_prompt_for_agent("claude-sdk")
        if _AMAP_SERVER_NAME in mcp_servers:
            allowed_tools.append(f"mcp__{_AMAP_SERVER_NAME}__*")
            system_prompt += (
                "\n你还接入了高德地图工具(mcp__amap-maps__*):"
                "地理编码/逆地理编码、POI 关键词与周边搜索、"
                "路线规划(步行/驾车/公交/骑行)、距离测量、天气、IP 定位等。"
            )
        options_kwargs = {
            "permission_mode": "bypassPermissions",
            "cwd": task.cwd or _SANDBOX_DIR,
            "setting_sources": [],
            "allowed_tools": allowed_tools,
            "system_prompt": system_prompt,
            "include_partial_messages": True,
            "mcp_servers": mcp_servers,
        }
        if model_config.model and _claude_options_supports_model():
            options_kwargs["model"] = model_config.model
        return ClaudeAgentOptions(**options_kwargs)

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

    def _load_runtime_messages(self, db, task: AgentTask) -> list[dict]:
        request_messages = list(task.messages or [])
        if not task.sessionId:
            return request_messages

        rows = (
            db.query(models.MessageModel)
            .filter(models.MessageModel.session_id == task.sessionId)
            .order_by(models.MessageModel.seq.asc())
            .all()
        )
        history = [{"role": row.role, "content": row.content} for row in rows]
        if not history:
            return request_messages
        if not request_messages:
            return history

        request_pairs = [(m.get("role"), m.get("content")) for m in request_messages]
        history_pairs = [(m.get("role"), m.get("content")) for m in history]
        if request_pairs == history_pairs[-len(request_messages):]:
            return history

        if len(request_messages) == 1 and request_messages[-1].get("role") == "user":
            return history + request_messages

        max_overlap = min(len(history_pairs), len(request_pairs))
        for size in range(max_overlap, 0, -1):
            if history_pairs[-size:] == request_pairs[:size]:
                return history + request_messages[size:]
        return history + request_messages

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
            db = SessionLocal()
            try:
                runtime_messages = self._load_runtime_messages(db, task)
                try:
                    summary_state = load_summary_state(db, task.sessionId)
                except Exception:
                    summary_state = {}
                context = build_runtime_context(runtime_messages, summary_state)
                if context.triggered:
                    try:
                        save_summary_state(db, task.sessionId, summary_state_from_result(context))
                    except Exception:
                        db.rollback()
                    try:
                        append_compression_log(
                            compression_log_path(task.cwd, _SANDBOX_DIR),
                            session_id=task.sessionId or "",
                            agent_id=self.metadata.id,
                            result=context,
                        )
                    except OSError:
                        pass
                    try:
                        await emit.emit(EventType.ACTION, **compression_action_payload(context, runtime_messages))
                    except Exception:
                        pass
            finally:
                db.close()
            prompt = context.prompt
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

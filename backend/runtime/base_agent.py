from __future__ import annotations

from agent_model_settings import resolve_model_config_for_agent
from database import SessionLocal
from global_prompt_settings import build_global_prompt_for_agent
from habit_prompt_settings import build_habit_prompt_for_agent
from infra.llm import ArkProvider
from infra.llm.base import LLMMessage, ToolDefinition, EventType as LLMEventType
import models
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.tools import get_tool
from runtime.tools.mcp_amap import get_mcp_tools_for_agent
from skill_settings import build_skill_prompt_for_agent


class BaseAgent(Agent):
    """通用 agent 基类:LLM + tool use 循环。子类定义 metadata + tool_names + system_prompt。"""

    metadata: AgentMetadata
    tool_names: list[str] = []
    system_prompt: str = ""

    def __init__(self) -> None:
        model_config = resolve_model_config_for_agent(self.metadata.id)
        self._provider = ArkProvider(
            api_key=model_config.api_key,
            base_url=model_config.base_url,
            default_model=model_config.model,
        )
        base_tools = [get_tool(n) for n in self.tool_names if get_tool(n)]
        self._tools = base_tools + get_mcp_tools_for_agent(self.metadata.id)
        self._tool_defs = [
            ToolDefinition(name=t.name, description=t.description, input_schema=t.input_schema)
            for t in self._tools
        ]
        self._tool_map = {t.name: t for t in self._tools}

    def _estimate_tokens(self, messages: list[LLMMessage]) -> int:
        total = 0
        for m in messages:
            text = m.content if isinstance(m.content, str) else str(m.content)
            total += len(text) // 4
        return total

    def _extract_text(self, msg: LLMMessage) -> str:
        if isinstance(msg.content, str):
            return msg.content
        if isinstance(msg.content, list):
            return " ".join(b.get("text", "") for b in msg.content if isinstance(b, dict) and b.get("type") == "text")
        return str(msg.content)

    def _load_runtime_messages(self, task: AgentTask) -> list[dict]:
        request_messages = list(task.messages or [])
        if not task.sessionId:
            return request_messages

        db = SessionLocal()
        try:
            rows = (
                db.query(models.MessageModel)
                .filter(models.MessageModel.session_id == task.sessionId)
                .order_by(models.MessageModel.seq.asc())
                .all()
            )
            history = [{"role": row.role, "content": row.content} for row in rows]
        finally:
            db.close()

        if not history:
            return request_messages
        if not request_messages:
            return history

        request_pairs = [(m.get("role"), m.get("content")) for m in request_messages]
        history_pairs = [(m.get("role"), m.get("content")) for m in history]
        if request_pairs == history_pairs[-len(request_messages):]:
            return history

        max_overlap = min(len(history_pairs), len(request_pairs))
        for size in range(max_overlap, 0, -1):
            if history_pairs[-size:] == request_pairs[:size]:
                return history + request_messages[size:]
        return history + request_messages

    async def _generate_summary(self, messages: list[LLMMessage]) -> str:
        conv_text = "\n".join(
            f"{'用户' if m.role == 'user' else '助手'}: {self._extract_text(m)[:200]}" for m in messages
        )
        try:
            result = await self._provider.complete([
                LLMMessage(role="user", content=f"请用 2-3 句话总结以下对话的关键信息:\n\n{conv_text}")
            ])
            return result.content
        except Exception as e:
            return f"(摘要失败: {e})"

    async def _apply_strategy(self, messages: list[LLMMessage], strategy: str = "sliding"):
        before_tokens = self._estimate_tokens(messages)
        before_count = len(messages)
        before_snapshot = [{"role": m.role, "content": self._extract_text(m)[:80]} for m in messages]
        removed: list[LLMMessage] = []
        summary_content = None

        if strategy == "full" or len(messages) <= 1:
            after = list(messages)
        elif strategy == "none":
            after = [messages[-1]] if messages else []
            removed = list(messages[:-1])
        elif strategy == "sliding":
            window = 10
            if len(messages) <= window:
                after = list(messages)
            else:
                after = list(messages[-window:])
                removed = list(messages[:-window])
        elif strategy == "summary":
            recent, threshold = 4, 6
            if len(messages) <= threshold:
                after = list(messages)
            else:
                old = list(messages[:-recent])
                summary_content = await self._generate_summary(old)
                after = [LLMMessage(role="assistant", content=f"[对话摘要] {summary_content}")] + list(messages[-recent:])
                removed = old
        else:
            after = list(messages)

        after_tokens = self._estimate_tokens(after)
        after_snapshot = [{"role": m.role, "content": self._extract_text(m)[:80]} for m in after]
        return after, {
            "action": "strategy_effect",
            "strategy": strategy,
            "triggered": len(removed) > 0,
            "before_count": before_count,
            "after_count": len(after),
            "before_tokens": before_tokens,
            "after_tokens": after_tokens,
            "beforeTokenCount": before_tokens,
            "afterTokenCount": after_tokens,
            "beforeMessages": before_snapshot,
            "afterMessages": after_snapshot,
            "removed_count": len(removed),
            "summary": summary_content,
            "summarySourceCount": len(removed) if strategy == "summary" and removed else None,
        }

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        runtime_messages = self._load_runtime_messages(task)
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in runtime_messages]
        strategy = "sliding"
        try:
            cfg = getattr(task, "config", None) or {}
            strategy = cfg.get("strategy", "sliding")
            messages, effect = await self._apply_strategy(messages, strategy)
            await emit.emit(EventType.ACTION, **effect)
            system_prompt = build_global_prompt_for_agent(self.metadata.id) + (self.system_prompt or "") + build_skill_prompt_for_agent(self.metadata.id) + build_habit_prompt_for_agent(self.metadata.id)
            for _ in range(5):  # 最多 5 轮 tool use
                text_buf = ""
                tool_calls: list[dict] = []
                async for ev in self._provider.stream(
                    messages,
                    system=system_prompt or None,
                    tools=self._tool_defs or None,
                ):
                    if ev.type == LLMEventType.TEXT:
                        text_buf += ev.text or ""
                        await emit.emit(EventType.TEXT, text=ev.text)
                    elif ev.type == LLMEventType.TOOL_USE:
                        tool_calls.append({
                            "id": ev.tool_id, "name": ev.tool_name, "input": ev.tool_input or {},
                        })
                    elif ev.type == LLMEventType.DONE:
                        if ev.usage:
                            await emit.emit(EventType.TOKEN_USAGE,
                                            input_tokens=ev.usage.get("input_tokens", 0),
                                            output_tokens=ev.usage.get("output_tokens", 0))
                    elif ev.type == LLMEventType.ERROR:
                        await emit.emit_error(ev.error or "stream error")
                        return
                # 一轮流结束
                if tool_calls:
                    # 回灌 assistant(text + tool_use blocks)
                    assistant_content = []
                    if text_buf:
                        assistant_content.append({"type": "text", "text": text_buf})
                    for call in tool_calls:
                        assistant_content.append({
                            "type": "tool_use", "id": call["id"],
                            "name": call["name"], "input": call["input"],
                        })
                    messages.append(LLMMessage(role="assistant", content=assistant_content))
                    # 执行每个工具 + 回灌 tool_result
                    for call in tool_calls:
                        await emit.emit(EventType.TOOL_CALL, name=call["name"], params=call["input"])
                        tool = self._tool_map.get(call["name"])
                        try:
                            tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        # 检测 _action 指令(平台操作工具返回)→ emit ACTION
                        try:
                            import json as _json
                            _parsed = _json.loads(tool_result) if isinstance(tool_result, str) else None
                            if isinstance(_parsed, dict) and "_action" in _parsed:
                                await emit.emit(EventType.ACTION, **_parsed)
                                tool_result = f"已执行动作: {_parsed['_action']}"
                        except (ValueError, TypeError):
                            pass
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
                        messages.append(LLMMessage(role="user", content=[
                            {"type": "tool_result", "tool_use_id": call["id"], "content": tool_result}
                        ]))
                    continue
                # 无 tool_use,结束
                await emit.emit_done()
                return
            await emit.emit_done()  # 达 max_loops 兜底
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

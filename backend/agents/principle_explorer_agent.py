from __future__ import annotations

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage, EventType as LLMEventType
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


def _estimate_tokens(messages: list[LLMMessage]) -> int:
    total = 0
    for m in messages:
        text = m.content if isinstance(m.content, str) else str(m.content)
        total += len(text) // 4
    return total


def _extract_text(msg: LLMMessage) -> str:
    if isinstance(msg.content, str):
        return msg.content
    if isinstance(msg.content, list):
        return " ".join(b.get("text", "") for b in msg.content if isinstance(b, dict) and b.get("type") == "text")
    return str(msg.content)


@register_agent
class PrincipleExplorerAgent(Agent):
    """原理探索 agent:演示 4 种上下文策略(full/sliding/summary/none),emit 策略效果。"""

    metadata = AgentMetadata(
        id="principle_explorer",
        name="原理探索",
        description="演示上下文策略(full/sliding/summary/none)对 token 的影响",
        workspace={"type": "chat"},
    )

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )

    async def _generate_summary(self, messages: list[LLMMessage]) -> str:
        conv_text = "\n".join(
            f"{'用户' if m.role == 'user' else '助手'}: {_extract_text(m)[:200]}"
            for m in messages
        )
        try:
            result = await self._provider.complete([
                LLMMessage(role="user", content=f"请用 2-3 句话总结以下对话的关键信息:\n\n{conv_text}")
            ])
            return result.content
        except Exception as e:
            return f"(摘要失败: {e})"

    async def _apply_strategy(self, messages: list[LLMMessage], strategy: str):
        before_tokens = _estimate_tokens(messages)
        before_count = len(messages)
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
            recent = 4
            threshold = 6
            if len(messages) <= threshold:
                after = list(messages)
            else:
                old = list(messages[:-recent])
                summary_content = await self._generate_summary(old)
                after = [LLMMessage(role="assistant", content=f"[对话摘要] {summary_content}")] + list(messages[-recent:])
                removed = old
        else:
            after = list(messages)

        after_tokens = _estimate_tokens(after)
        return after, {
            "action": "strategy_effect",
            "strategy": strategy,
            "before_count": before_count,
            "after_count": len(after),
            "before_tokens": before_tokens,
            "after_tokens": after_tokens,
            "removed_count": len(removed),
            "summary": summary_content,
        }

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        strategy = task.config.get("strategy", "summary")
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            after_messages, effect = await self._apply_strategy(messages, strategy)
            await emit.emit(EventType.ACTION, **effect)
            async for ev in self._provider.stream(after_messages):
                if ev.type == LLMEventType.TEXT:
                    await emit.emit(EventType.TEXT, text=ev.text)
                elif ev.type == LLMEventType.DONE:
                    await emit.emit_done()
                    return
                elif ev.type == LLMEventType.ERROR:
                    await emit.emit_error(ev.error or "error")
                    return
            await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

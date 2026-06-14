from __future__ import annotations

from pathlib import Path

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


def _load_claude_md() -> str:
    """读项目根 CLAUDE.md 作为助手知识源。读不到用兜底。"""
    root = Path(__file__).resolve().parent.parent.parent
    md_path = root / "CLAUDE.md"
    try:
        return md_path.read_text(encoding="utf-8")
    except Exception:
        return "Context Lab 是一个智能体载体平台。"


@register_agent
class AssistantAgent(Agent):
    """项目助手:调 LLM 回答关于本平台的疑问,知识源 CLAUDE.md。v1 无工具。"""

    metadata = AgentMetadata(
        id="assistant",
        name="项目助手",
        description="回答关于本平台的疑问(知识源 CLAUDE.md)",
        workspace={"type": "chat"},
    )

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )
        self._system_prompt = (
            "你是 Context Lab 的项目助手。回答用户关于本平台的疑问(怎么用、各 agent 是什么、架构等)。\n\n"
            "以下是项目的说明文档,作为你的知识来源:\n\n"
            f"{_load_claude_md()}"
        )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            async for ev in self._provider.stream(messages, system=self._system_prompt):
                if ev.type == EventType.TEXT:
                    await emit.emit(EventType.TEXT, text=ev.text)
                elif ev.type == EventType.DONE:
                    await emit.emit_done()
                    return
                elif ev.type == EventType.ERROR:
                    await emit.emit_error(ev.error or "provider error")
                    return
            await emit.emit_done()
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

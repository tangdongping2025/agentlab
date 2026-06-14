from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Literal, Protocol, runtime_checkable

Role = Literal["user", "assistant"]


@dataclass
class LLMMessage:
    role: Role
    content: str | list


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict


class EventType(str, Enum):
    TEXT = "text"
    TOOL_USE = "tool_use"
    DONE = "done"
    ERROR = "error"


@dataclass
class StreamEvent:
    type: EventType
    text: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_id: str | None = None
    error: str | None = None
    usage: dict | None = None


@dataclass
class CompleteResult:
    content: str
    usage: dict | None = None
    tool_calls: list | None = None   # [{"id","name","input"}]
    stop_reason: str | None = None   # "end_turn" / "tool_use"


@runtime_checkable
class LLMProvider(Protocol):
    """LLM provider 抽象接口。所有 provider(ARK / Anthropic / ...)实现此接口。"""

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> CompleteResult:
        """非流式完成,返回完整结果。"""
        ...

    async def stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """流式完成,yield StreamEvent(TEXT/TOOL_USE/DONE/ERROR)。"""
        ...

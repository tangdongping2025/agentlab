from __future__ import annotations

import json
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from .base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)


class ArkProvider:
    """火山引擎 ARK provider(Anthropic 格式兼容)。

    通过 anthropic SDK 配 base_url 指向 ARK。ARK 接受 Anthropic messages 格式,
    因此 SDK 直接可用(SSE 解析 / tool use 类型由 SDK 提供)。
    """

    def __init__(self, api_key: str, base_url: str, default_model: str):
        self._client = AsyncAnthropic(api_key=api_key, base_url=base_url)
        self._default_model = default_model

    def _to_anthropic_messages(self, messages: list[LLMMessage]) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in messages]

    def _to_anthropic_tools(self, tools: list[ToolDefinition] | None) -> list[dict] | None:
        if not tools:
            return None
        return [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ]

    def _build_kwargs(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None,
        model: str | None,
        max_tokens: int,
        temperature: float,
        tools: list[ToolDefinition] | None,
    ) -> dict:
        kwargs: dict = {
            "model": model or self._default_model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": self._to_anthropic_messages(messages),
        }
        if system:
            kwargs["system"] = system
        anthropic_tools = self._to_anthropic_tools(tools)
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools
        return kwargs

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
        kwargs = self._build_kwargs(
            messages,
            system=system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            tools=tools,
        )
        response = await self._client.messages.create(**kwargs)
        text_parts = [b.text for b in response.content if b.type == "text"]
        return CompleteResult(
            content="".join(text_parts),
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
        )

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
        raise NotImplementedError  # Task 4 实现

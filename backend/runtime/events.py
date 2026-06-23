from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import Enum


class EventType(str, Enum):
    TEXT = "text"
    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOKEN_USAGE = "token_usage"
    ACTION = "action"
    ERROR = "error"
    DONE = "done"


@dataclass
class AgentEvent:
    type: EventType
    data: dict


class EventEmitter:
    """agent 通过 emit() 产事件,内部 asyncio.Queue;None 哨兵标记流结束。

    task: 由 executor 注入的 _runner 任务句柄,供 SSE 路由在客户端断连时 cancel。
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[AgentEvent | None] = asyncio.Queue()
        self.task: asyncio.Task | None = None

    async def emit(self, type: EventType, **data) -> None:
        await self._queue.put(AgentEvent(type=type, data=data))

    async def emit_done(self, **data) -> None:
        await self._queue.put(AgentEvent(type=EventType.DONE, data=data))
        await self._queue.put(None)

    async def emit_error(self, error: str, category: str = "internal") -> None:
        await self._queue.put(AgentEvent(type=EventType.ERROR, data={"error": error, "category": category}))
        await self._queue.put(None)

    async def __aiter__(self):
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event

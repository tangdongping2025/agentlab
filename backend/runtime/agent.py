from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from .events import EventEmitter


@dataclass
class AgentMetadata:
    id: str
    name: str
    description: str
    workspace: dict
    capabilities: list = field(default_factory=list)


@dataclass
class AgentTask:
    messages: list  # [{"role":"user","content":"..."}]
    system: str | None = None
    config: dict = field(default_factory=dict)
    cwd: str | None = None
    sessionId: str | None = None


class Agent(ABC):
    """Agent 抽象基类。子类定义类属性 metadata + 实现 run。"""

    metadata: AgentMetadata

    @abstractmethod
    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        """执行任务,通过 emit 流式产事件。不返回结果。"""
        ...

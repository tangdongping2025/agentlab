from __future__ import annotations

from typing import Type

from .agent import Agent

_AGENT_REGISTRY: dict[str, Type[Agent]] = {}


def register_agent(agent_cls: Type[Agent]) -> Type[Agent]:
    """装饰器:注册 agent 类。key = agent_cls.metadata.id。"""
    agent_id = agent_cls.metadata.id
    _AGENT_REGISTRY[agent_id] = agent_cls
    return agent_cls


def get_agent_class(agent_id: str) -> Type[Agent] | None:
    return _AGENT_REGISTRY.get(agent_id)


def list_agents() -> list[str]:
    return list(_AGENT_REGISTRY.keys())


def create_agent(agent_id: str) -> Agent | None:
    cls = get_agent_class(agent_id)
    return cls() if cls else None

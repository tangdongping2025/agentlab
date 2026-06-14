from __future__ import annotations
from typing import Protocol, runtime_checkable


@runtime_checkable
class Tool(Protocol):
    """工具协议。实现 name/description/input_schema + async execute(**params) -> str。"""
    name: str
    description: str
    input_schema: dict

    async def execute(self, **params) -> str: ...

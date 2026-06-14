from __future__ import annotations

import asyncio

from .agent import Agent, AgentTask
from .events import EventEmitter


async def run_agent(agent: Agent, task: AgentTask) -> EventEmitter:
    """启动 agent.run 后台 task,返回 emitter 供消费事件。

    agent.run 正常应自己 emit_done;若抛异常,这里兜底 emit_error。
    """
    emit = EventEmitter()

    async def _runner():
        try:
            await agent.run(task, emit)
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

    asyncio.create_task(_runner())
    # 让出控制,让 _runner 有机会开始(确保事件能被消费)
    await asyncio.sleep(0)
    return emit

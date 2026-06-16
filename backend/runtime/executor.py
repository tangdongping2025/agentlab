from __future__ import annotations

import asyncio

from .agent import Agent, AgentTask
from .events import EventEmitter


async def run_agent(agent: Agent, task: AgentTask) -> EventEmitter:
    """启动 agent.run 后台 task,返回 emitter 供消费事件。

    emitter.task 持有 _runner 句柄,SSE 路由在客户端断连时调 task.cancel()
    实现被动取消。CancelledError 被当作正常退出,不再 emit_error。
    """
    emit = EventEmitter()

    async def _runner():
        try:
            await agent.run(task, emit)
        except asyncio.CancelledError:
            # 取消是预期路径(SSE 断连),把流收尾后让异常继续冒泡
            try:
                await emit.emit_done()
            except Exception:
                pass
            raise
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

    emit.task = asyncio.create_task(_runner())
    # 让出控制,让 _runner 有机会开始(确保事件能被消费)
    await asyncio.sleep(0)
    return emit

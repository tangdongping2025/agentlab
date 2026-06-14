from __future__ import annotations

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage, ToolDefinition, EventType as LLMEventType
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.tools import get_tool


class BaseAgent(Agent):
    """通用 agent 基类:LLM + tool use 循环。子类定义 metadata + tool_names + system_prompt。"""

    metadata: AgentMetadata
    tool_names: list[str] = []
    system_prompt: str = ""

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )
        self._tools = [get_tool(n) for n in self.tool_names if get_tool(n)]
        self._tool_defs = [
            ToolDefinition(name=t.name, description=t.description, input_schema=t.input_schema)
            for t in self._tools
        ]
        self._tool_map = {t.name: t for t in self._tools}

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            for _ in range(5):  # 最多 5 轮 tool use
                text_buf = ""
                tool_calls: list[dict] = []
                async for ev in self._provider.stream(
                    messages,
                    system=self.system_prompt or None,
                    tools=self._tool_defs or None,
                ):
                    if ev.type == LLMEventType.TEXT:
                        text_buf += ev.text or ""
                        await emit.emit(EventType.TEXT, text=ev.text)
                    elif ev.type == LLMEventType.TOOL_USE:
                        tool_calls.append({
                            "id": ev.tool_id, "name": ev.tool_name, "input": ev.tool_input or {},
                        })
                    elif ev.type == LLMEventType.ERROR:
                        await emit.emit_error(ev.error or "stream error")
                        return
                # 一轮流结束
                if tool_calls:
                    # 回灌 assistant(text + tool_use blocks)
                    assistant_content = []
                    if text_buf:
                        assistant_content.append({"type": "text", "text": text_buf})
                    for call in tool_calls:
                        assistant_content.append({
                            "type": "tool_use", "id": call["id"],
                            "name": call["name"], "input": call["input"],
                        })
                    messages.append(LLMMessage(role="assistant", content=assistant_content))
                    # 执行每个工具 + 回灌 tool_result
                    for call in tool_calls:
                        await emit.emit(EventType.TOOL_CALL, name=call["name"], params=call["input"])
                        tool = self._tool_map.get(call["name"])
                        try:
                            tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
                        messages.append(LLMMessage(role="user", content=[
                            {"type": "tool_result", "tool_use_id": call["id"], "content": tool_result}
                        ]))
                    continue
                # 无 tool_use,结束
                await emit.emit_done()
                return
            await emit.emit_done()  # 达 max_loops 兜底
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

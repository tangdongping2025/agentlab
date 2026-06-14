from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


@register_agent
class EchoAgent(Agent):
    """回显 agent:把最后一条 user 消息回显,验证骨架(不调 LLM)。"""

    metadata = AgentMetadata(
        id="echo",
        name="Echo",
        description="回显 agent,验证载体骨架(不调 LLM)",
        workspace={"type": "chat"},
    )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        last_user = next(
            (m for m in reversed(task.messages) if m.get("role") == "user"),
            None,
        )
        text = last_user["content"] if last_user else "(无消息)"
        await emit.emit(EventType.TEXT, text=f"Echo: {text}")
        await emit.emit_done()

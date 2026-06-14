from __future__ import annotations
import json
from .registry import register_tool


class ListAgentsTool:
    """列出所有已注册的智能体。"""
    name = "list_agents"
    description = "列出所有可用的智能体(id/名称/描述),帮助用户了解能切换到哪些。"
    input_schema = {"type": "object", "properties": {}}

    async def execute(self, **params) -> str:
        from runtime.registry import _AGENT_REGISTRY
        agents = [
            {"id": cls.metadata.id, "name": cls.metadata.name, "description": cls.metadata.description}
            for cls in _AGENT_REGISTRY.values()
        ]
        return json.dumps(agents, ensure_ascii=False)


class SwitchAgentTool:
    """切换到指定智能体(平台操作,返回 _action 指令由前端执行)。"""
    name = "switch_agent"
    description = "切换到指定的智能体。用户想用别的 agent 时调用。agent_id 必填(从 list_agents 获取)。"
    input_schema = {
        "type": "object",
        "properties": {"agent_id": {"type": "string", "description": "目标 agent 的 id"}},
        "required": ["agent_id"],
    }

    async def execute(self, **params) -> str:
        return json.dumps({"_action": "switch_agent", "agent_id": params.get("agent_id", "")})


register_tool(ListAgentsTool())
register_tool(SwitchAgentTool())

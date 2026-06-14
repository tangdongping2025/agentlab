from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


@register_agent
class ResearchAgent(BaseAgent):
    """研究助手:用 anysearch 联网搜索回答。"""

    metadata = AgentMetadata(
        id="research",
        name="研究助手",
        description="联网搜索回答问题(用 anysearch 工具)",
        workspace={"type": "chat"},
    )
    tool_names = ["anysearch"]
    system_prompt = (
        "你是研究助手。回答用户问题时,如果涉及最新信息/事实/不确定的内容,"
        "用 anysearch 工具搜索,基于搜索结果回答。通用知识可直接答。"
    )

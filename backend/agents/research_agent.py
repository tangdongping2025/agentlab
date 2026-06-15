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
        "你是研究助手。【强制规则】\n"
        "1. 你不知道当前日期,训练数据已过时。任何涉及「今天」「最新」「当前」「近期」等时间相关的问题,"
        "必须先调用 anysearch 工具搜索,绝对不能凭记忆回答。\n"
        "2. 搜索返回后,严格基于搜索结果回答,不得用训练数据替换或补充事实信息。\n"
        "3. 只有纯通用知识(无时效性,如数学/定义/已定历史事件)才可直接答。"
    )

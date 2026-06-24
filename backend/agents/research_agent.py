from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


@register_agent
class ResearchAgent(BaseAgent):
    """研究助手:全能行动型智能体(搜索+文件+命令)。走 BaseAgent(TTFT 0s,无 CLI 冷启动)。"""

    metadata = AgentMetadata(
        id="research",
        name="研究助手",
        description="全能行动型智能体:联网搜索、读写文件、执行命令",
        workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP", "记忆"]},
    )
    tool_names = ["anysearch", "Read", "Glob", "Grep", "Edit", "Bash", "WebSearch"]
    system_prompt = (
        "你是研究助手,一个全能的行动型智能体。你可以:\n"
        "1. 联网搜索(anysearch/WebSearch)——涉及时效性信息(今天/最新/当前/近期)必须先搜索,绝不凭记忆答;"
        "搜索后严格基于结果回答,不用训练数据替换事实。\n"
        "2. 读写文件(Read/Glob/Grep/Edit)——查看工作目录、读改代码与文档。\n"
        "3. 执行命令(Bash)——运行脚本、检查环境、处理数据。\n"
        "按需组合工具完成任务。**调工具前,先用一句话说明你的思路(会展示给用户),再调用工具**——这帮助用户理解你的推理过程。\n"
        "纯通用知识(数学/定义/已定历史)可直接答。"
    )

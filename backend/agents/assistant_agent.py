from pathlib import Path

from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


def _load_claude_md() -> str:
    root = Path(__file__).resolve().parent.parent.parent
    md_path = root / "CLAUDE.md"
    try:
        return md_path.read_text(encoding="utf-8")
    except Exception:
        return "Context Lab 是一个智能体载体平台。"


@register_agent
class AssistantAgent(BaseAgent):
    """项目助手:调 LLM 回答平台疑问 + 用平台工具(list_agents/switch_agent)代用户操作。"""

    metadata = AgentMetadata(
        id="assistant",
        name="项目助手",
        description="回答平台疑问 + 代你切换 agent(CLAUDE.md 知识源)",
        workspace={"type": "chat"},
    )
    tool_names = ["list_agents", "switch_agent"]
    system_prompt = (
        "你是 Context Lab 的项目助手。回答用户关于本平台的疑问(怎么用、各 agent 是什么)。\n"
        "用户想切换 agent 时,用 switch_agent 工具(先 list_agents 查可用 agent)。\n\n"
        "以下是项目说明文档:\n\n"
        f"{_load_claude_md()}"
    )

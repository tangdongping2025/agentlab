"""dsh(DeepSeek Harness)载体 agent:iframe 型,部署在用户本机(start_dsh.cmd 启动)。

不参与对话 run 循环——前端按 workspace.type=iframe 分发到 IframeWorkspace,
直接 iframe 载入 dsh web UI,与本项目后端无运行时交互。
不继承 BaseAgent(其 __init__ 会初始化 ArkProvider,iframe 型不需要 LLM)。
"""
from runtime.agent import Agent, AgentMetadata
from runtime.registry import register_agent
from config import settings


@register_agent
class DshAgent(Agent):
    """DeepSeek Harness 载体 agent(iframe 型,无 run 循环)。"""

    metadata = AgentMetadata(
        id="dsh",
        name="DeepSeek Harness",
        description="DeepSeek 官方 harness·本机独立部署,iframe 载入,GLM-4.7 后端",
        workspace={"type": "iframe", "url": settings.dsh_iframe_url},
    )

    async def run(self, task, emit) -> None:  # pragma: no cover - 前端分发保证不调用
        raise NotImplementedError("dsh agent is iframe-only")

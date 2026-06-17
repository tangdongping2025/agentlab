from unittest.mock import patch
from claude_agent_sdk import (
    AssistantMessage,
    TextBlock,
    ResultMessage,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
)
from claude_agent_sdk.types import StreamEvent

from runtime.agent import AgentTask
from runtime.events import EventEmitter, EventType


def test_claude_sdk_agent_registered():
    import agents  # 触发注册
    from runtime.registry import get_agent_class
    assert get_agent_class("claude-sdk") is not None


def test_claude_sdk_agent_metadata():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    assert agent is not None
    m = agent.metadata
    assert m.id == "claude-sdk"
    assert m.workspace == {"type": "tabs", "tabs": ["对话", "文件"]}
    assert m.capabilities  # 非空,声明能力


def test_messages_to_prompt_keeps_assistant_history():
    """多轮:_messages_to_prompt 必须保留 assistant 回复,否则 agent 看不到之前结果会重做。"""
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    messages = [
        {"role": "user", "content": "列出文件"},
        {"role": "assistant", "content": "sample.py, README.md"},
        {"role": "user", "content": "读 sample.py"},
    ]
    prompt = ClaudeSdkAgent._messages_to_prompt(messages)
    assert "sample.py, README.md" in prompt  # assistant 历史保留
    assert "读 sample.py" in prompt  # 最新请求在
    assert "已完成" in prompt or "请勿重复" in prompt  # 标注不重做


def test_messages_to_prompt_single_turn():
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    prompt = ClaudeSdkAgent._messages_to_prompt([{"role": "user", "content": "hi"}])
    assert "hi" in prompt


async def _fake_query_text_only(*, prompt, options=None, transport=None):
    yield AssistantMessage(content=[TextBlock(text="PONG")], model="glm-5.2")
    yield ResultMessage(
        subtype="success",
        duration_ms=100,
        duration_api_ms=90,
        is_error=False,
        num_turns=1,
        session_id="s1",
        usage={"input_tokens": 10, "output_tokens": 5},
    )


async def test_run_maps_text_done_token_usage():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_text_only):
        await agent.run(
            AgentTask(messages=[{"role": "user", "content": "ping"}]),
            emit,
        )
    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.TEXT in types
    assert EventType.DONE in types
    assert EventType.TOKEN_USAGE in types
    text_evt = next(e for e in events if e.type == EventType.TEXT)
    assert text_evt.data.get("text") == "PONG"
    usage_evt = next(e for e in events if e.type == EventType.TOKEN_USAGE)
    assert usage_evt.data.get("input_tokens") == 10
    assert usage_evt.data.get("output_tokens") == 5


async def _fake_query_with_tools(*, prompt, options=None, transport=None):
    # Claude 自主跑了一轮工具:先思考,调 Bash,拿结果,再回复
    yield AssistantMessage(
        content=[
            ThinkingBlock(thinking="要看目录", signature="sig"),
            ToolUseBlock(id="t1", name="Bash", input={"command": "ls"}),
        ],
        model="glm-5.2",
    )
    yield AssistantMessage(
        content=[
            ToolResultBlock(tool_use_id="t1", content="sample.py\nREADME.md"),
        ],
        model="glm-5.2",
    )
    yield AssistantMessage(content=[TextBlock(text="目录里有 sample.py")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=200, duration_api_ms=180,
        is_error=False, num_turns=2, session_id="s2",
        usage={"input_tokens": 50, "output_tokens": 20},
    )


async def test_run_maps_thinking_tool_call_tool_result():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_with_tools):
        await agent.run(
            AgentTask(messages=[{"role": "user", "content": "目录有啥"}]),
            emit,
        )
    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.THINKING in types
    assert EventType.TOOL_CALL in types
    assert EventType.TOOL_RESULT in types
    think_evt = next(e for e in events if e.type == EventType.THINKING)
    assert "看目录" in think_evt.data.get("thinking", "")
    call_evt = next(e for e in events if e.type == EventType.TOOL_CALL)
    assert call_evt.data.get("name") == "Bash"
    assert call_evt.data.get("params") == {"command": "ls"}
    res_evt = next(e for e in events if e.type == EventType.TOOL_RESULT)
    assert "sample.py" in res_evt.data.get("result", "")


async def _fake_query_raises(*, prompt, options=None, transport=None):
    raise RuntimeError("boom")
    yield  # 让它成为 async generator


async def _fake_query_error_result(*, prompt, options=None, transport=None):
    yield ResultMessage(
        subtype="error_max_turns", duration_ms=1, duration_api_ms=1,
        is_error=True, num_turns=10, session_id="s3",
        result="超过最大轮数",
    )


async def test_run_emits_error_on_query_exception():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_raises):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)


async def test_run_emits_error_on_failed_result():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_error_result):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert "error_max_turns" in err.data.get("error", "")


async def _fake_query_streaming(*, prompt, options=None, transport=None):
    yield StreamEvent(uuid="u1", session_id="s", event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "你好"}})
    yield StreamEvent(uuid="u2", session_id="s", event={"type": "content_block_delta", "delta": {"type": "text_delta", "text": "世界"}})
    yield AssistantMessage(content=[TextBlock(text="你好世界")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=1, duration_api_ms=1,
        is_error=False, num_turns=1, session_id="s",
        usage={"input_tokens": 1, "output_tokens": 1},
    )


async def test_run_streams_text_delta_and_skips_full():
    """开 include_partial_messages 后:text_delta 流式 emit,完整 TextBlock 跳过(避免重复)。"""
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_streaming):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)
    events = [e async for e in emit]
    text_evts = [e for e in events if e.type == EventType.TEXT]
    assert len(text_evts) == 2  # 2 个 text_delta 各 emit 一次
    assert text_evts[0].data.get("text") == "你好"
    assert text_evts[1].data.get("text") == "世界"
    assert all(e.data.get("text") != "你好世界" for e in text_evts)  # 完整 text 被 saw_partial 跳过


def test_claude_sdk_agent_appends_skill_prompt(monkeypatch):
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.agent import AgentTask

    monkeypatch.setattr("runtime.claude_sdk_agent._build_mcp_servers", lambda: {})
    monkeypatch.setattr("runtime.claude_sdk_agent.build_global_prompt_for_agent", lambda agent_id: "全局规则\n")
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id: "\n[启用的 Skill: test]\n规则 B\n[/Skill]\n")

    options = ClaudeSdkAgent()._build_options(AgentTask(messages=[{"role": "user", "content": "hi"}]))

    assert options.system_prompt.index("全局规则") < options.system_prompt.index("你是一个运行在 context-lab")
    assert options.system_prompt.index("你是一个运行在 context-lab") < options.system_prompt.index("规则 B")


def test_build_options_uses_cwd():
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.agent import AgentTask
    agent = ClaudeSdkAgent()
    opts = agent._build_options(AgentTask(messages=[], cwd="/some/path"))
    assert opts.cwd == "/some/path"


def test_build_options_default_cwd():
    from runtime.claude_sdk_agent import ClaudeSdkAgent, _SANDBOX_DIR
    from runtime.agent import AgentTask
    agent = ClaudeSdkAgent()
    opts = agent._build_options(AgentTask(messages=[]))
    assert opts.cwd == _SANDBOX_DIR


def test_claude_sdk_agent_metadata_tabs():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    assert agent.metadata.workspace == {"type": "tabs", "tabs": ["对话", "文件"]}


def test_amap_mcp_command_on_windows(monkeypatch):
    """Windows 用 cmd /c npx — Python subprocess 在 Windows 跑 npx 必须经 cmd 包装。"""
    import sys
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    from runtime.claude_sdk_agent import _build_mcp_servers
    servers = _build_mcp_servers()
    cfg = servers["amap-maps"]
    assert cfg["command"] == "cmd"
    assert cfg["args"][:2] == ["/c", "npx"]
    assert cfg["env"]["AMAP_MAPS_API_KEY"] == "fake-key"


def test_amap_mcp_command_on_linux(monkeypatch):
    """Linux 容器没有 cmd,直接 npx — 这次回归就是它。"""
    import sys
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    # 预装路径不存在时回退到 npx
    monkeypatch.setattr("os.path.isfile", lambda p: False)
    from runtime.claude_sdk_agent import _build_mcp_servers
    servers = _build_mcp_servers()
    cfg = servers["amap-maps"]
    assert cfg["command"] == "npx"
    assert "/c" not in cfg["args"]
    assert cfg["args"][0] == "-y"


def test_amap_mcp_uses_preinstalled_on_linux(monkeypatch):
    """Linux 容器内有预装 node_modules 时,绕过 npx 直接 node 启动 —— 容器 npm registry 不可达时的逃生路径。"""
    import sys
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    from runtime import claude_sdk_agent as mod
    monkeypatch.setattr(
        "os.path.isfile",
        lambda p: p == mod._AMAP_PREINSTALLED_ENTRY,
    )
    servers = mod._build_mcp_servers()
    cfg = servers["amap-maps"]
    assert cfg["command"] == "node"
    assert cfg["args"] == [mod._AMAP_PREINSTALLED_ENTRY]


def test_amap_mcp_skipped_when_key_missing(monkeypatch):
    monkeypatch.delenv("AMAP_MAPS_API_KEY", raising=False)
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()


def test_amap_mcp_skipped_when_disabled(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": False, "agentIds": ["claude-sdk"], "launchMode": "auto"}}
    })
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()


def test_amap_mcp_skipped_when_agent_not_selected(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": [], "launchMode": "auto"}}
    })
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()


def test_amap_mcp_bundled_mode_missing_entry_skips(monkeypatch):
    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr("runtime.claude_sdk_agent.load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["claude-sdk"], "launchMode": "bundled"}}
    })
    monkeypatch.setattr("os.path.isfile", lambda p: False)
    from runtime.claude_sdk_agent import _build_mcp_servers
    assert "amap-maps" not in _build_mcp_servers()

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
    assert m.workspace == {"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP"]}
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


def _long_history_messages():
    messages = []
    for i in range(14):
        messages.extend([
            {"role": "user", "content": f"问题{i}-" + "甲" * 1800},
            {"role": "assistant", "content": f"回答{i}-" + "乙" * 1800},
        ])
    messages.append({"role": "user", "content": "当前问题"})
    return messages


def _save_session_messages(db, session_id, messages):
    import models

    db.add(models.SessionModel(id=session_id, agent_id="claude-sdk"))
    for seq, message in enumerate(messages):
        db.add(models.MessageModel(
            session_id=session_id,
            seq=seq,
            role=message["role"],
            content=message["content"],
        ))
    db.commit()


def test_load_runtime_messages_returns_request_messages_without_session_id():
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    request_messages = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "next"},
    ]

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        None,
        AgentTask(messages=request_messages),
    )

    assert runtime_messages == request_messages


def test_load_runtime_messages_does_not_append_when_request_window_is_history_suffix(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    history = [
        {"role": "user", "content": "早期问题"},
        {"role": "assistant", "content": "早期回答"},
        {"role": "user", "content": "最近问题"},
        {"role": "assistant", "content": "最近回答"},
    ]
    _save_session_messages(db, "suffix-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="suffix-session",
            messages=history[-2:],
        ),
    )

    assert runtime_messages == history


def test_load_runtime_messages_appends_current_message_when_not_history_suffix(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    history = [
        {"role": "user", "content": "早期问题"},
        {"role": "assistant", "content": "早期回答"},
    ]
    current_message = {"role": "user", "content": "当前新问题"}
    _save_session_messages(db, "append-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="append-session",
            messages=[history[-1], current_message],
        ),
    )

    assert runtime_messages == history + [current_message]


def test_load_runtime_messages_keeps_same_content_new_input_when_window_not_suffix(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    repeated_message = {"role": "user", "content": "同一个问题"}
    request_window = [
        {"role": "assistant", "content": "前端窗口里的另一条回答"},
        repeated_message,
    ]
    history = [
        {"role": "assistant", "content": "之前的回答"},
        repeated_message,
    ]
    _save_session_messages(db, "repeated-input-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="repeated-input-session",
            messages=request_window,
        ),
    )

    assert runtime_messages == history + request_window
    assert runtime_messages.count(repeated_message) == 2


def test_load_runtime_messages_appends_all_unsaved_request_tail_after_overlap(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    history = [
        {"role": "user", "content": "已落库问题"},
        {"role": "assistant", "content": "已落库回答"},
    ]
    unsaved_tail = [
        {"role": "user", "content": "未落库问题"},
        {"role": "assistant", "content": "未落库回答"},
        {"role": "user", "content": "当前问题"},
    ]
    _save_session_messages(db, "stale-db-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="stale-db-session",
            messages=[history[-1], *unsaved_tail],
        ),
    )

    assert runtime_messages == history + unsaved_tail


def test_load_runtime_messages_keeps_single_same_content_user_retry(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    repeated_message = {"role": "user", "content": "同一个问题"}
    _save_session_messages(db, "single-retry-session", [repeated_message])

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="single-retry-session",
            messages=[repeated_message],
        ),
    )

    assert runtime_messages == [repeated_message, repeated_message]


def test_load_runtime_messages_keeps_unsaved_tail_without_overlap_from_first_user(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    history = [
        {"role": "user", "content": "已落库问题"},
        {"role": "assistant", "content": "已落库回答"},
    ]
    unsaved_tail = [
        {"role": "user", "content": "未落库问题"},
        {"role": "assistant", "content": "未落库回答"},
        {"role": "user", "content": "当前问题"},
    ]
    _save_session_messages(db, "no-overlap-stale-db-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="no-overlap-stale-db-session",
            messages=unsaved_tail,
        ),
    )

    assert runtime_messages == history + unsaved_tail


def test_load_runtime_messages_keeps_unsaved_assistant_tail_without_overlap(db):
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    history = [
        {"role": "user", "content": "已落库问题"},
    ]
    unsaved_tail = [
        {"role": "assistant", "content": "未落库回答"},
        {"role": "user", "content": "当前问题"},
    ]
    _save_session_messages(db, "no-overlap-assistant-tail-session", history)

    runtime_messages = ClaudeSdkAgent()._load_runtime_messages(
        db,
        AgentTask(
            sessionId="no-overlap-assistant-tail-session",
            messages=unsaved_tail,
        ),
    )

    assert runtime_messages == history + unsaved_tail


async def test_claude_sdk_agent_compresses_long_history_and_emits_strategy_effect(tmp_path, monkeypatch):
    import agents
    from runtime.registry import create_agent

    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="压缩后回答")], model="glm-5.2")
        yield ResultMessage(
            subtype="success",
            duration_ms=100,
            duration_api_ms=90,
            is_error=False,
            num_turns=1,
            session_id="s-long",
            usage={"input_tokens": 10, "output_tokens": 5},
        )

    messages = _long_history_messages()

    monkeypatch.setattr("runtime.claude_sdk_agent._SANDBOX_DIR", str(tmp_path))
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id, cwd=None: "")
    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=messages, sessionId="session-long", cwd=str(tmp_path)), emit)

    events = [e async for e in emit]
    prompt = captured["prompt"]
    assert "以下是早期对话摘要" in prompt
    assert "当前问题" in prompt

    action_evt = next(
        e for e in events
        if e.type == EventType.ACTION and e.data.get("action") == "strategy_effect"
    )
    assert action_evt.data.get("strategy") == "context_compression"
    assert action_evt.data.get("triggered") is True
    assert action_evt.data.get("summarySourceCount") > 0

    log_path = tmp_path / "logcompress.md"
    assert log_path.exists()
    assert "session-long" in log_path.read_text(encoding="utf-8")


async def test_claude_sdk_agent_continues_when_save_summary_fails(tmp_path, monkeypatch):
    import agents
    from runtime.registry import create_agent

    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="压缩后回答")], model="glm-5.2")
        yield ResultMessage(
            subtype="success",
            duration_ms=100,
            duration_api_ms=90,
            is_error=False,
            num_turns=1,
            session_id="s-save-fails",
            usage={"input_tokens": 10, "output_tokens": 5},
        )

    def raise_save_error(db, session_id, state):
        raise RuntimeError("save failed")

    monkeypatch.setattr("runtime.claude_sdk_agent._SANDBOX_DIR", str(tmp_path))
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id, cwd=None: "")
    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)
    monkeypatch.setattr("runtime.claude_sdk_agent.save_summary_state", raise_save_error)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=_long_history_messages(), sessionId="session-save-fails", cwd=str(tmp_path)), emit)

    events = [e async for e in emit]
    assert "prompt" in captured
    assert any(e.type == EventType.TEXT and e.data.get("text") == "压缩后回答" for e in events)
    assert any(e.type == EventType.DONE for e in events)
    assert not any(e.type == EventType.ERROR for e in events)


async def test_claude_sdk_agent_continues_when_compression_log_fails(tmp_path, monkeypatch):
    import agents
    from runtime.registry import create_agent

    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="压缩后回答")], model="glm-5.2")
        yield ResultMessage(
            subtype="success",
            duration_ms=100,
            duration_api_ms=90,
            is_error=False,
            num_turns=1,
            session_id="s-log-fails",
            usage={"input_tokens": 10, "output_tokens": 5},
        )

    def raise_log_error(path, *, session_id, agent_id, result):
        raise OSError("log failed")

    monkeypatch.setattr("runtime.claude_sdk_agent._SANDBOX_DIR", str(tmp_path))
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id, cwd=None: "")
    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)
    monkeypatch.setattr("runtime.claude_sdk_agent.append_compression_log", raise_log_error)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=_long_history_messages(), sessionId="session-log-fails", cwd=str(tmp_path)), emit)

    events = [e async for e in emit]
    assert "prompt" in captured
    assert any(e.type == EventType.TEXT and e.data.get("text") == "压缩后回答" for e in events)
    assert any(e.type == EventType.DONE for e in events)
    assert not any(e.type == EventType.ERROR for e in events)


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
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id, cwd=None: "\n[启用的 Skill: test]\n规则 B\n[/Skill]\n")

    options = ClaudeSdkAgent()._build_options(AgentTask(messages=[{"role": "user", "content": "hi"}]))

    assert options.system_prompt.index("全局规则") < options.system_prompt.index("你是一个运行在 context-lab")
    assert options.system_prompt.index("你是一个运行在 context-lab") < options.system_prompt.index("规则 B")


def test_build_options_uses_cwd(monkeypatch):
    monkeypatch.setattr("runtime.claude_sdk_agent.build_skill_prompt_for_agent", lambda agent_id, cwd=None: "")
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
    assert agent.metadata.workspace == {"type": "tabs", "tabs": ["对话", "文件", "Skill", "MCP"]}


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


async def test_claude_sdk_agent_loads_full_session_history_when_frontend_sends_window(client, db, monkeypatch):
    from runtime.agent import AgentTask
    from runtime.claude_sdk_agent import ClaudeSdkAgent
    from runtime.events import EventEmitter

    client.post("/api/db/sessions", json={"id": "full-history-session", "agentId": "claude-sdk"})
    client.put("/api/db/sessions/full-history-session", json={
        "messages": [
            {"role": "user", "content": "早期关键事实：项目代号是 lobster"},
            {"role": "assistant", "content": "记住了"},
            {"role": "user", "content": "最近问题"},
        ]
    })
    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="ok")], model="glm-5.2")
        yield ResultMessage(
            subtype="success", duration_ms=1, duration_api_ms=1,
            is_error=False, num_turns=1, session_id="s",
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    agent = ClaudeSdkAgent()
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=fake_query):
        await agent.run(
            AgentTask(
                sessionId="full-history-session",
                messages=[{"role": "user", "content": "最近问题"}],
            ),
            emit,
        )

    assert "早期关键事实：项目代号是 lobster" in captured["prompt"]
    assert "最近问题" in captured["prompt"]

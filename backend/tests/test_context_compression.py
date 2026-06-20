from runtime.context_compression import (
    HARD_CHAR_LIMIT,
    SOFT_CHAR_LIMIT,
    RuntimeContextResult,
    append_compression_log,
    build_runtime_context,
)


def _pair(i: int, size: int = 8):
    return [
        {"role": "user", "content": f"问题{i}-" + "甲" * size},
        {"role": "assistant", "content": f"回答{i}-" + "乙" * size},
    ]


def test_runtime_context_uses_full_history_under_soft_limit():
    messages = [
        {"role": "user", "content": "列出文件"},
        {"role": "assistant", "content": "README.md"},
        {"role": "user", "content": "继续"},
    ]

    result = build_runtime_context(messages, summary_state=None)

    assert len(result.prompt) < SOFT_CHAR_LIMIT
    assert result.triggered is False
    assert result.summary is None
    assert "README.md" in result.prompt
    assert "请回答当前最新请求" in result.prompt
    assert result.summary_until_message_index is None


def test_runtime_context_compresses_older_messages_over_soft_limit():
    messages = []
    for i in range(14):
        messages.extend(_pair(i, size=1800))
    messages.append({"role": "user", "content": "当前问题"})

    result = build_runtime_context(messages, summary_state=None)

    assert result.triggered is True
    assert result.reason == "soft_threshold"
    assert "以下是早期对话摘要" in result.prompt
    assert "以下是最近 8 轮完整对话" in result.prompt
    assert "当前问题" in result.prompt
    assert result.summary_until_message_index is not None
    assert result.summary_until_message_index < len(messages) - 1
    assert "问题13" in result.prompt
    assert "回答13" in result.prompt
    assert "问题0" in result.summary


def test_runtime_context_keeps_eight_turn_window_when_compressed_prompt_is_under_hard_limit():
    messages = []
    for i in range(20):
        messages.extend(_pair(i, size=3500))
    messages.append({"role": "user", "content": "当前问题"})

    result = build_runtime_context(messages, summary_state=None)

    assert result.before_chars > HARD_CHAR_LIMIT
    assert len(result.prompt) <= HARD_CHAR_LIMIT
    assert result.triggered is True
    assert result.hard_fallback is False
    assert result.recent_full_turns == 8
    assert "以下是最近 8 轮完整对话" in result.prompt
    assert "问题19" in result.prompt


def test_runtime_context_uses_four_turn_window_when_compressed_prompt_still_exceeds_hard_limit():
    messages = []
    for i in range(20):
        messages.extend(_pair(i, size=5000))
    messages.append({"role": "user", "content": "当前问题"})

    result = build_runtime_context(messages, summary_state=None)

    assert result.triggered is True
    assert result.hard_fallback is True
    assert result.recent_full_turns == 4
    assert len(result.prompt) <= HARD_CHAR_LIMIT
    assert "以下是最近 4 轮完整对话" in result.prompt
    assert "问题19" in result.prompt
    assert "问题0" in result.summary


def test_runtime_context_incrementally_extends_existing_summary():
    messages = []
    for i in range(16):
        messages.extend(_pair(i, size=1600))
    messages.append({"role": "user", "content": "当前问题"})
    state = {
        "contextSummary": "旧摘要：已经讨论过 A。",
        "summaryUntilMessageIndex": 8,
    }

    result = build_runtime_context(messages, summary_state=state)

    assert result.triggered is True
    assert "旧摘要：已经讨论过 A。" in result.summary
    assert result.summary_until_message_index > 8
    assert "问题5" not in result.prompt
    assert "问题15" in result.prompt


def test_runtime_context_does_not_mutate_original_messages():
    messages = []
    for i in range(14):
        messages.extend(_pair(i, size=1800))
    messages.append({"role": "user", "content": "当前问题"})
    snapshot = [dict(m) for m in messages]

    build_runtime_context(messages, summary_state=None)

    assert messages == snapshot
    assert len(messages) == len(snapshot)


def test_append_compression_log_records_markdown_entry(tmp_path):
    log_path = tmp_path / "logcompress.md"
    result = RuntimeContextResult(
        prompt="short",
        triggered=True,
        reason="soft_threshold",
        summary="摘要",
        summary_until_message_index=24,
        before_chars=52640,
        runtime_chars=18320,
        recent_full_turns=8,
        hard_fallback=False,
    )

    append_compression_log(log_path, session_id="s1", agent_id="claude-sdk", result=result)

    content = log_path.read_text(encoding="utf-8")
    assert "## " in content
    assert "- Session: s1" in content
    assert "- Agent: claude-sdk" in content
    assert "- Reason: soft_threshold" in content
    assert "- Before chars: 52640" in content
    assert "- Runtime chars: 18320" in content
    assert "- Summary until message index: 24" in content
    assert "- Recent full turns: 8" in content
    assert "- Hard fallback: false" in content

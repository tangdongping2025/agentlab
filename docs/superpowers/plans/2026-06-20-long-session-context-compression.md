# 长会话上下文压缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent workspace 增加长会话运行时上下文压缩，减少慢响应和 SSE 超时，同时完整保留 MySQL 原始会话记录。

**Architecture:** 后端新增独立 `runtime/context_compression.py` 负责字符阈值、摘要视图、增量摘要元数据和 `logcompress.md` 记录。摘要元数据存入现有 `app_settings` JSON，避免新增 MySQL 列导致线上老表无法自动迁移；原始 `messages` 继续作为真相源完整保存。Claude SDK Agent 在运行前调用压缩器组装 prompt，并通过现有 `action: strategy_effect` 事件向前端轻提示压缩结果；nginx 只做 SSE 超时配套调整。

**Tech Stack:** Python FastAPI + SQLAlchemy + MySQL JSON setting；React 18 + Zustand + Vitest；nginx SSE reverse proxy；pytest。

---

## File Structure

- Create: `backend/runtime/context_compression.py` — 纯后端上下文压缩模块，包含阈值常量、消息字符统计、最近轮次窗口、摘要生成、运行时 prompt 组装、`app_settings` 摘要读写、`logcompress.md` 追加。
- Modify: `backend/runtime/agent.py` — `AgentTask` 增加可选 `sessionId`，让后端能按会话存取摘要元数据和日志。
- Modify: `backend/routers/agents.py` — 接收请求体中的 `sessionId` 并传入 `AgentTask`；保持 SSE 响应格式不变。
- Modify: `backend/runtime/claude_sdk_agent.py` — 用 `build_context_prompt()` 替代 `_messages_to_prompt()` 的全量历史拼接；触发压缩时 emit `strategy_effect` action。
- Modify: `src/services/agentRuntimeApi.ts` — `runAgent()` 增加可选 `sessionId` 参数，并随 POST body 发送。
- Modify: `src/stores/agentRuntimeStore.ts` — workspace 运行时把 `workspaceSessionId` 传给 `runAgent()`；错误分支顺手落库失败消息，便于历史复盘。
- Modify: `src/services/eventAdapter.ts` — 复用 `strategy_effect`，显示“已自动压缩早期上下文”；保留已有可观察性结构。
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx` — 在对话区渲染压缩轻提示，不弹窗、不打断。
- Modify: `nginx.conf` — `/api/agents` 增加长 SSE timeout。
- Modify: `项目执行跟踪矩阵.md` — 增加本 RQ 的 spec/plan/验证记录。
- Test: `backend/tests/test_context_compression.py` — 压缩模块单元测试。
- Test: `backend/tests/test_claude_sdk_agent.py` — Claude SDK Agent 使用压缩 prompt 和 emit action 的回归测试。
- Test: `backend/tests/test_agents_api.py` — POST `/api/agents/claude-sdk/run` 能携带 `sessionId`。
- Test: `src/stores/agentRuntimeStore.test.ts` — workspace run 传递 sessionId。
- Test: `src/services/eventAdapter.test.ts` — 压缩 action 聚合和展示。
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx` — 压缩轻提示渲染。

---

### Task 1: 后端压缩核心模块

**Files:**
- Create: `backend/runtime/context_compression.py`
- Test: `backend/tests/test_context_compression.py`

- [ ] **Step 1: Write failing tests for prompt building and threshold behavior**

Create `backend/tests/test_context_compression.py` with:

```python
from runtime.context_compression import (
    build_runtime_context,
    SOFT_CHAR_LIMIT,
    HARD_CHAR_LIMIT,
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


def test_runtime_context_uses_four_turn_window_when_hard_limit_still_exceeded():
    messages = []
    for i in range(20):
        messages.extend(_pair(i, size=3500))
    messages.append({"role": "user", "content": "当前问题"})

    result = build_runtime_context(messages, summary_state=None)

    assert result.triggered is True
    assert result.hard_fallback is True
    assert result.recent_full_turns == 4
    assert len(result.prompt) <= HARD_CHAR_LIMIT
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'runtime.context_compression'`.

- [ ] **Step 3: Implement minimal context compression module**

Create `backend/runtime/context_compression.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

SOFT_CHAR_LIMIT = 40_000
HARD_CHAR_LIMIT = 80_000
RECENT_FULL_TURNS = 8
HARD_FALLBACK_TURNS = 4
MAX_INCREMENTAL_TURNS = 12
MAX_INCREMENTAL_CHARS = 20_000
SUMMARY_CHAR_LIMIT = 12_000


@dataclass
class RuntimeContextResult:
    prompt: str
    triggered: bool
    reason: str | None = None
    summary: str | None = None
    summary_until_message_index: int | None = None
    before_chars: int = 0
    runtime_chars: int = 0
    recent_full_turns: int = RECENT_FULL_TURNS
    hard_fallback: bool = False


def _message_text(message: dict[str, Any]) -> str:
    role = "用户" if message.get("role") == "user" else "助手"
    return f"{role}: {message.get('content', '')}"


def _chars(messages: list[dict[str, Any]]) -> int:
    return sum(len(_message_text(message)) for message in messages)


def _recent_window_start(history: list[dict[str, Any]], turns: int) -> int:
    user_seen = 0
    for index in range(len(history) - 1, -1, -1):
        if history[index].get("role") == "user":
            user_seen += 1
            if user_seen >= turns:
                return index
    return 0


def _compact_summary(old_summary: str, source_messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    if old_summary.strip():
        lines.append(old_summary.strip())
    for message in source_messages:
        content = str(message.get("content", "")).strip().replace("\r\n", "\n")
        if not content:
            continue
        role = "用户" if message.get("role") == "user" else "助手"
        snippet = content[:700]
        if len(content) > 700:
            snippet += "…"
        lines.append(f"- {role}: {snippet}")
    summary = "\n".join(lines).strip()
    if len(summary) > SUMMARY_CHAR_LIMIT:
        summary = summary[-SUMMARY_CHAR_LIMIT:]
    return summary


def _full_prompt(history: list[dict[str, Any]], current: dict[str, Any]) -> str:
    lines = [_message_text(message) for message in history]
    prompt = ""
    if lines:
        prompt = "以下是之前的对话历史(已完成,请勿重复执行):\n" + "\n".join(lines) + "\n\n"
    prompt += f"请回答当前最新请求:\n用户: {current.get('content', '')}"
    return prompt


def _compressed_prompt(summary: str, recent: list[dict[str, Any]], current: dict[str, Any], turns: int) -> str:
    lines = [_message_text(message) for message in recent]
    return (
        "以下是早期对话摘要(原始记录仍完整保留,此摘要仅用于本次运行):\n"
        f"{summary}\n\n"
        f"以下是最近 {turns} 轮完整对话:\n"
        f"{'\n'.join(lines)}\n\n"
        "请回答当前最新请求:\n"
        f"用户: {current.get('content', '')}"
    )


def build_runtime_context(messages: list[dict[str, Any]], summary_state: dict[str, Any] | None) -> RuntimeContextResult:
    if not messages:
        return RuntimeContextResult(prompt=" ")

    *history, current = messages
    full = _full_prompt(history, current)
    before_chars = len(full)
    state = summary_state or {}
    previous_until = int(state.get("summaryUntilMessageIndex") or 0)
    old_summary = str(state.get("contextSummary") or "")

    if before_chars <= SOFT_CHAR_LIMIT and not _needs_incremental_compression(history, previous_until):
        return RuntimeContextResult(prompt=full, triggered=False, before_chars=before_chars, runtime_chars=len(full))

    result = _build_compressed(history, current, old_summary, previous_until, RECENT_FULL_TURNS, before_chars, "soft_threshold")
    if len(result.prompt) > HARD_CHAR_LIMIT:
        result = _build_compressed(history, current, old_summary, previous_until, HARD_FALLBACK_TURNS, before_chars, "hard_threshold")
        result.hard_fallback = True
    if len(result.prompt) > HARD_CHAR_LIMIT:
        result.prompt = result.prompt[-HARD_CHAR_LIMIT:]
        result.runtime_chars = len(result.prompt)
    return result


def _needs_incremental_compression(history: list[dict[str, Any]], previous_until: int) -> bool:
    if not previous_until:
        return False
    new_messages = history[previous_until:]
    new_turns = sum(1 for message in new_messages if message.get("role") == "user")
    return new_turns > MAX_INCREMENTAL_TURNS or _chars(new_messages) > MAX_INCREMENTAL_CHARS


def _build_compressed(
    history: list[dict[str, Any]],
    current: dict[str, Any],
    old_summary: str,
    previous_until: int,
    turns: int,
    before_chars: int,
    reason: str,
) -> RuntimeContextResult:
    recent_start = _recent_window_start(history, turns)
    source_start = min(previous_until, recent_start)
    source_messages = history[source_start:recent_start]
    summary = _compact_summary(old_summary, source_messages)
    prompt = _compressed_prompt(summary, history[recent_start:], current, turns)
    return RuntimeContextResult(
        prompt=prompt,
        triggered=True,
        reason=reason,
        summary=summary,
        summary_until_message_index=recent_start,
        before_chars=before_chars,
        runtime_chars=len(prompt),
        recent_full_turns=turns,
    )


def append_compression_log(path: Path, *, session_id: str, agent_id: str, result: RuntimeContextResult) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = (
        f"\n## {now}\n\n"
        f"- Session: {session_id}\n"
        f"- Agent: {agent_id}\n"
        f"- Reason: {result.reason}\n"
        f"- Before chars: {result.before_chars}\n"
        f"- Runtime chars: {result.runtime_chars}\n"
        f"- Summary until message index: {result.summary_until_message_index}\n"
        f"- Recent full turns: {result.recent_full_turns}\n"
        f"- Hard fallback: {str(result.hard_fallback).lower()}\n"
    )
    with path.open("a", encoding="utf-8") as f:
        f.write(entry)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py -q
```

Expected: PASS.

- [ ] **Step 5: Add log file test**

Append to `backend/tests/test_context_compression.py`:

```python

def test_append_compression_log_records_markdown_entry(tmp_path):
    from runtime.context_compression import RuntimeContextResult, append_compression_log

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
```

- [ ] **Step 6: Run log test red/green**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py::test_append_compression_log_records_markdown_entry -q
```

Expected after Step 3 implementation: PASS. If it fails due path or content mismatch, fix only `append_compression_log()`.

- [ ] **Step 7: Commit Task 1**

```bash
git add backend/runtime/context_compression.py backend/tests/test_context_compression.py
git commit -m "feat(runtime): 添加长会话上下文压缩核心"
```

---

### Task 2: 摘要元数据读写与 AgentTask sessionId

**Files:**
- Modify: `backend/runtime/agent.py:18-24`
- Modify: `backend/runtime/context_compression.py`
- Modify: `backend/routers/agents.py:40-62`
- Test: `backend/tests/test_context_compression.py`
- Test: `backend/tests/test_agents_api.py`

- [ ] **Step 1: Write failing tests for app_settings summary persistence**

Append to `backend/tests/test_context_compression.py`:

```python

def test_summary_state_round_trip_uses_app_settings(db):
    from runtime.context_compression import load_summary_state, save_summary_state

    save_summary_state(db, "session-a", {
        "contextSummary": "旧摘要",
        "summaryUntilMessageIndex": 12,
        "summaryUpdatedAt": "2026-06-20T12:00:00",
    })

    loaded = load_summary_state(db, "session-a")

    assert loaded["contextSummary"] == "旧摘要"
    assert loaded["summaryUntilMessageIndex"] == 12
    assert loaded["summaryUpdatedAt"] == "2026-06-20T12:00:00"


def test_summary_state_missing_returns_empty_dict(db):
    from runtime.context_compression import load_summary_state

    assert load_summary_state(db, "missing-session") == {}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py::test_summary_state_round_trip_uses_app_settings tests/test_context_compression.py::test_summary_state_missing_returns_empty_dict -q
```

Expected: FAIL because `load_summary_state` / `save_summary_state` do not exist.

- [ ] **Step 3: Implement app_settings summary persistence**

Append to `backend/runtime/context_compression.py`:

```python

def _summary_key(session_id: str) -> str:
    return f"context_summary:{session_id}"


def load_summary_state(db, session_id: str | None) -> dict[str, Any]:
    if not session_id:
        return {}
    import models
    row = db.get(models.AppSettingModel, _summary_key(session_id))
    if not row or not isinstance(row.setting_value, dict):
        return {}
    return row.setting_value


def save_summary_state(db, session_id: str | None, state: dict[str, Any]) -> None:
    if not session_id:
        return
    import models
    key = _summary_key(session_id)
    row = db.get(models.AppSettingModel, key)
    if row is None:
        row = models.AppSettingModel(setting_key=key, setting_value=state)
        db.add(row)
    else:
        row.setting_value = state
    db.commit()
```

- [ ] **Step 4: Run persistence tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py::test_summary_state_round_trip_uses_app_settings tests/test_context_compression.py::test_summary_state_missing_returns_empty_dict -q
```

Expected: PASS.

- [ ] **Step 5: Write failing API test for sessionId passing**

Append to `backend/tests/test_agents_api.py`:

```python
async def _fake_query_captures_session_id(*, prompt, options=None, transport=None):
    yield AssistantMessage(content=[TextBlock(text="ok")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=1, duration_api_ms=1,
        is_error=False, num_turns=1, session_id="s",
        usage={"input_tokens": 1, "output_tokens": 1},
    )


def test_run_claude_sdk_accepts_session_id(client):
    import agents
    from runtime.claude_sdk_agent import ClaudeSdkAgent

    seen = {}
    original = ClaudeSdkAgent.run

    async def capture_run(self, task, emit):
        seen["sessionId"] = task.sessionId
        await original(self, task, emit)

    with patch("runtime.claude_sdk_agent.query", new=_fake_query_captures_session_id):
        with patch.object(ClaudeSdkAgent, "run", new=capture_run):
            resp = client.post(
                "/api/agents/claude-sdk/run",
                json={"sessionId": "session-123", "messages": [{"role": "user", "content": "ping"}]},
            )

    assert resp.status_code == 200
    assert seen["sessionId"] == "session-123"
```

- [ ] **Step 6: Run API test to verify it fails**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py::test_run_claude_sdk_accepts_session_id -q
```

Expected: FAIL with `AttributeError: 'AgentTask' object has no attribute 'sessionId'`.

- [ ] **Step 7: Add sessionId to AgentTask**

Modify `backend/runtime/agent.py` dataclass:

```python
@dataclass
class AgentTask:
    messages: list  # [{"role":"user","content":"..."}]
    system: str | None = None
    config: dict = field(default_factory=dict)
    cwd: str | None = None
    sessionId: str | None = None
```

No router code is needed if FastAPI dataclass parsing accepts the extra field once dataclass declares it.

- [ ] **Step 8: Run API and existing agent tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py::test_run_claude_sdk_accepts_session_id tests/test_claude_sdk_agent.py -q
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add backend/runtime/agent.py backend/runtime/context_compression.py backend/tests/test_context_compression.py backend/tests/test_agents_api.py
git commit -m "feat(runtime): 持久化上下文摘要元数据"
```

---

### Task 3: Claude SDK Agent 接入压缩 prompt、日志和事件

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py:121-195`
- Modify: `backend/runtime/context_compression.py`
- Test: `backend/tests/test_claude_sdk_agent.py`
- Test: `backend/tests/test_context_compression.py`

- [ ] **Step 1: Write failing test that long history uses compressed prompt and emits strategy effect**

Append to `backend/tests/test_claude_sdk_agent.py`:

```python
async def test_claude_sdk_agent_compresses_long_history_and_emits_strategy_effect(tmp_path, monkeypatch):
    import agents
    from runtime.registry import create_agent

    captured = {}

    async def fake_query(*, prompt, options=None, transport=None):
        captured["prompt"] = prompt
        yield AssistantMessage(content=[TextBlock(text="压缩后回答")], model="glm-5.2")
        yield ResultMessage(
            subtype="success", duration_ms=1, duration_api_ms=1,
            is_error=False, num_turns=1, session_id="s",
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    monkeypatch.setattr("runtime.claude_sdk_agent._SANDBOX_DIR", str(tmp_path))
    agent = create_agent("claude-sdk")
    messages = []
    for i in range(14):
        messages.append({"role": "user", "content": f"问题{i}" + "甲" * 1800})
        messages.append({"role": "assistant", "content": f"回答{i}" + "乙" * 1800})
    messages.append({"role": "user", "content": "当前问题"})

    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=fake_query):
        await agent.run(AgentTask(messages=messages, sessionId="session-long", cwd=str(tmp_path)), emit)

    events = [e async for e in emit]
    action = next(e for e in events if e.type == EventType.ACTION and e.data.get("action") == "strategy_effect")
    assert "以下是早期对话摘要" in captured["prompt"]
    assert "当前问题" in captured["prompt"]
    assert action.data["strategy"] == "context_compression"
    assert action.data["triggered"] is True
    assert action.data["summarySourceCount"] > 0
    assert (tmp_path / "logcompress.md").exists()
    assert "session-long" in (tmp_path / "logcompress.md").read_text(encoding="utf-8")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_claude_sdk_agent_compresses_long_history_and_emits_strategy_effect -q
```

Expected: FAIL because `ClaudeSdkAgent.run()` still calls `_messages_to_prompt()` and emits no strategy action/log.

- [ ] **Step 3: Add helper for summary state payload and safe log path**

Append to `backend/runtime/context_compression.py`:

```python

def summary_state_from_result(result: RuntimeContextResult) -> dict[str, Any]:
    return {
        "contextSummary": result.summary or "",
        "summaryUntilMessageIndex": result.summary_until_message_index or 0,
        "summaryUpdatedAt": datetime.utcnow().isoformat(),
    }


def compression_action_payload(result: RuntimeContextResult, messages: list[dict[str, Any]]) -> dict[str, Any]:
    after_messages = [{"role": "system", "content": result.prompt}]
    return {
        "action": "strategy_effect",
        "strategy": "context_compression",
        "triggered": result.triggered,
        "before_count": len(messages),
        "after_count": len(after_messages),
        "before_tokens": result.before_chars,
        "after_tokens": result.runtime_chars,
        "beforeTokenCount": result.before_chars,
        "afterTokenCount": result.runtime_chars,
        "beforeMessages": [],
        "afterMessages": after_messages,
        "summary": result.summary,
        "summarySourceCount": result.summary_until_message_index,
        "reason": result.reason,
        "recentFullTurns": result.recent_full_turns,
        "hardFallback": result.hard_fallback,
    }


def compression_log_path(cwd: str | None, sandbox_dir: str) -> Path:
    base = Path(cwd or sandbox_dir)
    return base / "logcompress.md"
```

- [ ] **Step 4: Modify ClaudeSdkAgent.run() to use compression**

In `backend/runtime/claude_sdk_agent.py`, add imports:

```python
from database import SessionLocal
from runtime.context_compression import (
    build_runtime_context,
    load_summary_state,
    save_summary_state,
    summary_state_from_result,
    compression_action_payload,
    compression_log_path,
    append_compression_log,
)
```

Replace lines around `prompt = self._messages_to_prompt(task.messages)` with:

```python
            db = SessionLocal()
            try:
                summary_state = load_summary_state(db, task.sessionId)
                context = build_runtime_context(task.messages, summary_state)
                if context.triggered:
                    save_summary_state(db, task.sessionId, summary_state_from_result(context))
                    append_compression_log(
                        compression_log_path(task.cwd, _SANDBOX_DIR),
                        session_id=task.sessionId or "",
                        agent_id=self.metadata.id,
                        result=context,
                    )
                    await emit.emit(EventType.ACTION, **compression_action_payload(context, task.messages))
            finally:
                db.close()
            prompt = context.prompt
```

Keep the rest of streaming loop unchanged.

- [ ] **Step 5: Run the new integration test**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_claude_sdk_agent_compresses_long_history_and_emits_strategy_effect -q
```

Expected: PASS.

- [ ] **Step 6: Run related backend tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py tests/test_claude_sdk_agent.py tests/test_agents_api.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/runtime/context_compression.py backend/runtime/claude_sdk_agent.py backend/tests/test_context_compression.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(runtime): 接入 Agent 长会话压缩"
```

---

### Task 4: 前端传递 sessionId 并展示压缩轻提示

**Files:**
- Modify: `src/services/agentRuntimeApi.ts:210-225`
- Modify: `src/stores/agentRuntimeStore.ts:164-214`
- Modify: `src/services/eventAdapter.ts:26-35,121-136`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Test: `src/stores/agentRuntimeStore.test.ts`
- Test: `src/services/eventAdapter.test.ts`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write failing store test for sessionId passed to runAgent**

Append to `src/stores/agentRuntimeStore.test.ts` inside the existing describe block:

```ts
  it('passes workspace session id to agent run requests', async () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceSessionId: 'session-xyz',
      workspaceMessages: [],
      workspaceRunning: false,
      workspaceCwd: 'D:/repo',
    });

    await useAgentRuntimeStore.getState().runWorkspace('你好');

    expect(runAgentMock).toHaveBeenCalledWith(
      'claude-sdk',
      [{ role: 'user', content: '你好' }],
      'D:/repo',
      'session-xyz',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });
```

- [ ] **Step 2: Run store test to verify it fails**

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts -t "passes workspace session id"
```

Expected: FAIL because `runAgent()` currently has no `sessionId` argument.

- [ ] **Step 3: Update runAgent signature and POST body**

Modify `src/services/agentRuntimeApi.ts` signature to:

```ts
export async function runAgent(
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  cwd: string | null,
  sessionId: string | null,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
```

Modify fetch body to:

```ts
      body: JSON.stringify({ messages, cwd, sessionId }),
```

Modify `src/stores/agentRuntimeStore.ts` workspace call to insert session id after cwd:

```ts
      get().workspaceCwd,
      get().workspaceSessionId,
```

Modify assistant call to pass `null` after cwd:

```ts
      null,
      null,
```

- [ ] **Step 4: Run store test again**

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts -t "passes workspace session id"
```

Expected: PASS.

- [ ] **Step 5: Write failing eventAdapter test for compression action label**

Append to `src/services/eventAdapter.test.ts`:

```ts
it('renders context compression action as a user-facing notice', () => {
  const data = aggregateObservability([
    {
      type: 'action',
      data: {
        action: 'strategy_effect',
        strategy: 'context_compression',
        triggered: true,
        before_tokens: 52640,
        after_tokens: 18320,
        summary: '早期摘要',
        summarySourceCount: 24,
      },
    },
  ]);

  expect(data.strategyEffect?.strategy).toBe('context_compression');
  expect(data.strategyEffect?.triggered).toBe(true);
  expect(data.strategyEffect?.summary).toBe('早期摘要');
});
```

- [ ] **Step 6: Run eventAdapter test**

```bash
npm run test -- src/services/eventAdapter.test.ts -t "context compression"
```

Expected: PASS if existing generic `strategy_effect` aggregation already covers it. If label text still says only `策略 context_compression`, update `toDisplayEvent()` action branch:

```ts
      if (d.action === 'strategy_effect' && d.strategy === 'context_compression') {
        return {
          type: 'action',
          label: `已自动压缩早期上下文: ${d.before_tokens ?? 0}→${d.after_tokens ?? 0} 字符`,
          detail: '原始会话记录仍完整保留',
          ts: Date.now(),
        };
      }
```

Keep the existing generic `strategy_effect` branch after this special case.

- [ ] **Step 7: Write failing ChatWorkspace test for notice rendering**

Append to `src/components/agentRuntime/ChatWorkspace.test.tsx`:

```tsx
  it('renders a lightweight notice when context compression was used', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [{
        type: 'action',
        label: '已自动压缩早期上下文: 52640→18320 字符',
        detail: '原始会话记录仍完整保留',
        ts: 1,
      } as any],
      workspaceObservability: {
        steps: [],
        tokenUsage: { input: 0, output: 0 },
        strategyEffect: {
          strategy: 'context_compression',
          triggered: true,
          before_count: 29,
          after_count: 1,
          beforeTokenCount: 52640,
          afterTokenCount: 18320,
          beforeMessages: [],
          afterMessages: [],
          summary: '早期摘要',
          summarySourceCount: 24,
        },
      },
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);

    expect(screen.getByText('当前会话较长，已自动压缩早期上下文以保持响应速度。原始会话记录仍完整保留。')).toBeInTheDocument();
  });
```

- [ ] **Step 8: Run ChatWorkspace test to verify it fails**

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx -t "context compression"
```

Expected: FAIL because no notice is rendered.

- [ ] **Step 9: Render notice in ChatWorkspace**

In `src/components/agentRuntime/ChatWorkspace.tsx`, near the top of the component where store state is selected, ensure `workspaceObservability` is available. In the message viewport before `SessionTaskNavigator`, add:

```tsx
        {workspaceObservability.strategyEffect?.strategy === 'context_compression' && workspaceObservability.strategyEffect.triggered && (
          <div
            data-testid="context-compression-notice"
            style={{
              alignSelf: 'center',
              maxWidth: 720,
              border: '1px solid #D6CFC4',
              borderRadius: 999,
              background: '#FFF7ED',
              color: '#7C2D12',
              fontSize: 12,
              fontWeight: 650,
              padding: '7px 12px',
            }}
          >
            当前会话较长，已自动压缩早期上下文以保持响应速度。原始会话记录仍完整保留。
          </div>
        )}
```

Do not add modal, confirmation, or extra controls.

- [ ] **Step 10: Run frontend targeted tests**

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts src/services/eventAdapter.test.ts src/components/agentRuntime/ChatWorkspace.test.tsx -q
```

Expected: targeted tests pass. Existing React `act(...)` warnings may appear; do not broaden scope unless a test fails.

- [ ] **Step 11: Commit Task 4**

```bash
git add src/services/agentRuntimeApi.ts src/stores/agentRuntimeStore.ts src/services/eventAdapter.ts src/components/agentRuntime/ChatWorkspace.tsx src/stores/agentRuntimeStore.test.ts src/services/eventAdapter.test.ts src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(runtime): 展示长会话压缩提示"
```

---

### Task 5: nginx SSE 超时配套与矩阵更新

**Files:**
- Modify: `nginx.conf:35-41`
- Modify: `项目执行跟踪矩阵.md`
- Test: add or update an existing frontend/backend config test if present; otherwise use direct config grep in verification step.

- [ ] **Step 1: Write a failing config check test if no existing nginx test exists**

Create `backend/tests/test_nginx_config.py`:

```python
from pathlib import Path


def test_agent_sse_nginx_location_has_timeout_and_buffering_off():
    conf = Path(__file__).resolve().parents[2] / "nginx.conf"
    text = conf.read_text(encoding="utf-8")
    start = text.index("location /api/agents")
    block = text[start:text.index("}", start)]

    assert "proxy_buffering off;" in block
    assert "proxy_read_timeout 600s;" in block
    assert "proxy_send_timeout 600s;" in block
```

- [ ] **Step 2: Run config test to verify it fails**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_nginx_config.py -q
```

Expected: FAIL because timeout directives are missing.

- [ ] **Step 3: Update nginx config**

Modify `nginx.conf` `/api/agents` location to:

```nginx
    location /api/agents {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
```

- [ ] **Step 4: Run config test again**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_nginx_config.py -q
```

Expected: PASS.

- [ ] **Step 5: Update tracking matrix**

Modify `项目执行跟踪矩阵.md`:

- Increment total requirement count by 1.
- Add a new row for this requirement, for example:

```md
| RQ-076 | 长会话上下文压缩与压缩日志 | [`2026-06-20-long-session-context-compression-design.md`](docs/superpowers/specs/2026-06-20-long-session-context-compression-design.md) | [`2026-06-20-long-session-context-compression.md`](docs/superpowers/plans/2026-06-20-long-session-context-compression.md) | 🚧 | 设计与计划完成 |
```

- Add a dated timeline note for spec/plan creation and expected verification commands.

Use the next available RQ number if `RQ-076` is already taken.

- [ ] **Step 6: Run full targeted verification**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_context_compression.py tests/test_claude_sdk_agent.py tests/test_agents_api.py tests/test_nginx_config.py -q
npm run test -- src/stores/agentRuntimeStore.test.ts src/services/eventAdapter.test.ts src/components/agentRuntime/ChatWorkspace.test.tsx -q
npm run typecheck
npm run build
```

Expected:

- Backend targeted tests pass.
- Frontend targeted tests pass.
- Typecheck passes.
- Build passes; existing Vite chunk-size warning is acceptable.

- [ ] **Step 7: Commit Task 5**

```bash
git add nginx.conf backend/tests/test_nginx_config.py 项目执行跟踪矩阵.md
git commit -m "fix(runtime): 延长 Agent SSE 反代超时"
```

---

### Task 6: Docker 热更新验证

**Files:**
- No source files expected.

- [ ] **Step 1: Build frontend**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Rebuild or hot update Docker container**

If only frontend changed in Task 4, hot update static files is enough for UI. Because nginx config and backend Python changed, prefer rebuilding/recreating container using the project’s Docker process. In Git Bash, preserve Linux paths with:

```bash
MSYS_NO_PATHCONV=1 docker run ...
```

Use the existing project deployment command from `docs/deploy-mysql.md` / current container configuration. Do not delete the `my-mysql` container or its volume.

- [ ] **Step 3: Smoke test the running Docker API**

```bash
python - <<'PY'
import json, urllib.request
payload = json.dumps({
  "sessionId": "smoke-context-compression",
  "cwd": "/workspace",
  "messages": [{"role":"user","content":"请简短回复 pong"}],
}).encode()
req = urllib.request.Request(
  "http://localhost:8080/api/agents/claude-sdk/run",
  data=payload,
  headers={"Content-Type":"application/json"},
  method="POST",
)
with urllib.request.urlopen(req, timeout=120) as r:
    body = r.read().decode("utf-8", errors="replace")
print(body[:1000])
PY
```

Expected: SSE body contains `text` and `done`, or a readable agent error that is not nginx `upstream timed out`.

- [ ] **Step 4: Verify compression log on a long request**

Run a long-history smoke only if acceptable for current local environment. Use a synthetic request that exceeds the soft threshold and then check `/workspace/logcompress.md` in the container or mounted workspace.

Expected: `logcompress.md` contains a new entry with `Session: smoke-context-compression` and `Reason: soft_threshold` or `hard_threshold`.

- [ ] **Step 5: Commit Docker verification notes only if files changed**

Do not create a commit if no source/document files changed.

---

## Self-Review

- Spec coverage: covered automatic compression, original-message preservation, thresholds, recent window, hard fallback, incremental summary, user notice, compression log, SSE timeout, and tests.
- Placeholder scan: no `TBD`, no vague “add proper handling”, no task without concrete files/commands.
- Type consistency: `sessionId`, `contextSummary`, `summaryUntilMessageIndex`, `strategy_effect`, `context_compression`, `logcompress.md` are named consistently across backend, frontend, tests, and spec.
- Scope check: implementation stays within runtime prompt assembly, existing settings table, frontend notice, nginx timeout, and matrix update; no full RAG or tokenizer dependency.

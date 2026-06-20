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
    old = old_summary.strip()
    new_lines: list[str] = []
    for message in source_messages:
        content = str(message.get("content", "")).strip().replace("\r\n", "\n")
        if not content:
            continue
        role = "用户" if message.get("role") == "user" else "助手"
        snippet = content[:700]
        if len(content) > 700:
            snippet += "…"
        new_lines.append(f"- {role}: {snippet}")

    new = "\n".join(new_lines).strip()
    if not old:
        return new[:SUMMARY_CHAR_LIMIT]
    if not new:
        return old[:SUMMARY_CHAR_LIMIT]

    separator = "\n"
    if len(old) + len(separator) + len(new) <= SUMMARY_CHAR_LIMIT:
        return f"{old}{separator}{new}"

    new_budget = min(len(new), SUMMARY_CHAR_LIMIT - len(separator))
    old_budget = SUMMARY_CHAR_LIMIT - len(separator) - new_budget
    if old_budget == 0:
        old_budget = min(len(old), 1000)
        new_budget = SUMMARY_CHAR_LIMIT - len(separator) - old_budget
    return f"{old[:old_budget]}{separator}{new[:new_budget]}"


def _full_prompt(history: list[dict[str, Any]], current: dict[str, Any]) -> str:
    lines = [_message_text(message) for message in history]
    prompt = ""
    if lines:
        prompt = "以下是之前的对话历史(已完成,请勿重复执行):\n" + "\n".join(lines) + "\n\n"
    prompt += f"请回答当前最新请求:\n用户: {current.get('content', '')}"
    return prompt


def _compressed_prompt(summary: str, recent: list[dict[str, Any]], current: dict[str, Any], turns: int) -> str:
    lines = [_message_text(message) for message in recent]
    recent_text = "\n".join(lines)
    return (
        "以下是早期对话摘要(原始记录仍完整保留,此摘要仅用于本次运行):\n"
        f"{summary}\n\n"
        f"以下是最近 {turns} 轮完整对话:\n"
        f"{recent_text}\n\n"
        "请回答当前最新请求:\n"
        f"用户: {current.get('content', '')}"
    )


def build_runtime_context(messages: list[dict[str, Any]], summary_state: dict[str, Any] | None) -> RuntimeContextResult:
    if not messages:
        return RuntimeContextResult(prompt=" ", triggered=False)

    *history, current = messages
    full = _full_prompt(history, current)
    before_chars = len(full)
    state = summary_state or {}
    previous_until = int(state.get("summaryUntilMessageIndex") or 0)
    old_summary = str(state.get("contextSummary") or "")

    incremental_reason = _incremental_compression_reason(history, previous_until)
    if before_chars <= SOFT_CHAR_LIMIT and incremental_reason is None:
        return RuntimeContextResult(prompt=full, triggered=False, before_chars=before_chars, runtime_chars=len(full))

    reason = "soft_threshold" if before_chars > SOFT_CHAR_LIMIT else incremental_reason
    result = _build_compressed(history, current, old_summary, previous_until, RECENT_FULL_TURNS, before_chars, reason)
    if len(result.prompt) > HARD_CHAR_LIMIT:
        result = _build_compressed(history, current, old_summary, previous_until, HARD_FALLBACK_TURNS, before_chars, "hard_threshold")
        result.hard_fallback = True
    if len(result.prompt) > HARD_CHAR_LIMIT:
        result.prompt = result.prompt[-HARD_CHAR_LIMIT:]
        result.runtime_chars = len(result.prompt)
    return result


def _incremental_compression_reason(history: list[dict[str, Any]], previous_until: int) -> str | None:
    if not previous_until:
        return None
    new_messages = history[previous_until:]
    new_turns = sum(1 for message in new_messages if message.get("role") == "user")
    if new_turns > MAX_INCREMENTAL_TURNS:
        return "incremental_turns"
    if _chars(new_messages) > MAX_INCREMENTAL_CHARS:
        return "incremental_chars"
    return None


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


def _summary_key(session_id: str) -> str:
    return f"context_summary:{session_id}"


def load_summary_state(db, session_id: str | None) -> dict[str, Any]:
    if not session_id:
        return {}
    import models

    row = db.get(models.AppSettingModel, _summary_key(session_id))
    if not row or not isinstance(row.setting_value, dict):
        return {}
    return dict(row.setting_value)


def save_summary_state(db, session_id: str | None, state: dict[str, Any]) -> None:
    if not session_id:
        return
    import models

    key = _summary_key(session_id)
    value = dict(state)
    row = db.get(models.AppSettingModel, key)
    if row is None:
        row = models.AppSettingModel(setting_key=key, setting_value=value)
        db.add(row)
    else:
        row.setting_value = value
    db.commit()

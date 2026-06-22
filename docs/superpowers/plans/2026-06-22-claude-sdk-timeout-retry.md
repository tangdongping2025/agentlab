# claude-sdk 主路径超时 + 重试 + 前端通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `ClaudeSdkAgent.run` 的 query 调用加无活动超时(60s)+ 总尝试 3 次(退避 1s/2s)+ 仅启动阶段重试 + 重试时通过 action 事件通知前端。

**Architecture:** 把现有 `async for message in query(...)` 拆成 `_run_query_with_retry`(重试层)→ `_process_query_attempt`(单次迭代+处理,用 `_anext_with_timeout` 做无活动超时)。异常用 `_QueryAttemptFailed(started, cause)` 包装,带 `started` 标志供重试决策。前端 `eventAdapter.ts` 加 `action === 'retry'` 分支。

**Tech Stack:** Python asyncio + claude_agent_sdk(后端);TypeScript + vitest(前端)

---

## File Structure

- **Modify** `backend/runtime/claude_sdk_agent.py`
  - 新增模块级 import:`asyncio`、`contextlib`、`pytest` 仅测试
  - 新增模块级常量:`STALL_TIMEOUT`、`MAX_ATTEMPTS`、`BACKOFF_SECONDS`(放 `_ALLOWED_TOOLS` 附近)
  - 新增模块级异常类 `_QueryAttemptFailed`
  - 新增模块级 async 函数 `_anext_with_timeout(aiter, timeout)`
  - 修改 `ClaudeSdkAgent.run`:query 调用段(:224-264 的循环)替换为 `await self._run_query_with_retry(prompt, options, emit)`
  - 新增方法 `ClaudeSdkAgent._run_query_with_retry(self, prompt, options, emit)`
  - 新增方法 `ClaudeSdkAgent._process_query_attempt(self, prompt, options, emit)`
- **Modify** `backend/tests/test_claude_sdk_agent.py`:新增 helper 单测 3 个 + run 重试测试 5 个 + 加固现有 `_fake_query_raises` 测试 1 个
- **Modify** `src/services/eventAdapter.ts`:`case 'action'` 内加 `action === 'retry'` 分支
- **Modify** `src/services/eventAdapter.test.ts`:新增 retry 分支测试 2 个
- **Modify** `项目执行跟踪矩阵.md`:加 RQ 行

---

## Task 1: 模块常量 + `_anext_with_timeout` helper

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(顶部 import + `_ALLOWED_TOOLS` 后加常量 + 新增异常类 + helper 函数)
- Test: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写 helper 的 3 个失败测试**

在 `backend/tests/test_claude_sdk_agent.py` 顶部加 `import asyncio`、`import pytest`(若未导入),在文件末尾追加:

```python
async def test_anext_with_timeout_returns_value():
    from runtime.claude_sdk_agent import _anext_with_timeout

    async def gen():
        yield "a"
        yield "b"

    aiter = gen()
    assert await _anext_with_timeout(aiter, 1) == "a"
    assert await _anext_with_timeout(aiter, 1) == "b"


async def test_anext_with_timeout_raises_timeout():
    from runtime.claude_sdk_agent import _anext_with_timeout

    async def gen():
        await asyncio.sleep(0.3)
        yield "late"

    aiter = gen()
    with pytest.raises(asyncio.TimeoutError):
        await _anext_with_timeout(aiter, 0.1)


async def test_anext_with_timeout_propagates_stop_async_iteration():
    from runtime.claude_sdk_agent import _anext_with_timeout

    async def gen():
        yield "only"

    aiter = gen()
    await _anext_with_timeout(aiter, 1)
    with pytest.raises(StopAsyncIteration):
        await _anext_with_timeout(aiter, 1)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_anext_with_timeout_returns_value tests/test_claude_sdk_agent.py::test_anext_with_timeout_raises_timeout tests/test_claude_sdk_agent.py::test_anext_with_timeout_propagates_stop_async_iteration -v`

Expected: FAIL,`ImportError: cannot import name '_anext_with_timeout'`

- [ ] **Step 3: 加 import + 常量 + 异常类 + helper 实现**

3a. 在 `claude_sdk_agent.py` 顶部 import 区(`from __future__ import annotations` 之后)加:

```python
import asyncio
import contextlib
```

(现有 `import inspect`、`import os` 保留。)

3b. 在 `_ALLOWED_TOOLS = [...]`(:45)之后、`_DEFAULT_SYSTEM_PROMPT` 之前加:

```python
# query 的无活动超时与重试(防内网代理卡死时 SSE 永挂)
STALL_TIMEOUT = 60          # 流式期间连续无 message 的秒数
MAX_ATTEMPTS = 3            # 总尝试上限(初始 + 2 次重试)
BACKOFF_SECONDS = (1, 2)    # 指数退避,对应 attempt 0、1 失败后


class _QueryAttemptFailed(Exception):
    """单次 query 尝试失败。started 标志供重试层决策。"""

    def __init__(self, started: bool, cause: BaseException):
        super().__init__(str(cause))
        self.started = started
        self.original = cause


async def _anext_with_timeout(aiter, timeout: float):
    """取 async iterator 下一个元素,超过 timeout 秒无产出则抛 asyncio.TimeoutError。

    用 task + asyncio.wait 而非 asyncio.wait_for:后者包裹 async generator
    __anext__() 时 StopAsyncIteration 传播有边角问题;这里 generator 耗尽时
    task.result() 原样抛出 StopAsyncIteration,由调用方正确处理。
    """
    task = asyncio.ensure_future(aiter.__anext__())
    try:
        done, pending = await asyncio.wait({task}, timeout=timeout)
        if pending:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            raise asyncio.TimeoutError()
        return task.result()
    except BaseException:
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        raise
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_anext_with_timeout_returns_value tests/test_claude_sdk_agent.py::test_anext_with_timeout_raises_timeout tests/test_claude_sdk_agent.py::test_anext_with_timeout_propagates_stop_async_iteration -v`

Expected: 3 PASS

- [ ] **Step 5: 跑全文件回归确认无破坏**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`

Expected: 全部既有测试仍 PASS(此步只加新东西,不改 run)

- [ ] **Step 6: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(runtime): 加 claude-sdk query 无活动超时 helper"
```

---

## Task 2: run 方法接入重试 + 超时包装

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(`run` 的 query 段 + 新增 `_run_query_with_retry`、`_process_query_attempt`)
- Test: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写 5 个新测试 + 加固 1 个现有测试**

在 `backend/tests/test_claude_sdk_agent.py` 末尾追加(顶部确保有 `import asyncio`;`AssistantMessage`/`TextBlock`/`ResultMessage`/`EventEmitter`/`EventType`/`AgentTask` 已 import):

```python
async def test_run_retries_on_startup_failure_then_succeeds(monkeypatch):
    """启动阶段(首 message 前)失败 → 重试,第二次成功。"""
    import agents
    from runtime.registry import create_agent

    call_count = {"n": 0}

    async def fake_query(*, prompt, options=None, transport=None):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("connection refused")
            yield  # async generator 标记
        yield AssistantMessage(content=[TextBlock(text="恢复")], model="glm-5.2")
        yield ResultMessage(
            subtype="success", duration_ms=1, duration_api_ms=1,
            is_error=False, num_turns=1, session_id="s",
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    real_sleep = asyncio.sleep
    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)
        await real_sleep(0)

    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    assert EventType.DONE in types
    assert EventType.TEXT in types
    retry_evts = [e for e in events if e.type == EventType.ACTION and e.data.get("action") == "retry"]
    assert len(retry_evts) == 1
    assert retry_evts[0].data.get("attempt") == 2
    assert retry_evts[0].data.get("maxAttempts") == 3
    assert retry_evts[0].data.get("nextRetryIn") == 1
    assert not any(e.type == EventType.ERROR for e in events)
    assert call_count["n"] == 2
    assert sleeps == [1]


async def test_run_does_not_retry_after_first_message(monkeypatch):
    """首 message 到达后(started=True)失败 → 不重试,直接 error。"""
    import agents
    from runtime.registry import create_agent

    async def fake_query(*, prompt, options=None, transport=None):
        yield AssistantMessage(content=[TextBlock(text="开始了")], model="glm-5.2")
        raise RuntimeError("mid-stream failure")
        yield  # unreachable,async generator 标记

    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    retry_evts = [e for e in events if e.type == EventType.ACTION and e.data.get("action") == "retry"]
    assert len(retry_evts) == 0
    assert any(e.type == EventType.ERROR for e in events)
    assert any(e.type == EventType.TEXT for e in events)


async def test_run_exhausts_retries_then_emits_error(monkeypatch):
    """连续启动失败 → 重试用尽(总尝试 3 次),emit_error,事件含 2 条 retry(attempt=2,3)。"""
    import asyncio
    import agents
    from runtime.registry import create_agent

    call_count = {"n": 0}

    async def fake_query(*, prompt, options=None, transport=None):
        call_count["n"] += 1
        raise RuntimeError(f"fail {call_count['n']}")
        yield  # async generator 标记

    real_sleep = asyncio.sleep
    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)
        await real_sleep(0)

    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    retry_evts = [e for e in events if e.type == EventType.ACTION and e.data.get("action") == "retry"]
    assert len(retry_evts) == 2
    assert [r.data.get("attempt") for r in retry_evts] == [2, 3]
    assert [r.data.get("nextRetryIn") for r in retry_evts] == [1, 2]
    assert sleeps == [1, 2]
    assert any(e.type == EventType.ERROR for e in events)
    assert call_count["n"] == 3


async def test_run_retries_on_stall_timeout(monkeypatch):
    """无活动超时(首 message 迟迟不到)→ 触发重试,第二次成功。"""
    import asyncio
    import agents
    from runtime.registry import create_agent

    call_count = {"n": 0}
    real_sleep = asyncio.sleep

    async def fake_query(*, prompt, options=None, transport=None):
        call_count["n"] += 1
        if call_count["n"] == 1:
            await real_sleep(0.4)  # 用原 sleep 绕过 monkeypatch,制造真卡顿
            yield AssistantMessage(content=[TextBlock(text="迟到")], model="glm-5.2")
            yield ResultMessage(
                subtype="success", duration_ms=1, duration_api_ms=1,
                is_error=False, num_turns=1, session_id="s",
                usage={"input_tokens": 1, "output_tokens": 1},
            )
        yield AssistantMessage(content=[TextBlock(text="第二次成功")], model="glm-5.2")
        yield ResultMessage(
            subtype="success", duration_ms=1, duration_api_ms=1,
            is_error=False, num_turns=1, session_id="s2",
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    async def fake_sleep(s):
        await real_sleep(0)  # 只加速 backoff,不影响 fake_query 的 real_sleep

    monkeypatch.setattr("runtime.claude_sdk_agent.query", fake_query)
    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    monkeypatch.setattr("runtime.claude_sdk_agent.STALL_TIMEOUT", 0.1)

    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)

    events = [e async for e in emit]
    retry_evts = [e for e in events if e.type == EventType.ACTION and e.data.get("action") == "retry"]
    assert len(retry_evts) == 1
    assert any(e.type == EventType.DONE for e in events)
    assert any(e.data.get("text") == "第二次成功" for e in events if e.type == EventType.TEXT)
    assert call_count["n"] == 2


async def test_run_successful_path_emits_no_retry_action():
    """正常成功路径不 emit 任何 retry action(回归保护)。"""
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_text_only):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "ping"}]), emit)
    events = [e async for e in emit]
    assert not any(e.type == EventType.ACTION and e.data.get("action") == "retry" for e in events)
```

**加固现有测试** `test_run_emits_error_on_query_exception`(原 :498),把签名加 `monkeypatch` 并加速 sleep(否则接入重试后会真睡 1+2=3 秒):

把:
```python
async def test_run_emits_error_on_query_exception():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_raises):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)
```
改为:
```python
async def test_run_emits_error_on_query_exception(monkeypatch):
    import asyncio
    import agents
    from runtime.registry import create_agent
    real_sleep = asyncio.sleep

    async def fake_sleep(s):
        await real_sleep(0)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_raises):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    assert any(e.type == EventType.ERROR for e in events)
```

- [ ] **Step 2: 运行新测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_retries_on_startup_failure_then_succeeds tests/test_claude_sdk_agent.py::test_run_does_not_retry_after_first_message tests/test_claude_sdk_agent.py::test_run_exhausts_retries_then_emits_error tests/test_claude_sdk_agent.py::test_run_retries_on_stall_timeout tests/test_claude_sdk_agent.py::test_run_successful_path_emits_no_retry_action -v`

Expected: 5 FAIL —— `_run_query_with_retry` 不存在 / query 还没重试逻辑

- [ ] **Step 3: 实现 `_run_query_with_retry` + `_process_query_attempt`,改 run**

3a. 在 `ClaudeSdkAgent` 类内,`run` 方法之前(例如 `_build_options` 之后),新增两个方法:

```python
    async def _run_query_with_retry(self, prompt: str, options, emit: EventEmitter) -> None:
        """带无活动超时 + 启动阶段重试的 query 执行器。"""
        for attempt in range(MAX_ATTEMPTS):
            try:
                await self._process_query_attempt(prompt, options, emit)
                return  # 成功完成(emit_done 或业务 emit_error)
            except _QueryAttemptFailed as e:
                if e.started or attempt >= MAX_ATTEMPTS - 1:
                    await emit.emit_error(f"{type(e.original).__name__}: {e.original}")
                    return
                backoff = BACKOFF_SECONDS[attempt]
                await emit.emit(
                    EventType.ACTION,
                    action="retry",
                    attempt=attempt + 2,
                    maxAttempts=MAX_ATTEMPTS,
                    reason=f"{type(e.original).__name__}: {e.original}",
                    nextRetryIn=backoff,
                )
                await asyncio.sleep(backoff)
                continue

    async def _process_query_attempt(self, prompt: str, options, emit: EventEmitter) -> None:
        """跑一次 query,emit 所有事件。

        成功(emit_done)或业务错误(ResultMessage.is_error → emit_error)正常 return;
        启动/传输异常抛 _QueryAttemptFailed,由 _run_query_with_retry 决定重试。
        """
        saw_partial = False
        started = False
        aiter = query(prompt=prompt, options=options).__aiter__()
        try:
            while True:
                try:
                    message = await _anext_with_timeout(aiter, STALL_TIMEOUT)
                except StopAsyncIteration:
                    return  # generator 正常耗尽
                started = True
                if isinstance(message, StreamEvent):
                    saw_partial = True
                    ev = message.event or {}
                    if ev.get("type") == "content_block_delta":
                        delta = ev.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            await emit.emit(EventType.TEXT, text=delta.get("text", ""))
                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            if not saw_partial:
                                await emit.emit(EventType.TEXT, text=block.text)
                        elif isinstance(block, ThinkingBlock):
                            await emit.emit(EventType.THINKING, thinking=block.thinking)
                        elif isinstance(block, ToolUseBlock):
                            await emit.emit(EventType.TOOL_CALL, name=block.name, params=block.input)
                        elif isinstance(block, ToolResultBlock):
                            await self._emit_tool_result(block, emit)
                    if getattr(message, "error", None):
                        await emit.emit_error(f"assistant error: {message.error}")
                        return
                elif isinstance(message, ToolResultBlock):
                    await self._emit_tool_result(message, emit)
                elif isinstance(message, ResultMessage):
                    if message.usage:
                        await emit.emit(
                            EventType.TOKEN_USAGE,
                            input_tokens=message.usage.get("input_tokens", 0),
                            output_tokens=message.usage.get("output_tokens", 0),
                        )
                    if message.is_error or message.subtype != "success":
                        await emit.emit_error(
                            f"result {message.subtype}: {getattr(message, 'result', '')}"
                        )
                    else:
                        await emit.emit_done()
                    return
        except _QueryAttemptFailed:
            raise
        except asyncio.TimeoutError as e:
            raise _QueryAttemptFailed(started, e) from e
        except Exception as e:
            raise _QueryAttemptFailed(started, e) from e
        finally:
            with contextlib.suppress(Exception):
                await aiter.aclose()
```

3b. 修改 `run` 方法的 query 段。定位现有代码(`claude_sdk_agent.py:224` 附近):

```python
            prompt = context.prompt
            options = self._build_options(task)
            saw_partial = False
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, StreamEvent):
                    saw_partial = True
                    ev = message.event or {}
                    if ev.get("type") == "content_block_delta":
                        delta = ev.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            await emit.emit(EventType.TEXT, text=delta.get("text", ""))
                        # thinking 不流式:避免每个 delta 一个 THINKING 事件刷屏,
                        # 等完整 ThinkingBlock 再 emit(见下方 AssistantMessage 分支)
                elif isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            if not saw_partial:
                                await emit.emit(EventType.TEXT, text=block.text)
                        elif isinstance(block, ThinkingBlock):
                            await emit.emit(EventType.THINKING, thinking=block.thinking)
                        elif isinstance(block, ToolUseBlock):
                            await emit.emit(EventType.TOOL_CALL, name=block.name, params=block.input)
                        elif isinstance(block, ToolResultBlock):
                            await self._emit_tool_result(block, emit)
                    if getattr(message, "error", None):
                        await emit.emit_error(f"assistant error: {message.error}")
                elif isinstance(message, ToolResultBlock):
                    await self._emit_tool_result(message, emit)
                elif isinstance(message, ResultMessage):
                    if message.usage:
                        await emit.emit(
                            EventType.TOKEN_USAGE,
                            input_tokens=message.usage.get("input_tokens", 0),
                            output_tokens=message.usage.get("output_tokens", 0),
                        )
                    if message.is_error or message.subtype != "success":
                        await emit.emit_error(
                            f"result {message.subtype}: {getattr(message, 'result', '')}"
                        )
                    else:
                        await emit.emit_done()
        except Exception as e:
            import traceback as _tb
            print(_tb.format_exc(), flush=True)
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

替换为:

```python
            prompt = context.prompt
            options = self._build_options(task)
            await self._run_query_with_retry(prompt, options, emit)
        except Exception as e:
            import traceback as _tb
            print(_tb.format_exc(), flush=True)
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

- [ ] **Step 4: 运行 5 个新测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_retries_on_startup_failure_then_succeeds tests/test_claude_sdk_agent.py::test_run_does_not_retry_after_first_message tests/test_claude_sdk_agent.py::test_run_exhausts_retries_then_emits_error tests/test_claude_sdk_agent.py::test_run_retries_on_stall_timeout tests/test_claude_sdk_agent.py::test_run_successful_path_emits_no_retry_action -v`

Expected: 5 PASS

- [ ] **Step 5: 跑全文件回归确认所有现有测试仍 PASS**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`

Expected: 全部 PASS(含加固后的 `test_run_emits_error_on_query_exception`、`test_run_maps_text_done_token_usage`、`test_run_maps_thinking_tool_call_tool_result`、`test_run_streams_text_delta_and_skips_full`、`test_run_emits_error_on_failed_result`、压缩相关 3 个、全历史加载 1 个)

- [ ] **Step 6: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(runtime): claude-sdk query 接入超时+启动阶段重试"
```

---

## Task 3: 前端 eventAdapter retry 分支

**Files:**
- Modify: `src/services/eventAdapter.ts`(`case 'action'` 内)
- Test: `src/services/eventAdapter.test.ts`

- [ ] **Step 1: 写 2 个失败测试**

在 `src/services/eventAdapter.test.ts` 的 `describe('aggregateObservability', ...)` 块之后追加新 describe:

```typescript
describe('toDisplayEvent retry action', () => {
  it('retry action 显示重试进度', () => {
    const display = toDisplayEvent({
      type: 'action',
      data: { action: 'retry', attempt: 2, maxAttempts: 3, reason: 'RuntimeError: timeout', nextRetryIn: 1 },
    });
    expect(display?.label).toBe('连接不稳定,正在重试(第 2/3 次尝试)');
    expect(display?.detail).toBe('1s 后重试 · RuntimeError: timeout');
  });

  it('retry 分支不影响其他 action 类型(switch_agent)', () => {
    const display = toDisplayEvent({
      type: 'action',
      data: { _action: 'switch_agent', agent_id: 'research' },
    });
    expect(display?.label).toBe('切换到 agent: research');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/services/eventAdapter.test.ts`

Expected: FAIL —— retry action 走 fallback 分支,label 为 `动作: retry`

- [ ] **Step 3: 在 `eventAdapter.ts` 的 `case 'action'` 加 retry 分支**

定位 `src/services/eventAdapter.ts:21` 的 `case 'action'`。在 `if (d._action === 'switch_agent')` 分支**之后**、`if (d.action === 'strategy_effect')` 分支**之前**插入:

```typescript
      if (d.action === 'retry') {
        return {
          type: 'action',
          label: `连接不稳定,正在重试(第 ${d.attempt}/${d.maxAttempts} 次尝试)`,
          detail: `${d.nextRetryIn}s 后重试 · ${d.reason}`,
          ts: Date.now(),
        };
      }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/services/eventAdapter.test.ts`

Expected: 全部 PASS(含新 2 个 + 原 4 个)

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`

Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/services/eventAdapter.ts src/services/eventAdapter.test.ts
git commit -m "feat(ui): 事件流渲染 claude-sdk 重试进度"
```

---

## Task 4: 更新跟踪矩阵 + 验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 在跟踪矩阵加 RQ 行**

在 `项目执行跟踪矩阵.md` 的需求表格中加一行(参照现有 RQ 行格式),状态标记进行中;在详细记录部分补一小节,说明:claude-sdk 主路径接入无活动超时 60s + 总尝试 3 次 + 启动阶段重试 + action 事件通知前端。

- [ ] **Step 2: 跑前后端全量测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q` 和 `npm run test -- --run`

Expected: 后端除已知预存失败(App.test/appStore/ChatInteraction 等,见 memory `project_preexisting-failing-tests`)外,新增/改动相关全 PASS;前端全 PASS

- [ ] **Step 3: 手动验证(前端 + 后端各起进程)**

按 CLAUDE.md 启动:
- 后端:`cd backend && .venv/Scripts/python.exe run_server.py`(Windows 用 ProactorEventLoop,见 memory)
- 前端:`npm run dev`

在 claude-sdk agent 对话页:
1. **正常路径**:发一条消息,确认正常回复,事件流无"正在重试"卡片
2. **重试路径**(可选,需构造代理抖动):临时让内网代理不可达,发消息,确认事件流出现"连接不稳定,正在重试(第 2/3 次尝试)"卡片,恢复后成功;或持续不可达时最终显示错误

向用户报告验证结果,确认 OK 后标完成。

- [ ] **Step 4: 更新矩阵状态为已完成 + Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 更新跟踪矩阵—claude-sdk 超时重试"
```

- [ ] **Step 5(可选,用户确认后):部署**

按 `docs/deploy-mysql.md` 的轻量补丁重建流程(FROM agentlab:<当前tag> + COPY dist + COPY backend → agentlab:<新tag>),部署到生产。此步需用户明确授权后再执行。

---

## Self-Review 记录

**Spec coverage**:
- 无活动超时 60s → Task 1 常量 + Task 2 `_anext_with_timeout` + `_process_query_attempt` 使用 ✓
- 总尝试 3 次 + 退避 1/2s → Task 1 常量 + Task 2 `_run_query_with_retry` ✓
- 仅启动阶段重试(started 标志)→ Task 2 `_QueryAttemptFailed.started` + 测试 `test_run_does_not_retry_after_first_message` ✓
- 重试前 emit ACTION(action=retry)→ Task 2 `_run_query_with_retry` emit ✓
- aiter.aclose() 清理 → Task 2 `_process_query_attempt` finally ✓
- 前端 action retry 分支 → Task 3 ✓
- StopAsyncIteration 传播坑 → Task 1 helper 用 task+asyncio.wait 规避 + 测试 `test_anext_with_timeout_propagates_stop_async_iteration` ✓

**Placeholder scan**:无 TBD/TODO,所有步骤含完整代码 ✓

**Type consistency**:`_QueryAttemptFailed`、`_anext_with_timeout`、`_run_query_with_retry`、`_process_query_attempt` 在定义和使用处签名一致;前端 retry payload 字段(attempt/maxAttempts/reason/nextRetryIn)后端 emit 与前端读取一致 ✓

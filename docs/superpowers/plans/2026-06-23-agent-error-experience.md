# Agent 错误体验加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agent 运行错误从后端到前端端到端透传具体信息 + 按 4 类 category 分类友好呈现(主提示 + 可折叠技术详情),取代笼统的"HTTP 5xx / 服务端 error"。

**Architecture:** 后端 `emit_error` 带 `category`(由新增 `error_categories.classify` 从异常/状态码/串推断),SSE `ERROR` 事件 data 加 `category`,SSE 路由建立前异常返 `{detail, category}` JSON;前端 `agentRuntimeApi` 把三来源(!resp.ok / SSE error / fetch 失败)归一化成 `{category, message, detail}` 对象,store 在 assistant 消息上挂 `error`,`MessageBubble` 检测到 `error` 时渲染 `ErrorBubble`(主提示 + 折叠详情)。

**Tech Stack:** 后端 Python FastAPI + pytest;前端 React 18 + TypeScript + Vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-06-23-agent-error-experience-design.md`

---

## 文件结构

### 后端(新建/修改)
- Create `backend/runtime/error_categories.py` — `classify(cause) -> str` + 4 类常量
- Create `backend/tests/test_error_categories.py` — classify 单测
- Create `backend/tests/test_events.py` — emit_error 带 category
- Create `backend/tests/test_executor.py` — executor 分类
- Modify `backend/runtime/events.py:42-44` — `emit_error` 加 `category` 参数
- Modify `backend/runtime/executor.py:27-28` — except 用 `classify(e)`
- Modify `backend/runtime/claude_sdk_agent.py` — 各 emit_error 点带 category
- Modify `backend/runtime/base_agent.py:179,220` — emit_error 带 category
- Modify `backend/routers/agents.py:40-62` — endpoint try/except 返 JSON
- Modify `backend/tests/test_claude_sdk_agent.py` — 扩展 error 测试断言 category
- Modify `backend/tests/test_base_agent_strategy.py` — 加 category 测试
- Modify `backend/tests/test_agents_api.py` — 加建立前异常测试

### 前端(新建/修改)
- Modify `src/services/agentRuntimeApi.ts:11-14,277-336` — `ErrorCategory`/`AgentError` 类型 + `normalizeError` + `onError` 签名 + `!resp.ok` 读 body
- Create `src/services/agentRuntimeApi.test.ts` — normalizeError 单测
- Create `src/components/agentRuntime/ErrorBubble.tsx` — 主提示 + 折叠详情
- Create `src/components/agentRuntime/ErrorBubble.test.tsx`
- Modify `src/components/agentRuntime/MessageBubble.tsx` — 加 `error` prop 渲染 ErrorBubble
- Modify `src/components/agentRuntime/MessageBubble.test.tsx` — 加 error 渲染测试
- Modify `src/stores/agentRuntimeStore.ts:6-10,76-78,395-417,458-466` — ChatMessage 加 error + onError 设置 + 移除 formatWorkspaceError
- Modify `src/stores/agentRuntimeStore.test.ts` — 加 onError 存对象测试
- Modify 渲染组件(workspace/assistant 消息列表) — 传 `error` prop(通过 `grep <MessageBubble` 定位)

---

## Task 1: 后端 error_categories.classify

**Files:**
- Create: `backend/runtime/error_categories.py`
- Test: `backend/tests/test_error_categories.py`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_error_categories.py`:
```python
import asyncio

from runtime.error_categories import (
    classify,
    SERVICE_UNAVAILABLE,
    NETWORK,
    BAD_REQUEST,
    INTERNAL,
)


def test_classify_5xx_status_is_service_unavailable():
    assert classify(503) == SERVICE_UNAVAILABLE
    assert classify(502) == SERVICE_UNAVAILABLE


def test_classify_4xx_status_is_bad_request():
    assert classify(400) == BAD_REQUEST
    assert classify(401) == BAD_REQUEST


def test_classify_service_keyword_strings():
    assert classify("503 No available accounts") == SERVICE_UNAVAILABLE
    assert classify("Upstream access forbidden") == SERVICE_UNAVAILABLE
    assert classify("api_error: boom") == SERVICE_UNAVAILABLE


def test_classify_network_exception_by_type():
    assert classify(ConnectionError("refused")) == NETWORK
    assert classify(asyncio.TimeoutError()) == NETWORK


def test_classify_network_keyword_string():
    assert classify("connection reset") == NETWORK
    assert classify("DNS resolution failed") == NETWORK


def test_classify_internal_for_plain_exception():
    assert classify(RuntimeError("boom")) == INTERNAL
    assert classify(ValueError("bad")) == INTERNAL


def test_classify_internal_for_unknown_type():
    assert classify(object()) == INTERNAL
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_error_categories.py -v`
Expected: FAIL — `ModuleNotFoundError: runtime.error_categories`

- [ ] **Step 3: 实现**

Create `backend/runtime/error_categories.py`:
```python
from __future__ import annotations

SERVICE_UNAVAILABLE = "service_unavailable"
NETWORK = "network"
BAD_REQUEST = "bad_request"
INTERNAL = "internal"

# 串含这些关键字 → 代理/上游拒绝或账号池(service_unavailable)
_SERVICE_KEYWORDS = (
    "502", "503", "504",
    "no available accounts", "upstream access", "forbidden", "api_error",
)

# 串含这些关键字 → 网络
_NETWORK_KEYWORDS = ("timeout", "connection", "dns", "unreachable", "reset")


def classify(cause) -> str:
    """把异常对象 / HTTP 状态码(int) / 字符串映射到 4 类 category 之一。"""
    # 1) HTTP 状态码
    if isinstance(cause, int):
        if 500 <= cause < 600:
            return SERVICE_UNAVAILABLE
        if 400 <= cause < 500:
            return BAD_REQUEST
        return INTERNAL
    # 2) 异常对象:先按类型名判网络,再看消息关键字
    if isinstance(cause, BaseException):
        exc_name = type(cause).__name__.lower()
        if any(k in exc_name for k in ("timeout", "connect", "connection")):
            return NETWORK
        msg = str(cause).lower()
    elif isinstance(cause, str):
        msg = cause.lower()
    else:
        return INTERNAL
    if any(k in msg for k in _SERVICE_KEYWORDS):
        return SERVICE_UNAVAILABLE
    if any(k in msg for k in _NETWORK_KEYWORDS):
        return NETWORK
    return INTERNAL
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_error_categories.py -v`
Expected: PASS(7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/error_categories.py backend/tests/test_error_categories.py
git commit -m "feat(runtime): 错误分类 helper classify(4类 category)"
```

---

## Task 2: 后端 events.emit_error 加 category

**Files:**
- Modify: `backend/runtime/events.py:42-44`
- Test: `backend/tests/test_events.py`(新建)

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_events.py`:
```python
import asyncio
import pytest

from runtime.events import EventEmitter, EventType


@pytest.mark.asyncio
async def test_emit_error_default_category_is_internal():
    emit = EventEmitter()
    await emit.emit_error("boom")
    emit.task = None  # 避免警告
    events = [e async for e in emit]
    assert len(events) == 1
    assert events[0].type == EventType.ERROR
    assert events[0].data == {"error": "boom", "category": "internal"}


@pytest.mark.asyncio
async def test_emit_error_carries_category():
    emit = EventEmitter()
    await emit.emit_error("refused", "network")
    events = [e async for e in emit]
    assert events[0].data == {"error": "refused", "category": "network"}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_events.py -v`
Expected: FAIL — `KeyError: 'category'`(data 只有 error)

- [ ] **Step 3: 实现**

Modify `backend/runtime/events.py:42-44`,把:
```python
    async def emit_error(self, error: str) -> None:
        await self._queue.put(AgentEvent(type=EventType.ERROR, data={"error": error}))
        await self._queue.put(None)
```
改为:
```python
    async def emit_error(self, error: str, category: str = "internal") -> None:
        await self._queue.put(AgentEvent(type=EventType.ERROR, data={"error": error, "category": category}))
        await self._queue.put(None)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_events.py -v`
Expected: PASS(2 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/events.py backend/tests/test_events.py
git commit -m "feat(runtime): emit_error 带 category 字段(default internal)"
```

---

## Task 3: 后端 executor 用 classify

**Files:**
- Modify: `backend/runtime/executor.py:27-28`
- Test: `backend/tests/test_executor.py`(新建)

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_executor.py`:
```python
import asyncio
import pytest

from runtime.agent import Agent, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.executor import run_agent


class _BoomAgent(Agent):
    def __init__(self, exc):
        self._exc = exc
    async def run(self, task, emit):
        raise self._exc


@pytest.mark.asyncio
async def test_executor_classifies_runtime_error_as_internal():
    emit = await run_agent(_BoomAgent(RuntimeError("boom")), AgentTask(messages=[]))
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data["category"] == "internal"


@pytest.mark.asyncio
async def test_executor_classifies_connection_error_as_network():
    emit = await run_agent(_BoomAgent(ConnectionError("refused")), AgentTask(messages=[]))
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data["category"] == "network"
```

注:`Agent` 基类最小接口只需 `run`；若 `runtime.agent.Agent` 是 ABC 需实现其他抽象方法,执行时按报错补 stub(只 run 是本测试关注)。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_executor.py -v`
Expected: FAIL — `KeyError: 'category'`(executor 当前 emit_error 不带 category)

- [ ] **Step 3: 实现**

Modify `backend/runtime/executor.py`,顶部 import 区加:
```python
from .error_categories import classify
```
把第 27-28 行:
```python
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```
改为:
```python
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}", classify(e))
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_executor.py -v`
Expected: PASS(2 passed)。若 `Agent` ABC 报抽象方法未实现,给 `_BoomAgent` 补对应 stub 空方法后重跑。

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/executor.py backend/tests/test_executor.py
git commit -m "feat(runtime): executor emit_error 带 classify(e) category"
```

---

## Task 4: 后端 claude_sdk_agent 各 emit_error 带 category

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(:184, :235, :247, :358)
- Test: `backend/tests/test_claude_sdk_agent.py`(扩展已有)

- [ ] **Step 1: 扩展失败测试**

在 `backend/tests/test_claude_sdk_agent.py` 末尾追加 3 个测试 + 修改 2 个现有测试断言。

修改现有 `test_run_emits_error_on_query_exception`(约 501 行),在末尾 `assert any(e.type == EventType.ERROR for e in events)` 后加:
```python
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data.get("category") == "internal"  # RuntimeError("boom") → internal
```

修改现有 `test_run_emits_error_on_failed_result`(约 518 行),在现有 assert 后加:
```python
    assert err.data.get("category") == "internal"  # result is_error → 业务错误 internal
```

追加新测试(503 → service_unavailable):
```python
async def _fake_query_raises_503(*, prompt, options=None, transport=None):
    raise RuntimeError("APIError: 503 No available accounts")
    yield  # async generator 标记


async def test_run_emits_service_unavailable_category_on_503(monkeypatch):
    real_sleep = asyncio.sleep

    async def fake_sleep(s):
        await real_sleep(0)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    import agents
    from runtime.registry import create_agent
    agent = create_agent("claude-sdk")
    emit = EventEmitter()
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_raises_503):
        await agent.run(AgentTask(messages=[{"role": "user", "content": "x"}]), emit)
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data.get("category") == "service_unavailable"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -k "error or service_unavailable" -v`
Expected: FAIL — `assert err.data.get("category") == ...`(category 缺失或 None)

- [ ] **Step 3: 实现**

Modify `backend/runtime/claude_sdk_agent.py`:

顶部 import 区加:
```python
from runtime.error_categories import classify, INTERNAL
```

`:184`(_run_query_with_retry 重试耗尽),把:
```python
                await emit.emit_error(f"{type(e.original).__name__}: {e.original}")
```
改为:
```python
                await emit.emit_error(f"{type(e.original).__name__}: {e.original}", classify(e.original))
```

`:235`(_process_query_attempt assistant error),把:
```python
                        await emit.emit_error(f"assistant error: {message.error}")
```
改为:
```python
                        await emit.emit_error(f"assistant error: {message.error}", INTERNAL)
```

`:246-249`(result is_error),把:
```python
                    if message.is_error or message.subtype != "success":
                        await emit.emit_error(
                            f"result {message.subtype}: {getattr(message, 'result', '')}"
                        )
```
改为:
```python
                    if message.is_error or message.subtype != "success":
                        await emit.emit_error(
                            f"result {message.subtype}: {getattr(message, 'result', '')}",
                            INTERNAL,
                        )
```

`:358`(run 兜底),把:
```python
            await emit.emit_error(f"{type(e).__name__}: {e}")
```
改为:
```python
            await emit.emit_error(f"{type(e).__name__}: {e}", classify(e))
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS(含新增/修改的 category 断言)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(runtime): claude_sdk_agent emit_error 带 category(503→service_unavailable)"
```

---

## Task 5: 后端 base_agent emit_error 带 category

**Files:**
- Modify: `backend/runtime/base_agent.py:179,220`
- Test: `backend/tests/test_base_agent_strategy.py`(加新测试)

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_base_agent_strategy.py` 末尾追加:
```python
import asyncio
import pytest
from unittest.mock import patch
from runtime.agent import AgentTask
from runtime.events import EventEmitter, EventType


class _NetworkBoomAgent(__import__("runtime.base_agent", fromlist=["BaseAgent"]).BaseAgent):
    metadata = type("M", (), {"id": "test-net", "name": "t", "description": "", "workspace": {"type": "tabs", "tabs": []}, "capabilities": []})
    tool_names = []
    system_prompt = ""


@pytest.mark.asyncio
async def test_base_agent_run_emits_network_category_on_connection_error(monkeypatch):
    from runtime import base_agent as mod

    async def boom_stream(*a, **k):
        raise ConnectionError("connection refused")
        yield  # async generator 标记

    agent = object.__new__(_NetworkBoomAgent)  # 跳过 __init__(避免拉真 provider)
    agent._provider = type("P", (), {"stream": staticmethod(boom_stream)})()
    agent._tools = []
    agent._tool_defs = []
    agent._tool_map = {}

    monkeypatch.setattr(mod, "build_global_prompt_for_agent", lambda aid: "")
    monkeypatch.setattr(mod, "build_skill_prompt_for_agent", lambda aid, cwd=None: "")
    monkeypatch.setattr(mod, "build_habit_prompt_for_agent", lambda aid: "")

    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "hi"}]), emit)
    events = [e async for e in emit]
    err = next(e for e in events if e.type == EventType.ERROR)
    assert err.data.get("category") == "network"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_base_agent_strategy.py -k network_category -v`
Expected: FAIL — `KeyError: 'category'`

- [ ] **Step 3: 实现**

Modify `backend/runtime/base_agent.py`:

顶部 import 区加:
```python
from runtime.error_categories import classify
```

`:178-180`(stream ERROR),把:
```python
                    elif ev.type == LLMEventType.ERROR:
                        await emit.emit_error(ev.error or "stream error")
                        return
```
改为:
```python
                    elif ev.type == LLMEventType.ERROR:
                        await emit.emit_error(ev.error or "stream error", classify(ev.error or "stream error"))
                        return
```

`:219-220`(run 兜底),把:
```python
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```
改为:
```python
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}", classify(e))
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_base_agent_strategy.py -v`
Expected: PASS(含新测试)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/base_agent.py backend/tests/test_base_agent_strategy.py
git commit -m "feat(runtime): base_agent emit_error 带 classify category"
```

---

## Task 6: 后端 routers/agents 建立前异常返 JSON

**Files:**
- Modify: `backend/routers/agents.py:40-62`
- Test: `backend/tests/test_agents_api.py`(加新测试)

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_agents_api.py` 末尾追加(使用其现有 `client` fixture):
```python
def test_run_endpoint_returns_detail_and_category_on_startup_exception(client, monkeypatch):
    """SSE 建立前异常(create_agent 之后、event_stream 之前)→ 500 JSON {detail, category}。"""
    from runtime import executor as exec_mod

    async def boom_run_agent(agent, task):
        raise RuntimeError("startup blew up")

    monkeypatch.setattr("routers.agents.run_agent", boom_run_agent)

    resp = client.post("/api/agents/claude-sdk/run", json={
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert resp.status_code == 500
    body = resp.json()
    assert "startup blew up" in body["detail"]
    assert body["category"] == "internal"
```

注:若 `test_agents_api.py` 的 `client` fixture 需 `import agents` 触发注册,沿用文件内既有用法。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py -k startup_exception -v`
Expected: FAIL — 当前 endpoint 无 try/except,`boom_run_agent` 抛 → FastAPI 默认 500 无 JSON body(或 body 无 category)

- [ ] **Step 3: 实现**

Modify `backend/routers/agents.py`:

顶部 import 区把:
```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from runtime.agent import AgentTask
from runtime.executor import run_agent
from runtime.registry import _AGENT_REGISTRY, create_agent
```
改为:
```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from runtime.agent import AgentTask
from runtime.error_categories import classify
from runtime.executor import run_agent
from runtime.registry import _AGENT_REGISTRY, create_agent
```

把 `run_agent_endpoint`(40-62 行):
```python
@router.post("/{agent_id}/run")
async def run_agent_endpoint(agent_id: str, task: AgentTask):
    agent = create_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    emit = await run_agent(agent, task)

    async def event_stream():
        ...
    return StreamingResponse(event_stream(), media_type="text/event-stream")
```
改为(把建立阶段包进 try/except):
```python
@router.post("/{agent_id}/run")
async def run_agent_endpoint(agent_id: str, task: AgentTask):
    try:
        agent = create_agent(agent_id)
        if agent is None:
            raise HTTPException(status_code=404, detail="agent not found")
        emit = await run_agent(agent, task)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"{type(e).__name__}: {e}", "category": classify(e)},
        )

    async def event_stream():
        try:
            async for event in emit:
                payload = {"type": event.type.value, "data": event.data}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            t = emit.task
            if t is not None and not t.done():
                t.cancel()
                try:
                    await asyncio.wait_for(t, timeout=2.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py -v`
Expected: PASS(含新测试,且现有 agents API 测试不回归)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/agents.py backend/tests/test_agents_api.py
git commit -m "feat(agents): SSE 建立前异常返 {detail,category} JSON(非裸 500)"
```

---

## Task 7: 前端 agentRuntimeApi 归一化错误

**Files:**
- Modify: `src/services/agentRuntimeApi.ts`
- Test: `src/services/agentRuntimeApi.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

Create `src/services/agentRuntimeApi.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeError, classifyFromSignal, type ErrorCategory } from './agentRuntimeApi';

describe('classifyFromSignal', () => {
  it('5xx status → service_unavailable', () => {
    expect(classifyFromSignal(503, '')).toBe('service_unavailable');
  });
  it('4xx status → bad_request', () => {
    expect(classifyFromSignal(401, '')).toBe('bad_request');
  });
  it('service keyword in text → service_unavailable', () => {
    expect(classifyFromSignal(null, 'No available accounts')).toBe('service_unavailable');
  });
  it('network keyword in text → network', () => {
    expect(classifyFromSignal(null, 'connection refused')).toBe('network');
  });
  it('unknown → internal', () => {
    expect(classifyFromSignal(null, 'random')).toBe('internal');
  });
});

describe('normalizeError', () => {
  it('prefers explicit category from JSON body', () => {
    const e = normalizeError({ ok: false, status: 500, bodyText: '{"detail":"boom","category":"network"}' });
    expect(e.category).toBe('network');
    expect(e.detail).toBe('boom');
    expect(e.message).toBe('网络连接失败,请检查网络后重试');
  });
  it('falls back to status when body has no category', () => {
    const e = normalizeError({ ok: false, status: 503, bodyText: 'upstream gone' });
    expect(e.category).toBe('service_unavailable');
    expect(e.detail).toBe('upstream gone');
  });
  it('uses SSE event category when present', () => {
    const e = normalizeError({ sseError: 'boom', sseCategory: 'bad_request' });
    expect(e.category).toBe('bad_request');
  });
  it('fetch failure → network', () => {
    const e = normalizeError({ fetchError: 'failed to fetch' });
    expect(e.category).toBe('network');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/services/agentRuntimeApi.test.ts`
Expected: FAIL — `normalizeError`/`classifyFromSignal` 未导出

- [ ] **Step 3: 实现**

Modify `src/services/agentRuntimeApi.ts`:

在 `AgentEvent` interface 后(约 14 行后)加类型 + 辅助函数:
```typescript
export type ErrorCategory = 'service_unavailable' | 'network' | 'bad_request' | 'internal';

export interface AgentError {
  category: ErrorCategory;
  message: string;
  detail: string;
}

const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  service_unavailable: 'AI 服务暂时不可用,请稍后重试',
  network: '网络连接失败,请检查网络后重试',
  bad_request: '请求无法处理(鉴权或格式问题)',
  internal: '智能体内部出错',
};

const SERVICE_KEYWORDS = ['502', '503', '504', 'no available accounts', 'upstream access', 'forbidden', 'api_error'];
const NETWORK_KEYWORDS = ['timeout', 'connection', 'dns', 'unreachable', 'reset'];

function isValidCategory(c: unknown): c is ErrorCategory {
  return c === 'service_unavailable' || c === 'network' || c === 'bad_request' || c === 'internal';
}

export function classifyFromSignal(status: number | null, text: string): ErrorCategory {
  if (status !== null && status >= 500 && status < 600) return 'service_unavailable';
  if (status !== null && status >= 400 && status < 500) return 'bad_request';
  const t = text.toLowerCase();
  if (SERVICE_KEYWORDS.some(k => t.includes(k))) return 'service_unavailable';
  if (NETWORK_KEYWORDS.some(k => t.includes(k))) return 'network';
  return 'internal';
}

type NormalizeInput =
  | { ok: false; status: number; bodyText: string }
  | { sseError: string; sseCategory?: unknown }
  | { fetchError: string };

export function normalizeError(input: NormalizeInput): AgentError {
  let category: ErrorCategory;
  let detail: string;
  if ('fetchError' in input) {
    category = 'network';
    detail = input.fetchError;
  } else if ('sseError' in input) {
    category = isValidCategory(input.sseCategory) ? input.sseCategory : classifyFromSignal(null, input.sseError);
    detail = input.sseError;
  } else {
    // !resp.ok
    let parsedCategory: unknown = null;
    let parsedDetail: string | null = null;
    try {
      const j = JSON.parse(input.bodyText);
      if (j && typeof j === 'object') {
        parsedCategory = (j as any).category;
        if (typeof (j as any).detail === 'string') parsedDetail = (j as any).detail;
      }
    } catch { /* not json */ }
    category = isValidCategory(parsedCategory) ? parsedCategory : classifyFromSignal(input.status, input.bodyText);
    detail = parsedDetail ?? input.bodyText ?? `HTTP ${input.status}`;
  }
  return { category, message: CATEGORY_MESSAGES[category], detail };
}
```

修改 `runAgent` 签名(约 277-285 行),把 `onError: (err: string) => void` 改为:
```typescript
  onError: (err: AgentError) => void,
```

修改 `runAgent` 体内三处错误调用。

`!resp.ok`(约 300-303),把:
```typescript
  if (!resp.ok) {
    onError(`HTTP ${resp.status}`);
    return;
  }
```
改为:
```typescript
  if (!resp.ok) {
    let bodyText = '';
    try { bodyText = await resp.text(); } catch { /* noop */ }
    onError(normalizeError({ ok: false, status: resp.status, bodyText }));
    return;
  }
```

fetch 失败(约 295-299),把:
```typescript
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    onError(e?.message || 'fetch failed');
    return;
  }
```
改为:
```typescript
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    onError(normalizeError({ fetchError: e?.message || 'fetch failed' }));
    return;
  }
```

SSE ERROR 事件(约 327),把:
```typescript
          if (event.type === 'error') { onError(event.data.error || 'error'); return; }
```
改为:
```typescript
          if (event.type === 'error') {
            onError(normalizeError({ sseError: event.data.error || 'error', sseCategory: event.data.category }));
            return;
          }
```

stream 异常(约 332-335),把:
```typescript
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal?.aborted) return;
    onError(e?.message || 'stream error');
  }
```
改为:
```typescript
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal?.aborted) return;
    onError(normalizeError({ fetchError: e?.message || 'stream error' }));
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/services/agentRuntimeApi.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错误(若 `agentRuntimeStore.ts` 仍用 `(err: string)` 会报类型错,Task 9 修复;本步若因 store 报错,先确认 agentRuntimeApi.ts 自身无误,store 错误留待 Task 9)

- [ ] **Step 6: Commit**

```bash
git add src/services/agentRuntimeApi.ts src/services/agentRuntimeApi.test.ts
git commit -m "feat(api): 前端错误归一化 ErrorCategory+AgentError(透传具体详情)"
```

---

## Task 8: 前端 ErrorBubble 组件

**Files:**
- Create: `src/components/agentRuntime/ErrorBubble.tsx`
- Test: `src/components/agentRuntime/ErrorBubble.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `src/components/agentRuntime/ErrorBubble.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBubble } from './ErrorBubble';
import type { AgentError } from '../../services/agentRuntimeApi';

const err = (overrides: Partial<AgentError> = {}): AgentError => ({
  category: 'service_unavailable',
  message: 'AI 服务暂时不可用,请稍后重试',
  detail: 'APIError: 503 No available accounts',
  ...overrides,
});

describe('ErrorBubble', () => {
  it('renders category message', () => {
    render(<ErrorBubble error={err()} />);
    expect(screen.getByText('AI 服务暂时不可用,请稍后重试')).toBeTruthy();
  });

  it('hides technical detail by default', () => {
    render(<ErrorBubble error={err()} />);
    expect(screen.queryByText('APIError: 503 No available accounts')).toBeNull();
  });

  it('toggles technical detail on click', () => {
    render(<ErrorBubble error={err()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看技术详情' }));
    expect(screen.getByText('APIError: 503 No available accounts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '隐藏技术详情' }));
    expect(screen.queryByText('APIError: 503 No available accounts')).toBeNull();
  });

  it('hides toggle when no detail', () => {
    render(<ErrorBubble error={err({ detail: '' })} />);
    expect(screen.queryByRole('button', { name: '查看技术详情' })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/agentRuntime/ErrorBubble.test.tsx`
Expected: FAIL — `Cannot find module './ErrorBubble'`

- [ ] **Step 3: 实现**

Create `src/components/agentRuntime/ErrorBubble.tsx`:
```typescript
import React, { useState } from 'react';
import type { AgentError } from '../../services/agentRuntimeApi';

export const ErrorBubble: React.FC<{ error: AgentError }> = ({ error }) => {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="error-bubble" style={{ borderLeft: '3px solid #B42318', background: '#FEF3F2', padding: '10px 14px', borderRadius: 8 }}>
      <div style={{ color: '#B42318', fontWeight: 700, fontSize: 14 }}>{error.message}</div>
      {error.detail && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{ marginTop: 6, fontSize: 12, background: 'transparent', border: 'none', color: '#B42318', cursor: 'pointer', padding: 0 }}
        >
          {open ? '隐藏技术详情' : '查看技术详情'}
        </button>
      )}
      {open && error.detail && (
        <pre data-testid="error-detail" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#7A271A', fontSize: 11 }}>
          {error.detail}
        </pre>
      )}
    </div>
  );
};

export default ErrorBubble;
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/agentRuntime/ErrorBubble.test.tsx`
Expected: PASS(4 passed)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/ErrorBubble.tsx src/components/agentRuntime/ErrorBubble.test.tsx
git commit -m "feat(ui): ErrorBubble 主提示+可折叠技术详情"
```

---

## Task 9: 前端 MessageBubble 接入 ErrorBubble

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Test: `src/components/agentRuntime/MessageBubble.test.tsx`(加测试)

- [ ] **Step 1: 写失败测试**

在 `src/components/agentRuntime/MessageBubble.test.tsx` 的 `describe` 块内追加:
```typescript
  it('renders ErrorBubble when error prop is present', () => {
    render(
      <MessageBubble
        role="assistant"
        content=""
        error={{ category: 'service_unavailable', message: 'AI 服务暂时不可用,请稍后重试', detail: '503 No available accounts' }}
      />
    );
    expect(screen.getByTestId('error-bubble')).toBeTruthy();
    expect(screen.getByText('AI 服务暂时不可用,请稍后重试')).toBeTruthy();
    expect(screen.queryByTestId('markdown-content')).toBeNull();
  });

  it('does not show copy actions when error is present', () => {
    render(
      <MessageBubble
        role="assistant"
        content=""
        error={{ category: 'internal', message: '智能体内部出错', detail: 'boom' }}
      />
    );
    expect(screen.queryByRole('button', { name: '复制内容' })).toBeNull();
  });
```
并在文件顶部 import 区确保引入(若未引):
```typescript
import type { AgentError } from '../../../services/agentRuntimeApi';
```
(实际路径按 MessageBubble.tsx 相对位置:`../../services/agentRuntimeApi`)

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/agentRuntime/MessageBubble.test.tsx -t "ErrorBubble when error"`
Expected: FAIL — `error` prop 不存在,ErrorBubble 未渲染

- [ ] **Step 3: 实现**

Modify `src/components/agentRuntime/MessageBubble.tsx`:

顶部 import 加(第 2 行 `import Markdown` 附近):
```typescript
import ErrorBubble from './ErrorBubble';
import type { AgentError } from '../../services/agentRuntimeApi';
```

`Props` interface(10-19 行)加字段:
```typescript
  error?: AgentError;
```

`MessageBubble` 组件参数解构(71 行)加 `error`:
```typescript
const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true, workspaceCwd, runtimeStatus, runtimeEvents = [], onExportDocx, error }) => {
```

在 assistant 分支(`if (role === 'assistant')` 内,204 行起),把 `<Markdown content={content} />`(230 行)及后续 toolEvents/actions 用 error 短路。即把从 `{runtimeStatus && ...}` 到 actions `</div>` 结束(225-263 行)的整块,前置 error 判断:
```typescript
        >
          {error ? (
            <ErrorBubble error={error} />
          ) : (
            <>
              {runtimeStatus && (
                <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 10, background: '#F7F2FF', color: '#4C1D95', fontSize: 12, fontWeight: 700 }}>
                  {runtimeStatus}
                </div>
              )}
              <Markdown content={content} />
              {toolEvents.length > 0 && (
                <details data-testid="assistant-tool-timeline" style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#6B625A', fontSize: 12, fontWeight: 700 }}>工具时间线</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {toolEvents.map((event, index) => (
                      <div key={`${event.type}-${event.ts}-${index}`} style={{ border: '1px solid #E6DED2', borderRadius: 10, padding: 8, background: '#FFFDF9' }}>
                        <div style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 700 }}>{event.label}</div>
                        {event.detail && <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#6B625A', fontSize: 11 }}>{event.detail}</pre>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {showActions && (
                <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                  {/* ...原有 actions 按钮保持不变... */}
                </div>
              )}
            </>
          )}
        </div>
```
注意:actions 块内的原有按钮(复制/纯文本/朗读/导出Word/重新生成)原样保留在 `<>...</>` 内,只是整体被 `error ? <ErrorBubble/> : <>...</>` 包裹。执行时把现有 225-263 行内容移入 `<>` 内,不改按钮本身。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/agentRuntime/MessageBubble.test.tsx`
Expected: PASS(含新 error 测试 + 全部现有测试不回归)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(ui): MessageBubble 有 error 时渲染 ErrorBubble(纯增量)"
```

---

## Task 10: 前端 store 接 error 对象 + 渲染传 prop

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Modify: 渲染组件(`grep <MessageBubble` 定位)
- Test: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: 写失败测试**

先读 `src/stores/agentRuntimeStore.test.ts` 现有结构,在末尾追加(workspace onError 存 error 对象):
```typescript
import { useAgentRuntimeStore } from './agentRuntimeStore';

it('workspace onError stores AgentError on assistant message', async () => {
  // 通过 mock runAgent 触发 onError 回调,断言最后一条 assistant 消息带 error 对象
  // 具体写法参照该文件现有 runWorkspace 的测试 mock 模式
  // 断言:最后一条 message.error.category === 'service_unavailable'
});
```
执行时按现有 mock 模式补全(参照文件内已有的 runAgent vi.mock 用法)。核心断言:`get().workspaceMessages.at(-1).error?.category` 为传入值。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/agentRuntimeStore.test.ts`
Expected: FAIL — 当前 onError 把 err 当字符串拼进 content,无 error 字段

- [ ] **Step 3: 实现 store**

Modify `src/stores/agentRuntimeStore.ts`:

`ChatMessage` interface(6-10 行)加字段:
```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  seq?: number;
  error?: import('../services/agentRuntimeApi').AgentError;
}
```

删除 `formatWorkspaceError` 函数(76-78 行)。

import 区(第 2 行)把:
```typescript
import { listAgents, runAgent, type AgentInfo, type AgentEvent } from '../services/agentRuntimeApi';
```
改为:
```typescript
import { listAgents, runAgent, type AgentInfo, type AgentEvent, type AgentError } from '../services/agentRuntimeApi';
```
ChatMessage 的 error 字段类型改为 `AgentError`(替换上面的 inline import)。

workspace onError(395-417 行),把:
```typescript
      async (err) => {
        if (!get().workspaceRunning || !isCurrentRun()) return;
        const sessionId = get().workspaceSessionId;
        const assistantMessage = { role: 'assistant' as const, content: formatWorkspaceError(err) };
        set({
          workspaceMessages: [...get().workspaceMessages, assistantMessage],
          workspaceStreaming: '',
          workspaceRunning: false,
          workspaceAbortController: null,
        });
        const persisted = await appendWorkspaceMessages(sessionId, [userMessage, assistantMessage]);
```
改为(`err` 现在是 `AgentError` 对象;落库 content 存可读串):
```typescript
      async (err: AgentError) => {
        if (!get().workspaceRunning || !isCurrentRun()) return;
        const sessionId = get().workspaceSessionId;
        const assistantMessage: ChatMessage = { role: 'assistant', content: '', error: err };
        set({
          workspaceMessages: [...get().workspaceMessages, assistantMessage],
          workspaceStreaming: '',
          workspaceRunning: false,
          workspaceAbortController: null,
        });
        const persisted = await appendWorkspaceMessages(sessionId, [
          userMessage,
          { role: 'assistant', content: `${err.message}\n\n[技术详情] ${err.detail}` },
        ]);
```
(后续 persisted 处理逻辑不变。)

assistant onError(458-466 行),把:
```typescript
      (err) => {
        if (!get().assistantRunning || !isCurrentRun()) return;
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: `[错误] ${err}` }],
          assistantStreaming: '',
          assistantRunning: false,
          assistantAbortController: null,
        });
      },
```
改为:
```typescript
      (err: AgentError) => {
        if (!get().assistantRunning || !isCurrentRun()) return;
        set({
          assistantMessages: [...get().assistantMessages, { role: 'assistant', content: '', error: err }],
          assistantStreaming: '',
          assistantRunning: false,
          assistantAbortController: null,
        });
      },
```

- [ ] **Step 4: 实现 — 渲染传 prop**

定位渲染点:
```bash
grep -rn "<MessageBubble" src/components
```
对每个调用点(workspace 消息列表 + assistant 对话面板),给 `<MessageBubble>` 加 `error={m.error}` prop。例,若现有是:
```tsx
<MessageBubble role={m.role} content={m.content} ... />
```
改为:
```tsx
<MessageBubble role={m.role} content={m.content} error={m.error} ... />
```
对所有遍历 `workspaceMessages` / `assistantMessages` 渲染 MessageBubble 的位置都加。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/stores/agentRuntimeStore.test.ts src/components/agentRuntime`
Expected: PASS(store 新测试 + 现有组件测试不回归)

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts src/components
git commit -m "feat(store): onError 存 AgentError 对象 + 渲染传 error prop"
```

---

## Task 11: 端到端验证

**Files:** 无(验证任务)

- [ ] **Step 1: 后端全测**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -x`
Expected: PASS(忽略 memory 记录的预先存在失败测试若与本改动无关;新增/扩展测试全过)

- [ ] **Step 2: 前端全测**

Run: `npx vitest run src/services src/components src/stores`
Expected: PASS(忽略老体系 view='chat' 测试)

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 无错误

- [ ] **Step 4: 手动验证(关键)**

起后端:`cd backend && .venv/Scripts/python.exe run_server.py`
起前端:`npm run dev`

在前端用 claude-sdk agent(workspace)发一条消息。预期(代理仍 503):
- 看到 ErrorBubble,主提示"AI 服务暂时不可用,请稍后重试"
- 点"查看技术详情"展开,看到具体内容(如 `APIError: 503 No available accounts` 或重试耗尽信息),不再是"HTTP 503"

在 assistant 对话发一条,确认同样呈现。

- [ ] **Step 5: 更新跟踪矩阵**

更新 `项目执行跟踪矩阵.md`(若该改动对应某 RQ 项;若无对应项,追加一行记录本次错误体验加固)。

- [ ] **Step 6: Commit(若有矩阵/收尾改动)**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 更新跟踪矩阵(agent 错误体验加固)"
```

---

## Self-Review 结论

- **Spec 覆盖**:spec 第 5 节分类 → Task 1;第 6.1 emit_error → Task 2;6.2 classify helper → Task 1;6.3 路由 JSON → Task 6;6.4/6.5 前端归一化 → Task 7;第 7 节各文件 → Task 3-6(后端)/7-10(前端);第 9 节测试 → 各 Task Step 1;第 10 节兼容(onError 签名)→ Task 7+10。全覆盖。
- **类型一致**:`AgentError {category, message, detail}` 在 Task 7 定义,Task 8/9/10 引用一致;`classify` 返回值与前端 `ErrorCategory` 字面量一致(4 类)。
- **无 placeholder**:每个 step 含完整代码或明确 grep 定位 + 具体 prop 代码。

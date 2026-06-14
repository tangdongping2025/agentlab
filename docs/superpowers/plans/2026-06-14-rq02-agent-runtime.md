# RQ-2 Agent Runtime + API + SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立后端 Agent 运行时(L2):Agent 协议、事件系统、注册表、executor、工具框架;加 API 网关(L4)的 `/api/agents` 路由 + SSE 流式;用一个 echo agent(不调 LLM)端到端验证"定义→注册→调用→SSE→事件"骨架。

**Architecture:** Agent 是 ABC,`async def run(task, emit) -> None`,通过 `EventEmitter`(asyncio.Queue)流式产 8 种标准事件;`@register_agent` 装饰器注册;executor 启动 agent.run 后台 task 返回 emitter;FastAPI `StreamingResponse` 消费 emitter 产出 SSE 流。

**Tech Stack:** Python 3 / FastAPI / asyncio / pytest + pytest-asyncio + httpx(API 测试)

---

## 前置确认(已批量确认)

- A1 事件类型 8 种(text/thinking/tool_call/tool_result/token_usage/action/error/done)
- A2 RQ-2 只搭工具框架,anysearch 实现推 RQ-4
- A3 SSE 端点 POST /api/agents/{id}/run
- A4 echo agent 最简回显,不调 LLM
- A5 v1 无状态
- B1-B8 全认可(ABC 接口 / 8 事件 / 装饰器注册 / backend/runtime/ 目录 / StreamingResponse / echo_agent / routers/agents.py / 无状态)

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/runtime/__init__.py` | 新建 | runtime 包(空) |
| `backend/runtime/events.py` | 新建 | EventType(8种) + AgentEvent + EventEmitter(Queue + aiter) |
| `backend/runtime/agent.py` | 新建 | Agent ABC + AgentMetadata + AgentTask |
| `backend/runtime/registry.py` | 新建 | `@register_agent` + get/list/create |
| `backend/runtime/executor.py` | 新建 | `run_agent(agent, task) -> emitter`,后台 task + 异常兜底 |
| `backend/runtime/tools/__init__.py` | 新建 | Tool 协议 + ToolRegistry(空,v1 无实现) |
| `backend/agents/__init__.py` | 新建 | agents 包(导入 echo_agent 触发注册) |
| `backend/agents/echo_agent.py` | 新建 | EchoAgent(回显,验证骨架) |
| `backend/routers/agents.py` | 新建 | GET /api/agents、GET /{id}、POST /{id}/run(SSE) |
| `backend/main.py` | 修改 | 挂载 agents router + 导入 agents 包触发注册 |
| `backend/tests/test_agent_runtime.py` | 新建 | events/agent/registry/executor 单元测试 |
| `backend/tests/test_agents_api.py` | 新建 | API 测试(TestClient + SSE) |

---

### Task 1: 事件系统 events.py

**Files:** Create `backend/runtime/__init__.py`(空), `backend/runtime/events.py`; Test `backend/tests/test_agent_runtime.py`

- [ ] **Step 1: 新建 runtime 包** — 创建空文件 `backend/runtime/__init__.py`

- [ ] **Step 2: 写测试** — 创建 `backend/tests/test_agent_runtime.py`:
```python
import asyncio
import pytest

from runtime.events import AgentEvent, EventEmitter, EventType


def test_event_type_values():
    assert EventType.TEXT.value == "text"
    assert EventType.THINKING.value == "thinking"
    assert EventType.TOOL_CALL.value == "tool_call"
    assert EventType.DONE.value == "done"
    assert EventType.ERROR.value == "error"


async def test_event_collected_in_order():
    emit = EventEmitter()
    await emit.emit(EventType.TEXT, text="a")
    await emit.emit(EventType.TEXT, text="b")
    await emit.emit_done()
    events = [e async for e in emit]
    assert [e.type for e in events] == [EventType.TEXT, EventType.TEXT, EventType.DONE]
    assert events[0].data == {"text": "a"}
    assert events[2].type == EventType.DONE


async def test_event_emitter_error_ends_stream():
    emit = EventEmitter()
    await emit.emit(EventType.TEXT, text="x")
    await emit.emit_error("boom")
    events = [e async for e in emit]
    assert events[-1].type == EventType.ERROR
    assert events[-1].data == {"error": "boom"}
```

- [ ] **Step 3: 确认失败** — Run: `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest tests/test_agent_runtime.py -v` → FAIL `ModuleNotFoundError: runtime.events`

- [ ] **Step 4: 实现 events.py** — 创建 `backend/runtime/events.py`:
```python
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import Enum


class EventType(str, Enum):
    TEXT = "text"
    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOKEN_USAGE = "token_usage"
    ACTION = "action"
    ERROR = "error"
    DONE = "done"


@dataclass
class AgentEvent:
    type: EventType
    data: dict


class EventEmitter:
    """agent 通过 emit() 产事件,内部 asyncio.Queue;None 哨兵标记流结束。"""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[AgentEvent | None] = asyncio.Queue()

    async def emit(self, type: EventType, **data) -> None:
        await self._queue.put(AgentEvent(type=type, data=data))

    async def emit_done(self, **data) -> None:
        await self._queue.put(AgentEvent(type=EventType.DONE, data=data))
        await self._queue.put(None)

    async def emit_error(self, error: str) -> None:
        await self._queue.put(AgentEvent(type=EventType.ERROR, data={"error": error}))
        await self._queue.put(None)

    async def __aiter__(self):
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event
```

- [ ] **Step 5: 确认通过** — Run: 同 Step 3 → 3 passed

- [ ] **Step 6: Commit** — `git add backend/runtime/__init__.py backend/runtime/events.py backend/tests/test_agent_runtime.py && git commit -m "feat(runtime): RQ-2 事件系统(EventType 8 种 + EventEmitter)"`

---

### Task 2: Agent 协议 agent.py

**Files:** Create `backend/runtime/agent.py`; Modify `backend/tests/test_agent_runtime.py`(追加)

- [ ] **Step 1: 追加测试** — 在 `test_agent_runtime.py` 顶部 import 加 `from runtime.agent import Agent, AgentMetadata, AgentTask`,末尾追加:
```python
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter


def test_agent_metadata_construct():
    m = AgentMetadata(id="echo", name="Echo", description="d", workspace={"type": "chat"})
    assert m.id == "echo"
    assert m.workspace == {"type": "chat"}


def test_agent_task_defaults():
    t = AgentTask(messages=[{"role": "user", "content": "hi"}])
    assert t.system is None
    assert t.config == {}


def test_agent_is_abstract():
    with pytest.raises(TypeError):
        Agent()  # ABC 不能直接实例化
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_agent_runtime.py -v -k "metadata or task_defaults or abstract"` → FAIL import error

- [ ] **Step 3: 实现 agent.py** — 创建 `backend/runtime/agent.py`:
```python
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from .events import EventEmitter


@dataclass
class AgentMetadata:
    id: str
    name: str
    description: str
    workspace: dict
    capabilities: list = field(default_factory=list)


@dataclass
class AgentTask:
    messages: list  # [{"role":"user","content":"..."}]
    system: str | None = None
    config: dict = field(default_factory=dict)


class Agent(ABC):
    """Agent 抽象基类。子类定义类属性 metadata + 实现 run。"""

    metadata: AgentMetadata

    @abstractmethod
    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        """执行任务,通过 emit 流式产事件。不返回结果。"""
        ...
```

- [ ] **Step 4: 确认通过** — Run: `... pytest tests/test_agent_runtime.py -v` → 6 passed(3 Task1 + 3 Task2)

- [ ] **Step 5: Commit** — `git add backend/runtime/agent.py backend/tests/test_agent_runtime.py && git commit -m "feat(runtime): RQ-2 Agent ABC + AgentMetadata + AgentTask"`

---

### Task 3: 注册表 registry.py + 工具框架 tools/

**Files:** Create `backend/runtime/registry.py`, `backend/runtime/tools/__init__.py`; Modify test

- [ ] **Step 1: 追加测试** — test_agent_runtime.py import 加 `from runtime.registry import register_agent, get_agent_class, list_agents, create_agent, _AGENT_REGISTRY`,中间加一个临时测试 agent 类 + 注册测试:
```python
from runtime.registry import register_agent, get_agent_class, list_agents, create_agent


def test_register_and_lookup():
    @register_agent
    class _TmpAgent(Agent):
        metadata = AgentMetadata(id="_tmp_test", name="Tmp", description="t", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit_done()

    assert get_agent_class("_tmp_test") is _TmpAgent
    assert "_tmp_test" in list_agents()
    inst = create_agent("_tmp_test")
    assert inst is not None and inst.metadata.id == "_tmp_test"
    assert create_agent("nonexistent") is None
    # 清理,避免污染其他测试
    from runtime import registry
    registry._AGENT_REGISTRY.pop("_tmp_test", None)
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_agent_runtime.py -v -k register` → FAIL import error

- [ ] **Step 3: 实现 registry.py** — 创建 `backend/runtime/registry.py`:
```python
from __future__ import annotations

from typing import Type

from .agent import Agent

_AGENT_REGISTRY: dict[str, Type[Agent]] = {}


def register_agent(agent_cls: Type[Agent]) -> Type[Agent]:
    """装饰器:注册 agent 类。key = agent_cls.metadata.id。"""
    agent_id = agent_cls.metadata.id
    _AGENT_REGISTRY[agent_id] = agent_cls
    return agent_cls


def get_agent_class(agent_id: str) -> Type[Agent] | None:
    return _AGENT_REGISTRY.get(agent_id)


def list_agents() -> list[str]:
    return list(_AGENT_REGISTRY.keys())


def create_agent(agent_id: str) -> Agent | None:
    cls = get_agent_class(agent_id)
    return cls() if cls else None
```

- [ ] **Step 4: 实现 tools 框架(空)** — 创建 `backend/runtime/tools/__init__.py`:
```python
"""工具系统框架(RQ-2 只搭框架,工具实现推 RQ-4)。

后续:Tool 协议 + ToolRegistry;anysearch 等工具在此注册。
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Tool(Protocol):
    """工具协议(占位,RQ-4 完善)。"""
    name: str
    description: str

    async def execute(self, **params) -> str:
        ...


# 工具注册表(RQ-4 实现)
_TOOL_REGISTRY: dict[str, Tool] = {}


def register_tool(tool: Tool) -> Tool:
    _TOOL_REGISTRY[tool.name] = tool
    return tool
```

- [ ] **Step 5: 确认通过** — Run: `... pytest tests/test_agent_runtime.py -v` → 7 passed

- [ ] **Step 6: Commit** — `git add backend/runtime/registry.py backend/runtime/tools backend/tests/test_agent_runtime.py && git commit -m "feat(runtime): RQ-2 注册表(@register_agent) + 工具框架(占位)"`

---

### Task 4: executor.py(运行 + 异常兜底)

**Files:** Create `backend/runtime/executor.py`; Modify test

- [ ] **Step 1: 追加测试** — test_agent_runtime.py import 加 `from runtime.executor import run_agent`,末尾追加:
```python
from runtime.executor import run_agent


async def test_run_agent_collects_events():
    class _EA(Agent):
        metadata = AgentMetadata(id="_ea_test", name="EA", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit(EventType.TEXT, text="hello")
            await emit.emit_done()

    emit = await run_agent(_EA(), AgentTask(messages=[]))
    events = [e async for e in emit]
    assert [e.type for e in events] == [EventType.TEXT, EventType.DONE]
    assert events[0].data == {"text": "hello"}


async def test_run_agent_catches_exception():
    class _FailAgent(Agent):
        metadata = AgentMetadata(id="_fail_test", name="Fail", description="d", workspace={"type": "chat"})
        async def run(self, task, emit):
            await emit.emit(EventType.TEXT, text="partial")
            raise RuntimeError("agent crashed")

    emit = await run_agent(_FailAgent(), AgentTask(messages=[]))
    events = [e async for e in emit]
    assert events[-1].type == EventType.ERROR
    assert "agent crashed" in events[-1].data["error"]
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_agent_runtime.py -v -k run_agent` → FAIL import

- [ ] **Step 3: 实现 executor.py** — 创建 `backend/runtime/executor.py`:
```python
from __future__ import annotations

import asyncio

from .agent import Agent, AgentTask
from .events import EventEmitter


async def run_agent(agent: Agent, task: AgentTask) -> EventEmitter:
    """启动 agent.run 后台 task,返回 emitter 供消费事件。

    agent.run 正常应自己 emit_done;若抛异常,这里兜底 emit_error。
    """
    emit = EventEmitter()

    async def _runner():
        try:
            await agent.run(task, emit)
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")

    asyncio.create_task(_runner())
    # 让出控制,让 _runner 有机会开始(确保事件能被消费)
    await asyncio.sleep(0)
    return emit
```

- [ ] **Step 4: 确认通过** — Run: `... pytest tests/test_agent_runtime.py -v` → 9 passed

- [ ] **Step 5: Commit** — `git add backend/runtime/executor.py backend/tests/test_agent_runtime.py && git commit -m "feat(runtime): RQ-2 executor(run_agent 后台 task + 异常兜底)"`

---

### Task 5: echo_agent + agents 包

**Files:** Create `backend/agents/__init__.py`, `backend/agents/echo_agent.py`; Modify test

- [ ] **Step 1: 写测试** — 创建 `backend/tests/test_echo_agent.py`:
```python
import pytest

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.registry import get_agent_class, create_agent


def test_echo_agent_registered():
    import agents  # 触发注册(导入 agents 包)
    assert get_agent_class("echo") is not None


async def test_echo_agent_echos_last_user_message():
    import agents  # noqa
    agent = create_agent("echo")
    from runtime.events import EventEmitter
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[{"role": "user", "content": "你好"}]), emit)
    events = [e async for e in emit]
    texts = [e.data.get("text", "") for e in events if e.type == EventType.TEXT]
    assert any("你好" in t for t in texts)
    assert events[-1].type == EventType.DONE


async def test_echo_agent_empty_messages():
    import agents  # noqa
    agent = create_agent("echo")
    from runtime.events import EventEmitter
    emit = EventEmitter()
    await agent.run(AgentTask(messages=[]), emit)
    events = [e async for e in emit]
    assert events[-1].type == EventType.DONE  # 即使无消息也正常结束
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_echo_agent.py -v` → FAIL(agents 包不存在)

- [ ] **Step 3: 实现 echo_agent.py** — 创建 `backend/agents/echo_agent.py`:
```python
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent


@register_agent
class EchoAgent(Agent):
    """回显 agent:把最后一条 user 消息回显,验证骨架(不调 LLM)。"""

    metadata = AgentMetadata(
        id="echo",
        name="Echo",
        description="回显 agent,验证载体骨架(不调 LLM)",
        workspace={"type": "chat"},
    )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        last_user = next(
            (m for m in reversed(task.messages) if m.get("role") == "user"),
            None,
        )
        text = last_user["content"] if last_user else "(无消息)"
        await emit.emit(EventType.TEXT, text=f"Echo: {text}")
        await emit.emit_done()
```

- [ ] **Step 4: 实现 agents 包 __init__** — 创建 `backend/agents/__init__.py`:
```python
"""agents 实现层(L3)。导入此包触发各 agent 注册。"""
from . import echo_agent  # noqa: F401  触发 @register_agent
```

- [ ] **Step 5: 确认通过** — Run: `... pytest tests/test_echo_agent.py -v` → 3 passed;再跑全量 `... pytest tests/test_agent_runtime.py tests/test_echo_agent.py -v` → 12 passed

- [ ] **Step 6: Commit** — `git add backend/agents backend/tests/test_echo_agent.py && git commit -m "feat(agents): RQ-2 EchoAgent + agents 包(注册机制)"`

---

### Task 6: API routers/agents.py + main.py 挂载

**Files:** Create `backend/routers/agents.py`; Modify `backend/main.py`; Create `backend/tests/test_agents_api.py`

- [ ] **Step 1: 写 API 测试** — 创建 `backend/tests/test_agents_api.py`:
```python
import json
import pytest


def test_list_agents_includes_echo(client):
    import agents  # 触发注册
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert "echo" in ids


def test_get_agent_metadata(client):
    import agents
    resp = client.get("/api/agents/echo")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "echo"
    assert body["workspace"] == {"type": "chat"}


def test_get_unknown_agent_404(client):
    resp = client.get("/api/agents/nonexistent")
    assert resp.status_code == 404


def test_run_echo_returns_sse_stream(client):
    import agents
    resp = client.post(
        "/api/agents/echo/run",
        json={"messages": [{"role": "user", "content": "你好"}]},
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
    body = resp.text
    # SSE 文本里应含 text 事件 + done 事件
    assert "你好" in body
    assert '"done"' in body or '"type": "done"' in body
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_agents_api.py -v` → FAIL(路由不存在,404 或连接错)

- [ ] **Step 3: 实现 routers/agents.py** — 创建 `backend/routers/agents.py`:
```python
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from runtime.agent import AgentTask
from runtime.executor import run_agent
from runtime.registry import _AGENT_REGISTRY, create_agent

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _meta_dict(agent_cls):
    m = agent_cls.metadata
    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "workspace": m.workspace,
        "capabilities": m.capabilities,
    }


@router.get("")
async def list_agents():
    return [_meta_dict(cls) for cls in _AGENT_REGISTRY.values()]


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    agent = create_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return _meta_dict(type(agent))


@router.post("/{agent_id}/run")
async def run_agent_endpoint(agent_id: str, task: AgentTask):
    agent = create_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    emit = await run_agent(agent, task)

    async def event_stream():
        async for event in emit:
            payload = {"type": event.type.value, "data": event.data}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 4: 修改 main.py 挂载 router + 导入 agents 包** — 在 `backend/main.py` 里:
  - 加 `from routers import agents as agents_router`(在现有 router import 附近)
  - 加 `import agents  # 触发 agent 注册`(在 app 创建前)
  - 加 `app.include_router(agents_router.router)`(在现有 include_router 附近)
  
  执行者需先读 `backend/main.py` 看现有结构,按现有模式加这三处(不破坏现有 /api/db router)。

- [ ] **Step 5: 确认通过** — Run: `... pytest tests/test_agents_api.py -v` → 4 passed;全量 `... pytest -q` → 全绿(含 RQ-1 + RQ-2 + 现有)

- [ ] **Step 6: Commit** — `git add backend/routers/agents.py backend/main.py backend/tests/test_agents_api.py && git commit -m "feat(api): RQ-2 /api/agents 路由 + SSE 流式 + main 挂载"`

---

### Task 7: 端到端验证

**Files:** 无新文件(验证脚本临时跑)

- [ ] **Step 1: 全量测试无回归** — Run: `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest -q` → 全绿

- [ ] **Step 2: 端到端 SSE 验证(启动 server + curl)** — 两种方式之一:

  方式 A(uvicorn + curl):
  ```bash
  cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m uvicorn main:app --port 8000 &
  sleep 2
  curl -N -X POST http://localhost:8000/api/agents/echo/run -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"你好"}]}'
  kill %1
  ```
  Expected: 输出 SSE 流,含 `data: {"type":"text","data":{"text":"Echo: 你好"}}` 和 `data: {"type":"done",...}`

  方式 B(Python 脚本,避免 shell 后台进程):
  ```bash
  cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -c "
  from fastapi.testclient import TestClient
  import agents
  from main import app
  c = TestClient(app)
  r = c.post('/api/agents/echo/run', json={'messages':[{'role':'user','content':'你好'}]})
  print('STATUS', r.status_code)
  print('BODY', r.text)
  "
  ```
  Expected: STATUS 200,BODY 含 Echo 你好 + done。

  推荐**方式 B**(避免 Windows bash 后台进程问题)。

- [ ] **Step 3: Commit(空,仅验证)** — 无代码改动,不 commit。若 Step 2 发现 bug,修后 commit。

---

## 完成标准(RQ-2 DoD)

- [ ] `backend/runtime/` 建立(events/agent/registry/executor/tools)
- [ ] `backend/agents/echo_agent.py` 注册并工作
- [ ] `backend/routers/agents.py` 提供列表/详情/SSE-run 三端点
- [ ] main.py 挂载 + agent 注册触发
- [ ] 全量测试全绿(RQ-1 + RQ-2 + 现有)
- [ ] 端到端:POST /api/agents/echo/run 返回 SSE 流,含 text + done 事件

## 后续衔接(RQ-3)

RQ-3(前端工作台 + 可视化适配)会:
- 调 `GET /api/agents` 列 agent、`POST /api/agents/{id}/run` 订阅 SSE
- 把 SSE 事件(text/done/...)经 eventAdapter 喂给现有可视化组件
- v1 用 echo agent 验证前端骨架

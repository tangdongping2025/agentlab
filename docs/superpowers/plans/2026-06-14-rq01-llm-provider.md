# RQ-1 LLM Provider 抽象层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后端 Python 建立 LLM provider 抽象层(L1),让上层 agent runtime 通过统一接口调 LLM;首个实现是 ARK(火山引擎,Anthropic 格式兼容),支持非流式/流式/tool use。

**Architecture:** 定义 `LLMProvider` Protocol(`complete()` 非流式 + `stream()` 流式 emit 事件),`ArkProvider` 用 `anthropic` 官方 SDK 配 `base_url=ARK` 实现。provider 抽象不绑死单一厂商,`anthropic_provider` 接口预留(v1 不实现)。测试用 `respx` mock anthropic 的 HTTP 调用,不真实联网。

**Tech Stack:** Python 3.12 / anthropic SDK / pydantic-settings(config)/ pytest + pytest-asyncio + respx(mock HTTP)

---

## 前置确认(已批量确认)

- A1 ARK key 放 `backend/.env`,接受前端/后端两份 key 并存(RQ-6 收口)
- A2 单元测试 mock,不做真实 ARK 集成测试;链路验证手动 curl
- A3 模型沿用 `claude-3-5-sonnet-20240620`
- B1-B6 全认可(anthropic SDK / Provider Protocol / `backend/infra/llm/` / backend/.env / requirements / 现有 venv)

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/requirements.txt` | 修改 | 加 anthropic / respx / pytest-asyncio |
| `backend/config.py` | 修改 | Settings 加 `llm_api_key` / `llm_base_url` / `llm_model` |
| `backend/.env.example` | 新建 | LLM 配置示例(供参考,.env 本身已 gitignore) |
| `backend/pytest.ini` | 新建 | asyncio_mode = auto |
| `backend/infra/__init__.py` | 新建 | infra 包(空) |
| `backend/infra/llm/__init__.py` | 新建 | 导出 provider 公共 API |
| `backend/infra/llm/base.py` | 新建 | 数据类型 + `LLMProvider` Protocol |
| `backend/infra/llm/ark.py` | 新建 | `ArkProvider` 实现(complete/stream/tool use) |
| `backend/tests/test_llm_provider.py` | 新建 | 单元测试(respx mock) |

**说明**:测试放 `backend/tests/` 共用现有 `conftest.py`。LLM 测试本身不碰 DB,但 conftest 的 session 级 `_setup_db` 仍会执行(需 MySQL 可用,开发环境满足);若 CI 无 MySQL,后续可加独立 conftest,本 plan 不处理。

---

### Task 1: 依赖与配置

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.py`
- Create: `backend/.env.example`
- Create: `backend/pytest.ini`

- [ ] **Step 1: 更新 requirements.txt**

把 `backend/requirements.txt` 全文替换为:

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pymysql==1.1.1
cryptography>=43.0.0
pydantic-settings==2.5.2
pytest==8.3.3
httpx==0.27.2
anthropic>=0.39.0
respx>=0.21.1
pytest-asyncio>=0.24.0
```

- [ ] **Step 2: 安装新依赖**

Run: `cd backend && .venv/Scripts/python.exe -m pip install -r requirements.txt`
Expected: 成功安装 anthropic / respx / pytest-asyncio

- [ ] **Step 3: 修改 config.py 加 LLM 字段**

把 `backend/config.py` 全文替换为:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "context_lab"

    # LLM provider 配置(RQ-1)
    llm_api_key: str = ""
    llm_base_url: str = "https://ark.cn-beijing.volces.com/api/coding"
    llm_model: str = "claude-3-5-sonnet-20240620"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )


settings = Settings()
```

- [ ] **Step 4: 新建 .env.example**

创建 `backend/.env.example`:

```
# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=context_lab

# LLM provider(ARK / 火山引擎,Anthropic 格式兼容)
LLM_API_KEY=ark-xxx
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding
LLM_MODEL=claude-3-5-sonnet-20240620
```

- [ ] **Step 5: 新建 pytest.ini(asyncio 配置)**

创建 `backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 6: 确认现有测试仍通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`
Expected: 现有测试(test_health/test_migrate/test_query/test_sessions_crud)全绿(配置改动不应破坏它们)

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/config.py backend/.env.example backend/pytest.ini
git commit -m "feat(backend): RQ-1 加 LLM provider 依赖与配置(anthropic/respx/pytest-asyncio)"
```

---

### Task 2: provider 抽象 base.py

**Files:**
- Create: `backend/infra/__init__.py`
- Create: `backend/infra/llm/base.py`
- Test: `backend/tests/test_llm_provider.py`(本 task 只测数据类型可构造)

- [ ] **Step 1: 新建 infra 包**

创建空文件 `backend/infra/__init__.py`(内容为空)。

- [ ] **Step 2: 写测试(数据类型可构造)**

创建 `backend/tests/test_llm_provider.py`:

```python
import pytest

from infra.llm.base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)


def test_llm_message_construct():
    m = LLMMessage(role="user", content="hi")
    assert m.role == "user"
    assert m.content == "hi"


def test_tool_definition_construct():
    t = ToolDefinition(name="search", description="搜索", input_schema={"type": "object"})
    assert t.name == "search"


def test_stream_event_text():
    e = StreamEvent(type=EventType.TEXT, text="你好")
    assert e.type == EventType.TEXT
    assert e.text == "你好"
    assert e.tool_name is None


def test_complete_result():
    r = CompleteResult(content="reply", usage={"input_tokens": 5, "output_tokens": 3})
    assert r.content == "reply"
    assert r.usage["input_tokens"] == 5


def test_llm_provider_is_protocol():
    # Protocol 可用于类型标注(实例化无意义,这里只确认可导入且为 Protocol)
    assert hasattr(LLMProvider, "_is_protocol")
```

- [ ] **Step 3: 运行测试,确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'infra.llm.base'`

- [ ] **Step 4: 实现 base.py**

创建 `backend/infra/llm/base.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Literal, Protocol, runtime_checkable

Role = Literal["user", "assistant"]


@dataclass
class LLMMessage:
    role: Role
    content: str


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict


class EventType(str, Enum):
    TEXT = "text"
    TOOL_USE = "tool_use"
    DONE = "done"
    ERROR = "error"


@dataclass
class StreamEvent:
    type: EventType
    text: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    error: str | None = None
    usage: dict | None = None


@dataclass
class CompleteResult:
    content: str
    usage: dict | None = None


@runtime_checkable
class LLMProvider(Protocol):
    """LLM provider 抽象接口。所有 provider(ARK / Anthropic / ...)实现此接口。"""

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> CompleteResult:
        """非流式完成,返回完整结果。"""
        ...

    async def stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        """流式完成,yield StreamEvent(TEXT/TOOL_USE/DONE/ERROR)。"""
        ...
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v`
Expected: 5 passed

- [ ] **Step 6: Commit**

```bash
git add backend/infra/__init__.py backend/infra/llm/base.py backend/tests/test_llm_provider.py
git commit -m "feat(infra): RQ-1 LLMProvider Protocol + 数据类型"
```

---

### Task 3: ArkProvider — complete()(非流式)

**Files:**
- Create: `backend/infra/llm/ark.py`
- Modify: `backend/tests/test_llm_provider.py`(加 complete 测试)

- [ ] **Step 1: 写测试(complete 返回文本 + usage)**

在 `backend/tests/test_llm_provider.py` 顶部加 import,并追加测试:

```python
import httpx
import respx

from infra.llm.ark import ArkProvider


@pytest.fixture()
def ark_provider():
    return ArkProvider(
        api_key="test-key",
        base_url="https://ark.test",
        default_model="claude-3-5-sonnet-20240620",
    )


@respx.mock
async def test_complete_returns_text_and_usage(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "你好"}],
                "model": "claude-3-5-sonnet-20240620",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 10, "output_tokens": 5},
            },
        )
    )
    result = await ark_provider.complete([LLMMessage(role="user", content="hi")])
    assert result.content == "你好"
    assert result.usage == {"input_tokens": 10, "output_tokens": 5}


@respx.mock
async def test_complete_sends_system_and_model(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "ok"}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )
    )
    await ark_provider.complete(
        [LLMMessage(role="user", content="hi")],
        system="你是助手",
        model="custom-model",
        max_tokens=100,
        temperature=0.5,
    )
    import json as _json
    body = _json.loads(respx.calls[0].request.content)
    assert body["system"] == "你是助手"
    assert body["model"] == "custom-model"
    assert body["max_tokens"] == 100
    assert body["temperature"] == 0.5
    assert body["messages"] == [{"role": "user", "content": "hi"}]
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v -k complete`
Expected: FAIL —— `ModuleNotFoundError: No module named 'infra.llm.ark'`

- [ ] **Step 3: 实现 ark.py(complete 部分)**

创建 `backend/infra/llm/ark.py`:

```python
from __future__ import annotations

import json
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from .base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)


class ArkProvider:
    """火山引擎 ARK provider(Anthropic 格式兼容)。

    通过 anthropic SDK 配 base_url 指向 ARK。ARK 接受 Anthropic messages 格式,
    因此 SDK 直接可用(SSE 解析 / tool use 类型由 SDK 提供)。
    """

    def __init__(self, api_key: str, base_url: str, default_model: str):
        self._client = AsyncAnthropic(api_key=api_key, base_url=base_url)
        self._default_model = default_model

    def _to_anthropic_messages(self, messages: list[LLMMessage]) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in messages]

    def _to_anthropic_tools(self, tools: list[ToolDefinition] | None) -> list[dict] | None:
        if not tools:
            return None
        return [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ]

    def _build_kwargs(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None,
        model: str | None,
        max_tokens: int,
        temperature: float,
        tools: list[ToolDefinition] | None,
    ) -> dict:
        kwargs: dict = {
            "model": model or self._default_model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": self._to_anthropic_messages(messages),
        }
        if system:
            kwargs["system"] = system
        anthropic_tools = self._to_anthropic_tools(tools)
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools
        return kwargs

    async def complete(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> CompleteResult:
        kwargs = self._build_kwargs(
            messages,
            system=system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            tools=tools,
        )
        response = await self._client.messages.create(**kwargs)
        text_parts = [b.text for b in response.content if b.type == "text"]
        return CompleteResult(
            content="".join(text_parts),
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
        )

    async def stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        raise NotImplementedError  # Task 4 实现
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v -k complete`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/infra/llm/ark.py backend/tests/test_llm_provider.py
git commit -m "feat(infra): RQ-1 ArkProvider complete() 非流式实现"
```

---

### Task 4: ArkProvider — stream()(流式文本)

**Files:**
- Modify: `backend/infra/llm/ark.py`(实现 stream)
- Modify: `backend/tests/test_llm_provider.py`(加 stream 测试)

- [ ] **Step 1: 写测试(stream 文本增量 + DONE + usage)**

在 `backend/tests/test_llm_provider.py` 追加:

```python
@respx.mock
async def test_stream_yields_text_and_done(ark_provider):
    sse = (
        'event: message_start\n'
        'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n'
        'event: content_block_start\n'
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你"}}\n\n'
        'event: content_block_delta\n'
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}\n\n'
        'event: content_block_stop\n'
        'data: {"type":"content_block_stop","index":0}\n\n'
        'event: message_delta\n'
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n'
        'event: message_stop\n'
        'data: {"type":"message_stop"}\n\n'
    )
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200, text=sse, headers={"content-type": "text/event-stream"}
        )
    )
    events = [e async for e in ark_provider.stream([LLMMessage(role="user", content="hi")])]
    texts = "".join(e.text for e in events if e.type == EventType.TEXT)
    assert texts == "你好"
    assert events[-1].type == EventType.DONE
    assert events[-1].usage == {"input_tokens": 10, "output_tokens": 5}
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v -k stream`
Expected: FAIL —— `NotImplementedError`

- [ ] **Step 3: 实现 stream()**

把 `backend/infra/llm/ark.py` 中的 `stream` 方法(含 `raise NotImplementedError`)替换为:

```python
    async def stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        tools: list[ToolDefinition] | None = None,
    ) -> AsyncIterator[StreamEvent]:
        kwargs = self._build_kwargs(
            messages,
            system=system,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            tools=tools,
        )
        tool_name: str | None = None
        tool_input_buffer = ""
        async with self._client.messages.stream(**kwargs) as s:
            async for event in s:
                etype = event.type
                if etype == "content_block_start":
                    block = event.content_block
                    if getattr(block, "type", None) == "tool_use":
                        tool_name = block.name
                        tool_input_buffer = ""
                elif etype == "content_block_delta":
                    delta = event.delta
                    dtype = getattr(delta, "type", None)
                    if dtype == "text_delta":
                        yield StreamEvent(type=EventType.TEXT, text=delta.text)
                    elif dtype == "input_json_delta":
                        tool_input_buffer += delta.partial_json
                elif etype == "content_block_stop":
                    if tool_name is not None:
                        try:
                            tool_input = json.loads(tool_input_buffer) if tool_input_buffer else {}
                        except json.JSONDecodeError:
                            tool_input = {}
                        yield StreamEvent(
                            type=EventType.TOOL_USE,
                            tool_name=tool_name,
                            tool_input=tool_input,
                        )
                        tool_name = None
                        tool_input_buffer = ""
            final = await s.get_final_message()
            yield StreamEvent(
                type=EventType.DONE,
                usage={
                    "input_tokens": final.usage.input_tokens,
                    "output_tokens": final.usage.output_tokens,
                },
            )
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v -k stream`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add backend/infra/llm/ark.py backend/tests/test_llm_provider.py
git commit -m "feat(infra): RQ-1 ArkProvider stream() 流式实现(文本/tool use 事件)"
```

---

### Task 5: tool use 测试(complete + stream 带 tools)

**Files:**
- Modify: `backend/tests/test_llm_provider.py`(加 tool use 测试)

> 说明:Task 3/4 的实现已包含 tools 参数透传(`_build_kwargs`),本 task 只补 tool use 的测试覆盖,不改实现。

- [ ] **Step 1: 写测试(complete 带 tools 透传 tool 定义)**

在 `backend/tests/test_llm_provider.py` 追加:

```python
@respx.mock
async def test_complete_passes_tools(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "done"}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )
    )
    import json as _json
    await ark_provider.complete(
        [LLMMessage(role="user", content="搜新闻")],
        tools=[
            ToolDefinition(
                name="search",
                description="搜索",
                input_schema={"type": "object", "properties": {"q": {"type": "string"}}},
            )
        ],
    )
    body = _json.loads(respx.calls[0].request.content)
    assert body["tools"] == [
        {
            "name": "search",
            "description": "搜索",
            "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}},
        }
    ]


import json as _json2


def _sse(event: str, data: dict) -> str:
    """构造一行 SSE(json.dumps data,避免手写转义出错)。"""
    return f"event: {event}\ndata: {_json2.dumps(data)}\n\n"


@respx.mock
async def test_stream_emits_tool_use_event(ark_provider):
    sse = (
        _sse("message_start", {"type": "message_start", "message": {"usage": {"input_tokens": 5}}})
        + _sse("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "tool_1", "name": "search", "input": {}}})
        + _sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '{"q":'}})
        + _sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": '"新闻"}'}})
        + _sse("content_block_stop", {"type": "content_block_stop", "index": 0})
        + _sse("message_delta", {"type": "message_delta", "delta": {}, "usage": {"output_tokens": 8}})
        + _sse("message_stop", {"type": "message_stop"})
    )
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(
            200, text=sse, headers={"content-type": "text/event-stream"}
        )
    )
    events = [e async for e in ark_provider.stream([LLMMessage(role="user", content="hi")])]
    tool_events = [e for e in events if e.type == EventType.TOOL_USE]
    assert len(tool_events) == 1
    assert tool_events[0].tool_name == "search"
    assert tool_events[0].tool_input == {"q": "新闻"}
```

- [ ] **Step 2: 运行测试,确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v`
Expected: 全部 passed(含本 task 2 个 + 之前所有)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_llm_provider.py
git commit -m "test(infra): RQ-1 补 tool use 测试覆盖(complete 透传 + stream tool 事件)"
```

---

### Task 6: __init__.py 导出 + 手动验证 ARK 链路

**Files:**
- Create: `backend/infra/llm/__init__.py`

- [ ] **Step 1: 新建 __init__.py 导出公共 API**

创建 `backend/infra/llm/__init__.py`:

```python
from .ark import ArkProvider
from .base import (
    CompleteResult,
    EventType,
    LLMMessage,
    LLMProvider,
    StreamEvent,
    ToolDefinition,
)

__all__ = [
    "ArkProvider",
    "LLMProvider",
    "LLMMessage",
    "ToolDefinition",
    "StreamEvent",
    "EventType",
    "CompleteResult",
]
```

- [ ] **Step 2: 跑全量测试,确认无回归**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -q`
Expected: 全绿(现有 4 个 + 新 LLM 测试)

- [ ] **Step 3: 手动验证 ARK 链路(需要真 key,可选但建议)**

确认 `backend/.env` 有 `LLM_API_KEY`(从项目 `.env` 的 `VITE_CLAUDE_API_KEY` 复制 ark-xxx 值过来)。临时脚本验证:

Run:
```bash
cd backend && .venv/Scripts/python.exe -c "
import asyncio
from config import settings
from infra.llm import ArkProvider, LLMMessage

async def main():
    p = ArkProvider(api_key=settings.llm_api_key, base_url=settings.llm_base_url, default_model=settings.llm_model)
    r = await p.complete([LLMMessage(role='user', content='说一句你好')])
    print('COMPLETE:', r.content, r.usage)

asyncio.run(main())
"
```
Expected: 打印 COMPLETE: <ARK 返回的你好文本> + usage 字典。证明后端→ARK 链路通。

> 若无 key 或不想花钱,此步可跳过(单元测试已覆盖逻辑);但建议跑一次证明 SDK + baseURL 配 ARK 可用。

- [ ] **Step 4: Commit**

```bash
git add backend/infra/llm/__init__.py
git commit -m "feat(infra): RQ-1 导出 LLM provider 公共 API + 链路验证"
```

---

## 完成标准(RQ-1 Definition of Done)

- [ ] `backend/infra/llm/` 建立,含 base.py(Protocol)+ ark.py(complete/stream/tool use)
- [ ] 单元测试全绿(respx mock,不联网)
- [ ] 现有 backend 测试无回归
- [ ] 手动验证后端→ARK 链路通(可选但建议)
- [ ] `LLMProvider` 接口稳定,可供 RQ-2(agent runtime)使用

## 后续衔接(RQ-2)

RQ-2 的 agent runtime 会 `from infra.llm import ArkProvider, LLMMessage, ...`,通过 `LLMProvider` 接口调 LLM,不直接碰 ARK/anthropic SDK。provider 接口在 RQ-1 定稳。

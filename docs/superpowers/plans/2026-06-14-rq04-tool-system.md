# RQ-4 工具系统 + Tool Use 循环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** 让 agent 能用工具——完善工具系统(Tool 协议 + ToolRegistry)、实现通用 tool use 循环(BaseAgent)、加 AnysearchTool(联网搜索)、用 research agent 端到端验证(LLM 决定调工具 → 执行 → 结果回灌 → 最终回复)。

**Architecture:** Task 1 扩展 RQ-1 的 provider(LLMMessage.content 支持 str|list 结构化 + CompleteResult 加 tool_calls/stop_reason);Task 2-3 工具系统 + AnysearchTool;Task 4 BaseAgent 通用 tool use 循环(调 provider 传 tools → LLM tool_use → 执行工具 → 结构化回灌 → 循环);Task 5 research_agent 用 BaseAgent + AnysearchTool。

**Tech Stack:** Python / anthropic SDK / pytest + respx(mock)

---

## 前置确认(已确认)

- A1 方案①:RQ-4 聚焦工具系统 + tool use 循环 + AnysearchTool;写操作推 RQ-5
- A2 工具系统 + AnysearchTool,给新 research agent 用,助手暂不加工具
- A3 anysearch key:前端 .env 空,没 key 则 mock 测,代码完整待 key
- A4 BaseAgent 通用 tool use 循环
- B1-B4 默认

## File Structure

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/infra/llm/base.py` | 修改 | LLMMessage.content 支持 str\|list;CompleteResult 加 tool_calls/stop_reason |
| `backend/infra/llm/ark.py` | 修改 | complete 填 tool_calls + stop_reason |
| `backend/runtime/tools/base.py` | 新建 | Tool 协议(input_schema) + 数据类型 |
| `backend/runtime/tools/registry.py` | 新建 | ToolRegistry(register/get) |
| `backend/runtime/tools/__init__.py` | 修改 | 导出 + get_tool |
| `backend/runtime/tools/anysearch.py` | 新建 | AnysearchTool(调 anysearch API) |
| `backend/runtime/base_agent.py` | 新建 | BaseAgent(通用 tool use 循环) |
| `backend/agents/research_agent.py` | 新建 | ResearchAgent(用 BaseAgent + AnysearchTool) |
| `backend/agents/__init__.py` | 修改 | 导入 research_agent |
| `backend/tests/test_tool_system.py` | 新建 | Tool/AnysearchTool 测试 |
| `backend/tests/test_base_agent.py` | 新建 | BaseAgent tool use 循环测试(mock provider) |

---

### Task 1: 扩展 provider 支持 tool use 完整响应

**Files:** Modify `backend/infra/llm/base.py`, `backend/infra/llm/ark.py`; Modify `backend/tests/test_llm_provider.py`(加 tool_use complete 测试)

- [ ] **Step 1: 改 base.py** — `LLMMessage.content` 类型注解改 `str | list`,`CompleteResult` 加两字段:
```python
@dataclass
class LLMMessage:
    role: Role
    content: str | list  # str 或结构化 blocks(tool_use/tool_result)


@dataclass
class CompleteResult:
    content: str
    usage: dict | None = None
    tool_calls: list | None = None   # [{"id","name","input"}]
    stop_reason: str | None = None   # "end_turn" / "tool_use"
```

- [ ] **Step 2: 改 ark.py complete** — 填 tool_calls + stop_reason(替换 complete 末尾的 return):
```python
        response = await self._client.messages.create(**kwargs)
        text_parts = [b.text for b in response.content if b.type == "text"]
        tool_calls = [
            {"id": b.id, "name": b.name, "input": b.input}
            for b in response.content
            if b.type == "tool_use"
        ]
        return CompleteResult(
            content="".join(text_parts),
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            tool_calls=tool_calls or None,
            stop_reason=response.stop_reason,
        )
```

- [ ] **Step 3: 加测试(complete 返回 tool_use)** — test_llm_provider.py 追加:
```python
@respx.mock
async def test_complete_returns_tool_calls(ark_provider):
    respx.post("https://ark.test/v1/messages").mock(
        return_value=httpx.Response(200, json={
            "id": "msg_1", "type": "message", "role": "assistant",
            "content": [
                {"type": "text", "text": "我来搜索"},
                {"type": "tool_use", "id": "tool_1", "name": "search", "input": {"query": "AI"}},
            ],
            "model": "claude-3-5-sonnet-20240620",
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 10, "output_tokens": 8},
        })
    )
    result = await ark_provider.complete(
        [LLMMessage(role="user", content="搜 AI")],
        tools=[ToolDefinition(name="search", description="d", input_schema={"type": "object"})],
    )
    assert result.stop_reason == "tool_use"
    assert result.tool_calls == [{"id": "tool_1", "name": "search", "input": {"query": "AI"}}]
```

- [ ] **Step 4: 跑测试** — `cd "D:/我的个人区间/Projects/context-lab/backend" && .venv/Scripts/python.exe -m pytest tests/test_llm_provider.py -v` → 全 passed(含新 tool_calls + 原有)

- [ ] **Step 5: Commit** — `git add backend/infra/llm/base.py backend/infra/llm/ark.py backend/tests/test_llm_provider.py && git commit -m "feat(infra): RQ-4 provider 支持 tool use 完整响应(tool_calls/stop_reason)"`

---

### Task 2: 工具系统 Tool 协议 + ToolRegistry

**Files:** Create `backend/runtime/tools/base.py`, `backend/runtime/tools/registry.py`; Modify `backend/runtime/tools/__init__.py`; Create `backend/tests/test_tool_system.py`

- [ ] **Step 1: 写测试** — 创建 `backend/tests/test_tool_system.py`:
```python
import pytest
from runtime.tools.base import Tool
from runtime.tools.registry import ToolRegistry, register_tool, get_tool


class _FakeTool:
    name = "fake"
    description = "fake tool"
    input_schema = {"type": "object", "properties": {"x": {"type": "string"}}}
    async def execute(self, **params):
        return f"fake result: {params.get('x')}"


def test_register_and_get_tool():
    register_tool(_FakeTool())
    t = get_tool("fake")
    assert t is not None
    assert t.name == "fake"
    assert get_tool("nonexistent") is None
    # 清理
    from runtime.tools import registry
    registry._TOOL_REGISTRY.pop("fake", None)


async def test_fake_tool_execute():
    t = _FakeTool()
    r = await t.execute(x="hi")
    assert r == "fake result: hi"
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_tool_system.py -v` → FAIL import

- [ ] **Step 3: base.py** — 创建 `backend/runtime/tools/base.py`:
```python
from __future__ import annotations
from typing import Protocol, runtime_checkable


@runtime_checkable
class Tool(Protocol):
    """工具协议。实现 name/description/input_schema + async execute(**params) -> str。"""
    name: str
    description: str
    input_schema: dict

    async def execute(self, **params) -> str: ...
```

- [ ] **Step 4: registry.py** — 创建 `backend/runtime/tools/registry.py`:
```python
from __future__ import annotations
from .base import Tool

_TOOL_REGISTRY: dict[str, Tool] = {}


class ToolRegistry:
    @staticmethod
    def register(tool: Tool) -> Tool:
        _TOOL_REGISTRY[tool.name] = tool
        return tool

    @staticmethod
    def get(name: str) -> Tool | None:
        return _TOOL_REGISTRY.get(name)


def register_tool(tool: Tool) -> Tool:
    return ToolRegistry.register(tool)


def get_tool(name: str) -> Tool | None:
    return ToolRegistry.get(name)
```

- [ ] **Step 5: __init__.py** — 替换 `backend/runtime/tools/__init__.py`(RQ-2 占位)为:
```python
"""工具系统。"""
from .base import Tool
from .registry import ToolRegistry, register_tool, get_tool

__all__ = ["Tool", "ToolRegistry", "register_tool", "get_tool"]
```

- [ ] **Step 6: 确认通过** — Run: `... pytest tests/test_tool_system.py -v` → 2 passed

- [ ] **Step 7: Commit** — `git add backend/runtime/tools backend/tests/test_tool_system.py && git commit -m "feat(runtime): RQ-4 工具系统(Tool 协议 + ToolRegistry)"`

---

### Task 3: AnysearchTool

**Files:** Create `backend/runtime/tools/anysearch.py`; Modify `backend/tests/test_tool_system.py`(加 anysearch 测试)

- [ ] **Step 1: 追加测试(respx mock anysearch API)** — test_tool_system.py 追加:
```python
import httpx
import respx
from runtime.tools.anysearch import AnysearchTool


@respx.mock
async def test_anysearch_tool_calls_api():
    respx.post("https://api.anysearch.com/mcp").mock(
        return_value=httpx.Response(200, json={
            "result": {"content": [{"type": "text", "text": "搜索结果: AI 是..."}]}
        })
    )
    tool = AnysearchTool(api_key="test-key")
    r = await tool.execute(query="AI")
    assert "AI 是" in r


@respx.mock
async def test_anysearch_tool_handles_error():
    respx.post("https://api.anysearch.com/mcp").mock(
        return_value=httpx.Response(500, json={"error": {"message": "boom"}})
    )
    tool = AnysearchTool(api_key="test-key")
    r = await tool.execute(query="AI")
    assert "错误" in r or "boom" in r
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_tool_system.py -v -k anysearch` → FAIL import

- [ ] **Step 3: 实现 anysearch.py** — 创建 `backend/runtime/tools/anysearch.py`:
```python
from __future__ import annotations
import httpx

ANYSEARCH_ENDPOINT = "https://api.anysearch.com/mcp"


class AnysearchTool:
    """联网搜索工具,调 anysearch API(JSON-RPC tools/call)。"""

    name = "anysearch"
    description = "联网搜索工具,支持通用网页搜索和垂直领域。query 必填。"
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "搜索关键词"},
            "domain": {"type": "string"},
            "max_results": {"type": "number"},
        },
        "required": ["query"],
    }

    def __init__(self, api_key: str = "", timeout: int = 15):
        self._api_key = api_key
        self._timeout = timeout

    async def execute(self, **params) -> str:
        query = params.get("query")
        if not query:
            return "搜索必须提供 query 参数"
        payload = {
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": "search", "arguments": params},
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(ANYSEARCH_ENDPOINT, json=payload, headers=headers)
            data = resp.json()
            if resp.status_code >= 400:
                return f"搜索错误 HTTP {resp.status_code}: {data.get('error', {}).get('message', '')}"
            content = data.get("result", {}).get("content", [])
            text_item = next((c for c in content if c.get("type") == "text"), None)
            return text_item["text"] if text_item else str(data.get("result", ""))
        except Exception as e:
            return f"搜索请求错误: {type(e).__name__}: {e}"


# 默认实例注册(从环境读 key)
def _register_default():
    import os
    register_tool(AnysearchTool(api_key=os.environ.get("ANYSEARCH_API_KEY", "")))


_register_default()
```

- [ ] **Step 4: 确认通过** — Run: `... pytest tests/test_tool_system.py -v` → 4 passed

- [ ] **Step 5: Commit** — `git add backend/runtime/tools/anysearch.py backend/tests/test_tool_system.py && git commit -m "feat(tools): RQ-4 AnysearchTool(联网搜索)"`

---

### Task 4: BaseAgent 通用 tool use 循环

**Files:** Create `backend/runtime/base_agent.py`; Create `backend/tests/test_base_agent.py`

- [ ] **Step 1: 写测试(mock provider 模拟 tool_use 循环)** — 创建 `backend/tests/test_base_agent.py`:
```python
import pytest
from unittest.mock import patch, AsyncMock

from runtime.agent import AgentTask
from runtime.events import EventType
from runtime.tools.registry import _TOOL_REGISTRY


class _FakeSearchTool:
    name = "search"
    description = "search"
    input_schema = {"type": "object"}
    async def execute(self, **params):
        return f"结果: {params.get('query')}"


async def test_base_agent_tool_use_loop():
    """模拟:LLM 第1轮要 tool_use,第2轮给最终回复。"""
    from runtime.base_agent import BaseAgent
    from infra.llm.base import CompleteResult, LLMMessage

    class _TestAgent(BaseAgent):
        from runtime.agent import AgentMetadata
        metadata = AgentMetadata(id="_base_test", name="T", description="d", workspace={"type": "chat"})
        tool_names = ["search"]
        system_prompt = "你是测试"

    agent = _TestAgent()
    # 手动注入 fake tool + mock provider
    _TOOL_REGISTRY["search"] = _FakeSearchTool()
    agent._tool_map = {"search": _FakeSearchTool()}

    call_count = [0]
    async def fake_complete(messages, **kw):
        call_count[0] += 1
        if call_count[0] == 1:
            return CompleteResult(content="我搜一下", tool_calls=[{"id":"t1","name":"search","input":{"query":"AI"}}], stop_reason="tool_use", usage={"input_tokens":5,"output_tokens":3})
        return CompleteResult(content="AI 是人工智能", tool_calls=None, stop_reason="end_turn", usage={"input_tokens":8,"output_tokens":5})

    with patch.object(agent, "_provider") as mp:
        mp.complete = fake_complete
        from runtime.events import EventEmitter
        emit = EventEmitter()
        await agent.run(AgentTask(messages=[{"role":"user","content":"什么是AI"}]), emit)

    events = [e async for e in emit]
    types = [e.type for e in events]
    # 应有 TEXT(我搜一下) + TOOL_CALL + TOOL_RESULT + TEXT(AI 是) + DONE
    assert EventType.TOOL_CALL in types
    assert EventType.TOOL_RESULT in types
    assert events[-1].type == EventType.DONE
    _TOOL_REGISTRY.pop("search", None)
    _TOOL_REGISTRY.pop("_base_test", None)
```

- [ ] **Step 2: 确认失败** — Run: `... pytest tests/test_base_agent.py -v` → FAIL import

- [ ] **Step 3: 实现 base_agent.py** — 创建 `backend/runtime/base_agent.py`:
```python
from __future__ import annotations

from infra.llm import ArkProvider
from infra.llm.base import LLMMessage, ToolDefinition
from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.tools import get_tool


class BaseAgent(Agent):
    """通用 agent 基类:LLM + tool use 循环。子类定义 metadata + tool_names + system_prompt。"""

    metadata: AgentMetadata
    tool_names: list[str] = []
    system_prompt: str = ""

    def __init__(self) -> None:
        from config import settings
        self._provider = ArkProvider(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            default_model=settings.llm_model,
        )
        self._tools = [get_tool(n) for n in self.tool_names if get_tool(n)]
        self._tool_defs = [
            ToolDefinition(name=t.name, description=t.description, input_schema=t.input_schema)
            for t in self._tools
        ]
        self._tool_map = {t.name: t for t in self._tools}

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        messages = [LLMMessage(role=m["role"], content=m["content"]) for m in task.messages]
        try:
            for _ in range(5):  # 最多 5 轮 tool use
                result = await self._provider.complete(
                    messages,
                    system=self.system_prompt or None,
                    tools=self._tool_defs or None,
                )
                if result.content:
                    await emit.emit(EventType.TEXT, text=result.content)
                if result.stop_reason == "tool_use" and result.tool_calls:
                    # 回灌 assistant(tool_use blocks)
                    assistant_content = []
                    if result.content:
                        assistant_content.append({"type": "text", "text": result.content})
                    for call in result.tool_calls:
                        assistant_content.append({
                            "type": "tool_use", "id": call["id"],
                            "name": call["name"], "input": call["input"],
                        })
                    messages.append(LLMMessage(role="assistant", content=assistant_content))
                    # 执行每个工具 + 回灌 tool_result
                    for call in result.tool_calls:
                        await emit.emit(EventType.TOOL_CALL, name=call["name"], params=call["input"])
                        tool = self._tool_map.get(call["name"])
                        try:
                            tool_result = await tool.execute(**call["input"]) if tool else f"工具 {call['name']} 不存在"
                        except Exception as e:
                            tool_result = f"工具执行错误: {e}"
                        await emit.emit(EventType.TOOL_RESULT, name=call["name"], result=tool_result)
                        messages.append(LLMMessage(role="user", content=[
                            {"type": "tool_result", "tool_use_id": call["id"], "content": tool_result}
                        ]))
                    continue
                # 无 tool_use,结束
                await emit.emit_done()
                return
            await emit.emit_done()  # 达 max_loops 兜底
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

- [ ] **Step 4: 确认通过** — Run: `... pytest tests/test_base_agent.py -v` → 1 passed

- [ ] **Step 5: Commit** — `git add backend/runtime/base_agent.py backend/tests/test_base_agent.py && git commit -m "feat(runtime): RQ-4 BaseAgent 通用 tool use 循环"`

---

### Task 5: research_agent + 注册

**Files:** Create `backend/agents/research_agent.py`; Modify `backend/agents/__init__.py`; Create `backend/tests/test_research_agent.py`

- [ ] **Step 1: 写测试(注册可见)** — 创建 `backend/tests/test_research_agent.py`:
```python
def test_research_agent_registered():
    import agents
    from runtime.registry import get_agent_class
    assert get_agent_class("research") is not None


def test_research_agent_has_anysearch_tool():
    import agents
    from runtime.registry import create_agent
    agent = create_agent("research")
    assert "anysearch" in agent.tool_names
```

- [ ] **Step 2: 实现 research_agent.py** — 创建 `backend/agents/research_agent.py`:
```python
from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


@register_agent
class ResearchAgent(BaseAgent):
    """研究助手:用 anysearch 联网搜索回答。"""

    metadata = AgentMetadata(
        id="research",
        name="研究助手",
        description="联网搜索回答问题(用 anysearch 工具)",
        workspace={"type": "chat"},
    )
    tool_names = ["anysearch"]
    system_prompt = (
        "你是研究助手。回答用户问题时,如果涉及最新信息/事实/不确定的内容,"
        "用 anysearch 工具搜索,基于搜索结果回答。通用知识可直接答。"
    )
```

- [ ] **Step 3: agents/__init__.py** — 加导入(在 assistant_agent 后):
```python
from . import research_agent  # noqa: F401
```

- [ ] **Step 4: 确认通过** — Run: `... pytest tests/test_research_agent.py tests/test_base_agent.py -v` → passed

- [ ] **Step 5: 全量无回归** — Run: `... pytest -q` → 全绿

- [ ] **Step 6: Commit** — `git add backend/agents/research_agent.py backend/agents/__init__.py backend/tests/test_research_agent.py && git commit -m "feat(agents): RQ-4 ResearchAgent(用 BaseAgent + anysearch)"`

---

### Task 6: 端到端验证

- [ ] **Step 1: 全量测试** — `... pytest -q` → 全绿

- [ ] **Step 2: 端到端 curl research agent(deepseek,需 anysearch key)** — 确认 backend/.env 有 LLM_API_KEY(deepseek):
```bash
curl -s -N --max-time 60 -X POST http://localhost:8000/api/agents/research/run -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"2026年最新的AI模型有哪些"}]}'
```
Expected(有 anysearch key):流式 text + tool_call(anysearch)+ tool_result + 最终回复。
Expected(无 anysearch key):tool_result 是"搜索请求错误:..."或 auth 错(代码正确,真实待 key)。

- [ ] **Step 3: 重启后端**(若 .env 改了) — 若加了 ANYSEARCH_API_KEY,重启 uvicorn

- [ ] **Step 4: 前端验证** — dev server 上选 research agent,问"最新 AI 新闻" → 看工作台:thinking/text/tool_call/tool_result 事件流 + 最终回复(有 key 则真实搜索,无 key 则工具错误但流程跑通)

- [ ] **Step 5: Commit plan** — `git add docs/superpowers/plans/2026-06-14-rq04-tool-system.md && git commit -m "docs: RQ-4 实现计划"`

---

## 完成标准(RQ-4 DoD)

- [ ] provider 支持 tool use 完整响应(tool_calls/stop_reason)
- [ ] 工具系统(Tool 协议 + ToolRegistry)
- [ ] AnysearchTool(调 anysearch API,mock 测通过)
- [ ] BaseAgent 通用 tool use 循环(mock 测通过,验证 TEXT/TOOL_CALL/TOOL_RESULT/DONE 事件序列)
- [ ] ResearchAgent 注册 + 用 BaseAgent
- [ ] 全量测试全绿
- [ ] 端到端:research agent 能跑 tool use 循环(有 key 真实搜索,无 key 流程跑通 + 错误事件)

## 后续衔接(RQ-5)

RQ-5 = 助手写操作(agent 驱动 UI + 平台操作工具 switch_agent/new_conversation + 护栏)。

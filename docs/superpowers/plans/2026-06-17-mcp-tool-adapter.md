# MCP Tool Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `amap-maps` MCP 设置对 BaseAgent 系智能体也生效，第一版支持 assistant / research 调用 AMap adapter tools。

**Architecture:** 扩展 MCP settings 支持范围；新增 AMap 专用 Tool Adapter 实现内部 `Tool` 协议；BaseAgent 初始化时追加当前 agent 可用的 MCP adapter tools；Claude SDK Agent 保持原生 MCP server 注入路径。

**Tech Stack:** Python FastAPI backend, pytest, httpx, React SettingsModal existing API。

---

### Task 1: 扩展 MCP settings 支持 BaseAgent

**Files:**
- Modify: `backend/mcp_settings.py`
- Modify: `backend/tests/test_mcp_settings.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_mcp_settings.py` 增加：

```python
def test_mcp_settings_accepts_base_agent_ids(monkeypatch, tmp_path):
    import mcp_settings as mod
    monkeypatch.setattr(mod, "MCP_SETTINGS_PATH", tmp_path / "mcp-settings.local.json")
    body = mod.save_mcp_settings({
        "servers": {
            "amap-maps": {
                "enabled": True,
                "agentIds": ["claude-sdk", "assistant", "research", "echo", "unknown"],
                "launchMode": "auto",
            }
        }
    })
    assert body["servers"]["amap-maps"]["agentIds"] == ["claude-sdk", "assistant", "research"]
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py::test_mcp_settings_accepts_base_agent_ids -q
```

Expected: FAIL，`assistant` / `research` 被过滤。

- [ ] **Step 3: 最小实现**

在 `backend/mcp_settings.py` 修改：

```python
SUPPORTED_MCP_AGENT_IDS = {"claude-sdk", "assistant", "research"}
```

并把 unsupported reason 改为：

```python
"当前仅 Claude SDK Agent 和 BaseAgent 工具循环支持 MCP" if agent_id not in SUPPORTED_MCP_AGENT_IDS else ""
```

server 级 `unsupportedReason` 改为：

```python
"Echo 等非工具循环智能体暂不支持 MCP"
```

- [ ] **Step 4: 运行测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/mcp_settings.py backend/tests/test_mcp_settings.py
git commit -m "feat(settings): MCP 支持 BaseAgent 关联"
```

---

### Task 2: 新增 AMap MCP Tool Adapter

**Files:**
- Create: `backend/runtime/tools/mcp_amap.py`
- Create: `backend/tests/test_mcp_amap_tools.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_mcp_amap_tools.py`：

```python
import json

import pytest


@pytest.mark.asyncio
async def test_get_amap_tools_for_selected_agent(monkeypatch):
    from runtime.tools import mcp_amap

    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr(mcp_amap, "load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["assistant"], "launchMode": "auto"}}
    })

    tools = mcp_amap.get_mcp_tools_for_agent("assistant")

    assert [tool.name for tool in tools] == [
        "mcp__amap-maps__maps_geo",
        "mcp__amap-maps__maps_weather",
        "mcp__amap-maps__maps_text_search",
    ]


def test_get_amap_tools_returns_empty_when_not_selected(monkeypatch):
    from runtime.tools import mcp_amap

    monkeypatch.setenv("AMAP_MAPS_API_KEY", "fake-key")
    monkeypatch.setattr(mcp_amap, "load_mcp_settings", lambda: {
        "servers": {"amap-maps": {"enabled": True, "agentIds": ["research"], "launchMode": "auto"}}
    })

    assert mcp_amap.get_mcp_tools_for_agent("assistant") == []


@pytest.mark.asyncio
async def test_geo_tool_calls_amap_api(monkeypatch):
    from runtime.tools.mcp_amap import AMapTool

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"status": "1", "geocodes": [{"location": "116.397,39.908"}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            assert url.endswith("/v3/geocode/geo")
            assert params["key"] == "fake-key"
            assert params["address"] == "北京天安门"
            assert params["city"] == "北京"
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", lambda timeout: FakeClient())
    tool = AMapTool(
        name="mcp__amap-maps__maps_geo",
        description="地理编码",
        input_schema={"type": "object", "properties": {}},
        endpoint="/v3/geocode/geo",
        param_names=["address", "city"],
        api_key="fake-key",
    )

    result = await tool.execute(address="北京天安门", city="北京")

    assert json.loads(result)["geocodes"][0]["location"] == "116.397,39.908"
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_amap_tools.py -q
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 最小实现**

创建 `backend/runtime/tools/mcp_amap.py`：

```python
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx

from mcp_settings import AMAP_SECRET_ENV, AMAP_SERVER_ID, load_mcp_settings

AMAP_API_BASE = "https://restapi.amap.com"


@dataclass
class AMapTool:
    name: str
    description: str
    input_schema: dict
    endpoint: str
    param_names: list[str]
    api_key: str

    async def execute(self, **params) -> str:
        query = {name: value for name in self.param_names if (value := params.get(name))}
        query["key"] = self.api_key
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{AMAP_API_BASE}{self.endpoint}", params=query)
                resp.raise_for_status()
                return json.dumps(resp.json(), ensure_ascii=False)
        except Exception as e:
            return f"AMap 工具调用失败: {type(e).__name__}: {e}"


def _geo_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_geo",
        description="将结构化地址转换为经纬度坐标。",
        input_schema={
            "type": "object",
            "properties": {
                "address": {"type": "string"},
                "city": {"type": "string"},
            },
            "required": ["address"],
        },
        endpoint="/v3/geocode/geo",
        param_names=["address", "city"],
        api_key=api_key,
    )


def _weather_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_weather",
        description="根据城市名称或 adcode 查询天气。",
        input_schema={
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
        endpoint="/v3/weather/weatherInfo",
        param_names=["city"],
        api_key=api_key,
    )


def _text_search_tool(api_key: str) -> AMapTool:
    return AMapTool(
        name="mcp__amap-maps__maps_text_search",
        description="根据关键词搜索 POI。",
        input_schema={
            "type": "object",
            "properties": {
                "keywords": {"type": "string"},
                "city": {"type": "string"},
                "types": {"type": "string"},
            },
            "required": ["keywords"],
        },
        endpoint="/v3/place/text",
        param_names=["keywords", "city", "types"],
        api_key=api_key,
    )


def get_mcp_tools_for_agent(agent_id: str) -> list[Any]:
    settings = load_mcp_settings()
    cfg = settings["servers"].get(AMAP_SERVER_ID, {})
    if not cfg.get("enabled", True):
        return []
    if agent_id not in cfg.get("agentIds", []):
        return []
    api_key = os.environ.get(AMAP_SECRET_ENV, "").strip()
    if not api_key:
        return []
    return [_geo_tool(api_key), _weather_tool(api_key), _text_search_tool(api_key)]
```

- [ ] **Step 4: 运行测试**

Run:

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_amap_tools.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/tools/mcp_amap.py backend/tests/test_mcp_amap_tools.py
git commit -m "feat(tools): 添加 AMap MCP Tool Adapter"
```

---

### Task 3: BaseAgent 接入 MCP adapter tools

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/tests/test_base_agent.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_base_agent.py` 增加：

```python
def test_base_agent_appends_mcp_tools(monkeypatch):
    from runtime.base_agent import BaseAgent
    from runtime.agent import AgentMetadata

    class FakeMcpTool:
        name = "mcp__amap-maps__maps_geo"
        description = "地理编码"
        input_schema = {"type": "object", "properties": {}}

        async def execute(self, **params):
            return "{}"

    monkeypatch.setattr("runtime.base_agent.get_mcp_tools_for_agent", lambda agent_id: [FakeMcpTool()] if agent_id == "assistant" else [])

    class TestAgent(BaseAgent):
        metadata = AgentMetadata(id="assistant", name="Assistant", description="", workspace={"type": "chat"}, capabilities=[])
        tool_names = []

    agent = TestAgent()

    assert "mcp__amap-maps__maps_geo" in agent._tool_map
    assert any(t.name == "mcp__amap-maps__maps_geo" for t in agent._tool_defs)
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py::test_base_agent_appends_mcp_tools -q
```

Expected: FAIL，`runtime.base_agent.get_mcp_tools_for_agent` 不存在或未调用。

- [ ] **Step 3: 最小实现**

修改 `backend/runtime/base_agent.py`：

```python
from runtime.tools.mcp_amap import get_mcp_tools_for_agent
```

并替换初始化工具收集：

```python
base_tools = [get_tool(n) for n in self.tool_names if get_tool(n)]
self._tools = base_tools + get_mcp_tools_for_agent(self.metadata.id)
```

- [ ] **Step 4: 运行测试**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py backend/tests/test_mcp_amap_tools.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/base_agent.py backend/tests/test_base_agent.py
git commit -m "feat(agent-runtime): BaseAgent 接入 MCP adapter tools"
```

---

### Task 4: 前端显示与整体验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 后端回归**

Run:

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_mcp_settings.py backend/tests/test_mcp_amap_tools.py backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py backend/tests/test_agents_api.py -q
```

Expected: PASS.

- [ ] **Step 2: 前端验证**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both pass.

- [ ] **Step 3: API smoke**

启动后端后访问 `/api/settings/mcp`，确认 `assistant` / `research` 的 `supportsMcp` 为 true，`echo` 为 false。

- [ ] **Step 4: 更新跟踪矩阵**

在 `项目执行跟踪矩阵.md` 追加 MCP Tool Adapter 第三阶段记录：

```markdown
### 2026-06-17（MCP Tool Adapter）

- 新增需求：让 AMap MCP 设置对 BaseAgent 系智能体生效。
- 规格：`docs/superpowers/specs/2026-06-17-mcp-tool-adapter-design.md`
- 计划：`docs/superpowers/plans/2026-06-17-mcp-tool-adapter.md`
- 执行：settings 支持 assistant/research；新增 AMap MCP Tool Adapter；BaseAgent 初始化追加 MCP tools；Claude SDK 原生 MCP 路径不变。
- 验证：后端相关测试、typecheck、build、settings API smoke。
```

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 MCP Tool Adapter"
```

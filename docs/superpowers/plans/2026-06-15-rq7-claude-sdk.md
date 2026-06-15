# RQ-7 Claude Agent SDK 接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude Agent SDK 作为第二种 agent 范式接入载体平台:新增 `ClaudeSdkAgent`,消费 SDK `query()` 的 message 流并映射成标准事件,前端经现有 `/api/agents/{id}/run` SSE 可选、可跑、可可视化。

**Architecture:** 增量一个 `backend/runtime/claude_sdk_agent.py`(`Agent` 子类 + `@register_agent`),`run()` 调 `claude_agent_sdk.query()`,把 `AssistantMessage`/`ToolResultBlock`/`ResultMessage` 映射成 `EventEmitter` 的 8 类标准事件。工具由 SDK 自主执行(内置 Read/Glob/Grep/Bash/Edit/WebSearch),我们只观察。L4 路由 / L5 应用库 / L6 可视化零改动(事件格式已统一)。

**Tech Stack:** Python 3.10+ / `claude-agent-sdk` 0.2.101 / FastAPI 现有 SSE / pytest + pytest-asyncio(auto mode)+ unittest.mock

**关键约束(来自 spec `2026-06-15-rq7-claude-sdk-design.md`):**
- 权限 `permission_mode="bypassPermissions"`;cwd = `backend/sandbox/`(绝对路径);`setting_sources=[]`(不加载 `~/.claude`,避免污染+省 token)
- Provider 不显式配,SDK 自动读 `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`(uvicorn 进程需继承,本地 shell 已有)
- mock 策略:`patch("runtime.claude_sdk_agent.query", new=fake_query)`,fake_query 是 async generator 产出假 message;不真连网络
- `.venv` 已装 `claude-agent-sdk`(starlette 依赖冲突本地已钉 0.38.6 接受)

---

### Task 1: 创建沙箱目录 + 示例文件

**Files:**
- Create: `backend/sandbox/README.md`

agent 的 cwd,提供可被 Read/Edit/Bash 操作的示例。

- [ ] **Step 1: 创建沙箱目录 README**

`backend/sandbox/README.md`:

```markdown
# Claude SDK Agent 沙箱

这是 `claude-sdk` agent 的默认工作目录(cwd)。agent 用内置工具(Read/Glob/Grep/Bash/Edit/WebSearch)在此目录内操作。

- `sample.py` 是 agent 可以阅读/修改/运行的示例文件。
- agent 产出的文件也落在这里。

注意:Bash 理论可 `cd ..` 逃逸(已知风险,v1 本地优先接受)。
```

- [ ] **Step 2: 创建示例代码文件**

`backend/sandbox/sample.py`:

```python
def greet(name):
    return f"hello, {name}"


if __name__ == "__main__":
    print(greet("world"))
```

- [ ] **Step 3: Commit**

```bash
git add backend/sandbox/README.md backend/sandbox/sample.py
git commit -m "feat(rq7): 新增 claude-sdk agent 沙箱目录 + 示例文件"
```

---

### Task 2: ClaudeSdkAgent 骨架 + 注册

建立 `Agent` 子类、metadata、注册进应用库。`run` 暂留占位,后续 task 填充。

**Files:**
- Create: `backend/runtime/claude_sdk_agent.py`
- Create: `backend/tests/test_claude_sdk_agent.py`
- Modify: `backend/agents/__init__.py`(确保导入触发注册)

- [ ] **Step 1: 写失败测试 —— 注册 + metadata**

`backend/tests/test_claude_sdk_agent.py`:

```python
import pytest

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
    assert m.workspace == {"type": "chat"}
    assert m.capabilities  # 非空,声明能力
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: FAIL —— `get_agent_class("claude-sdk")` 返回 None(ModuleNotFoundError 或 registry 无此项)

- [ ] **Step 3: 实现 agent 骨架**

`backend/runtime/claude_sdk_agent.py`:

```python
from __future__ import annotations

from pathlib import Path

from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage,
)

from runtime.agent import Agent, AgentMetadata, AgentTask
from runtime.events import EventEmitter, EventType
from runtime.registry import register_agent

# backend/sandbox 绝对路径(cwd 用)
_SANDBOX_DIR = str((Path(__file__).resolve().parent.parent / "sandbox"))

# coding agent 允许的内置工具清单
_ALLOWED_TOOLS = ["Read", "Glob", "Grep", "Bash", "Edit", "WebSearch"]

_DEFAULT_SYSTEM_PROMPT = (
    "你是一个运行在 context-lab 沙箱目录里的 coding 助手。"
    "可以用 Read/Glob/Grep 读文件、Bash 跑命令、Edit 改文件、WebSearch 搜索。"
    "操作请限制在当前工作目录。"
)


@register_agent
class ClaudeSdkAgent(Agent):
    """第二种 agent 范式:由 Claude Agent SDK 自主跑工具循环,adapter 只映射事件。"""

    metadata = AgentMetadata(
        id="claude-sdk",
        name="Claude SDK Agent",
        description="Claude Agent SDK 驱动的 coding agent(自主工具循环,内置 Read/Edit/Bash...)",
        workspace={"type": "chat"},
        capabilities=["tool_use", "code_edit", "web_search"],
    )

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        raise NotImplementedError("Task 3 实现")
```

- [ ] **Step 4: 确保 agents 包导入触发注册**

现有 `backend/agents/__init__.py` 用显式 `from . import` 逐个导入触发注册。`claude_sdk_agent` 在 `runtime` 包(非 `agents` 包),追加一行绝对导入:

`backend/agents/__init__.py`:

```python
"""agents 实现层(L3)。导入此包触发各 agent 注册。"""
from . import echo_agent  # noqa: F401  触发 @register_agent
from . import assistant_agent  # noqa: F401
from . import research_agent  # noqa: F401
from runtime import claude_sdk_agent  # noqa: F401  RQ-7:第二种 agent 范式
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS(2 个测试)

- [ ] **Step 6: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py backend/agents/__init__.py
git commit -m "feat(rq7): ClaudeSdkAgent 骨架 + 注册(metadata,run 待实现)"
```

---

### Task 3: run 核心成功路径(query 调用 + options + TEXT/DONE/TOKEN_USAGE)

实现 `run()` 骨架:构造 `ClaudeAgentOptions`、调 `query()`、映射 `TextBlock → TEXT`、`ResultMessage(success) → DONE + TOKEN_USAGE`。mock query 不连网络。

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`(实现 `run`)
- Modify: `backend/tests/test_claude_sdk_agent.py`(加测试)

- [ ] **Step 1: 写失败测试 —— TEXT + DONE + TOKEN_USAGE 映射**

追加到 `backend/tests/test_claude_sdk_agent.py`:

```python
from unittest.mock import patch
from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage


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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_maps_text_done_token_usage -v`
Expected: FAIL —— `NotImplementedError`(run 还是占位)

- [ ] **Step 3: 实现 run(成功路径)**

替换 `claude_sdk_agent.py` 里 `run` 方法(删 `raise NotImplementedError`,改为):

```python
    def _build_options(self, task: AgentTask) -> ClaudeAgentOptions:
        return ClaudeAgentOptions(
            permission_mode="bypassPermissions",
            cwd=_SANDBOX_DIR,
            setting_sources=[],
            allowed_tools=list(_ALLOWED_TOOLS),
            system_prompt=task.system or _DEFAULT_SYSTEM_PROMPT,
        )

    @staticmethod
    def _messages_to_prompt(messages: list[dict]) -> str:
        return "\n".join(
            str(m.get("content", ""))
            for m in messages
            if m.get("role") == "user"
        ) or " "

    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        prompt = self._messages_to_prompt(task.messages)
        options = self._build_options(task)
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        await emit.emit(EventType.TEXT, text=block.text)
                if getattr(message, "error", None):
                    await emit.emit_error(f"assistant error: {message.error}")
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_maps_text_done_token_usage -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(rq7): ClaudeSdkAgent run 成功路径(TEXT/DONE/TOKEN_USAGE 映射)"
```

---

### Task 4: THINKING / TOOL_CALL / TOOL_RESULT 映射

补全其余 block 映射:`ThinkingBlock → THINKING`、`ToolUseBlock → TOOL_CALL`、`ToolResultBlock → TOOL_RESULT`。

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写失败测试 —— 工具与思考 block**

追加到 `backend/tests/test_claude_sdk_agent.py`(顶部 import 区补 `ThinkingBlock, ToolUseBlock, ToolResultBlock`):

```python
from claude_agent_sdk import ThinkingBlock, ToolUseBlock, ToolResultBlock


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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_maps_thinking_tool_call_tool_result -v`
Expected: FAIL —— THINKING/TOOL_CALL/TOOL_RESULT 不在 types 里(还没映射)

- [ ] **Step 3: 实现三种 block 映射**

在 `run` 的 `for block in message.content:` 循环里追加(在 TextBlock 分支后):

```python
                    elif isinstance(block, ThinkingBlock):
                        await emit.emit(EventType.THINKING, thinking=block.thinking)
                    elif isinstance(block, ToolUseBlock):
                        await emit.emit(
                            EventType.TOOL_CALL,
                            name=block.name,
                            params=block.input,
                        )
```

`ToolResultBlock` 不在 `AssistantMessage.content` 的遍历里单独处理 —— SDK 把它作为独立 message 产出(见 fake_query)。在 `run` 的 message 分支里,`AssistantMessage` 分支后追加:

```python
            elif isinstance(message, ToolResultBlock):
                content = message.content
                if isinstance(content, list):
                    content = " ".join(
                        b.get("text", "") for b in content
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                await emit.emit(
                    EventType.TOOL_RESULT,
                    name="",  # SDK ToolResultBlock 无 name,按 id 关联(前端按顺序)
                    result=str(content) if content is not None else "",
                )
```

> 注:实测 SDK 把 `ToolResultBlock` 既可能嵌在 `AssistantMessage.content` 也可能独立 yield。为稳妥,`AssistantMessage` 内遍历时也兼容:在 content 循环里加 `elif isinstance(block, ToolResultBlock)` 同样 emit TOOL_RESULT(用上面的 content 提取逻辑)。避免漏。把 ToolResultBlock 处理抽成一个本地函数 `_emit_tool_result(block, emit)` 复用两处。

最终 `run` 结构(message 循环内):

```python
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
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
                # ...(同 Task 3)
```

新增辅助方法:

```python
    @staticmethod
    async def _emit_tool_result(block, emit: EventEmitter) -> None:
        content = block.content
        if isinstance(content, list):
            content = " ".join(
                b.get("text", "") for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            )
        await emit.emit(EventType.TOOL_RESULT, name="", result=str(content) if content else "")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS(全部 claude_sdk 测试)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(rq7): THINKING/TOOL_CALL/TOOL_RESULT 映射"
```

---

### Task 5: 错误处理(query 异常 + ResultMessage 错误)

`query` 抛异常时 emit `ERROR`;`AssistantMessage.error` 非空已在上面的 Task 3 处理;这里把整个 run 包进 try/except,并测 `ResultMessage` 非成功 subtype。

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] **Step 1: 写失败测试 —— query 抛异常 + result 错误**

追加到测试文件:

```python
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py::test_run_emits_error_on_query_exception tests/test_claude_sdk_agent.py::test_run_emits_error_on_failed_result -v`
Expected: FAIL —— query 异常未捕获(裸抛),或 error result 没映射成 ERROR

- [ ] **Step 3: 给 run 包 try/except**

把 `run` 主体包进 try/except(在方法最外层):

```python
    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        try:
            prompt = self._messages_to_prompt(task.messages)
            options = self._build_options(task)
            async for message in query(prompt=prompt, options=options):
                # ...(现有映射逻辑)
        except Exception as e:
            await emit.emit_error(f"{type(e).__name__}: {e}")
```

`ResultMessage` 错误分支已在 Task 3 实现(`is_error or subtype != "success"` → emit_error),本 task 的 `test_run_emits_error_on_failed_result` 应直接通过。重点补的是外层 try/except 兜 query 异常。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_claude_sdk_agent.py -v`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/claude_sdk_agent.py backend/tests/test_claude_sdk_agent.py
git commit -m "feat(rq7): run 错误处理(query 异常 + 失败 result → ERROR)"
```

---

### Task 6: 集成测试 —— SSE 端到端

经 `TestClient` 走完整 HTTP/SSE 栈,验证 router → agent → EventEmitter → SSE 接线(mock query)。

**Files:**
- Modify: `backend/tests/test_agents_api.py`(追加)

- [ ] **Step 1: 写集成测试**

追加到 `backend/tests/test_agents_api.py`:

```python
from unittest.mock import patch
from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage


async def _fake_query_for_sse(*, prompt, options=None, transport=None):
    yield AssistantMessage(content=[TextBlock(text="集成PONG")], model="glm-5.2")
    yield ResultMessage(
        subtype="success", duration_ms=1, duration_api_ms=1,
        is_error=False, num_turns=1, session_id="s",
        usage={"input_tokens": 1, "output_tokens": 1},
    )


def test_run_claude_sdk_returns_sse_stream(client):
    import agents
    with patch("runtime.claude_sdk_agent.query", new=_fake_query_for_sse):
        resp = client.post(
            "/api/agents/claude-sdk/run",
            json={"messages": [{"role": "user", "content": "ping"}]},
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")
    body = resp.text
    assert "集成PONG" in body
    assert '"type": "done"' in body or '"done"' in body


def test_list_agents_includes_claude_sdk(client):
    import agents
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    ids = [a["id"] for a in resp.json()]
    assert "claude-sdk" in ids
```

- [ ] **Step 2: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py -v`
Expected: PASS(含新增 2 个;原有 echo 测试不回归)

> 若 `test_run_claude_sdk_returns_sse_stream` 因 TestClient 对 async + SSE 的同步消费报错,改用 `resp.iter_lines()` 或检查 `resp.text` 已含全部 chunk(TestClient 默认同步读完流)。优先用 `resp.text` 断言。

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_agents_api.py
git commit -m "test(rq7): claude-sdk agent SSE 端到端集成测试"
```

---

### Task 7: requirements.txt + 跟踪矩阵 + 全测试回归

固化依赖、记录已知冲突、更新跟踪矩阵、跑全套测试确认无回归。

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: requirements.txt 加 SDK 依赖**

`backend/requirements.txt` 末尾追加:

```
claude-agent-sdk>=0.2.101
```

> 已知冲突:`claude-agent-sdk` 依赖 `mcp` → `sse-starlette>=0.49.1` 与 `fastapi==0.115.0`(`starlette<0.39`)互斥。本地 `.venv` 钉 `starlette==0.38.6`,实测 import + 运行均通过。**不**在 requirements 里钉 starlette(Docker 阶段另行处理:升级 FastAPI 或独立 venv)。在 requirements 下方加注释行说明:

```
# 注:claude-agent-sdk 经 mcp 拉 sse-starlette>=0.49,与 fastapi 0.115 的 starlette<0.39 冲突;
# 本地 .venv 钉 starlette==0.38.6 运行通过。Docker 阶段需升级 fastapi 或独立 venv。
```

- [ ] **Step 2: 跑全套后端测试确认无回归**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -v`
Expected: 全部 PASS(含原有 agent/api/provider/tool 测试 + 新 claude-sdk 测试)。关注 `sse-starlette` 冲突是否在某个 import 链触发运行时错 —— 若有,记录但本地不阻塞(已知风险)。

- [ ] **Step 3: 更新跟踪矩阵**

在 `项目执行跟踪矩阵.md` 时间线末尾(2026-06-15 载体平台条目下)追加 RQ-7 条目,并在需求矩阵表补一行(spec/plan 链接)。示例:

```markdown
### 2026-06-15（续）
- 🆕 新增需求 RQ-7：Claude Agent SDK 接入（第二种 agent 范式）
- 📋 生成规格：RQ-7（`docs/superpowers/specs/2026-06-15-rq7-claude-sdk-design.md`）
- 📝 生成计划：RQ-7（`docs/superpowers/plans/2026-06-15-rq7-claude-sdk.md`，7 Task TDD）
- 🔄 执行任务：RQ-7 T1-T7 完成
  - T1：backend/sandbox 沙箱目录 + 示例
  - T2：ClaudeSdkAgent 骨架 + 注册
  - T3：run 成功路径（TEXT/DONE/TOKEN_USAGE）
  - T4：THINKING/TOOL_CALL/TOOL_RESULT 映射
  - T5：错误处理（query 异常 + 失败 result）
  - T6：SSE 端到端集成测试
  - T7：requirements + 跟踪矩阵 + 全测试
- ✅ 完成需求 RQ-7：Claude Agent SDK 接入
```

(执行后按实际填充,此处为模板。)

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt 项目执行跟踪矩阵.md
git commit -m "chore(rq7): requirements 加 claude-agent-sdk + 跟踪矩阵补录 RQ-7"
```

---

## 验证清单(执行完所有 Task 后)

- [ ] `cd backend && .venv/Scripts/python.exe -m pytest -v` 全绿
- [ ] `npm run typecheck`(若前端无改动可跳过;本需求前端零改动)
- [ ] 手动验证:启动后端 `cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000` + 前端 `npm run dev`,在应用库选 "Claude SDK Agent",发一条消息(如"列出沙箱目录的文件"),确认 ObservabilityBar 展示 TEXT/TOOL_CALL/TOOL_RESULT/TOKEN_USAGE 事件流
- [ ] 确认 `setting_sources=[]` 生效:agent 运行日志/session 不应出现加载 superpowers hooks 的迹象(spike 时观察到的)
- [ ] 不破坏现有:echo/research/assistant agent 仍正常工作

## 已知风险(spec 记录,执行时留意)

1. **starlette 依赖冲突** —— 本地钉 0.38.6 通过;Docker 阶段升级 FastAPI 或独立 venv
2. **bypassPermissions + Bash** —— 沙箱兜底,理论可逃逸,本地接受
3. **内网代理后端 GLM-5.2** —— 非 Claude,工具行为可能差异(教学上作 provider 抽象特性展示)
4. **SDK 运行时依赖** —— spike 跑通(本机 CLI 2.1.170 在);Docker 阶段厘清是否需 CLI

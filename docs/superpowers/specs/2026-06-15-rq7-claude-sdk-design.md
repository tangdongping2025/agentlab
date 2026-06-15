# RQ-7:Claude Agent SDK 接入(第二种 agent 范式)— 规格设计

> 需求编号 RQ-7,属载体平台路线(见 `2026-06-14-agent-carrier-platform-design.md` 后续路线第 1 条:应用库 agent 逐个积累)。

## 需求概述

把 Claude Agent SDK(`claude-agent-sdk` Python 包)作为**第二种 agent 范式**接入载体平台,与现有 BaseAgent(手写 LLM stream + tool 循环)形成对比。SDK 走原生内置工具(Read/Glob/Grep/Bash/Edit…),由 Claude **自主跑工具循环**;我们的 adapter 只消费它产出的 message 流、映射成标准事件。**v1 本地开发机跑通 + 接入应用库,Docker/生产延后。**

## 背景与关键修正(相对原 spec 假设)

原 spec(2026-06-14)把 RQ-7 假设为"第二种 provider 实现,和自实现都走 ARK"。实测 + 读官方 overview 后修正:

- **不是 provider 切换,是 agent 范式不同**:BaseAgent 手写 stream + tool loop;Agent SDK 由 Claude 自主跑工具循环(官方原话:"使用 Client SDK 你实现工具循环;使用 Agent SDK,Claude 处理它")
- **工具不复用**我们的 Python registry(`@register_tool`),用 SDK 内置工具集
- Provider 实际经 `ANTHROPIC_BASE_URL` 内网代理(后端 GLM-5.2),非 ARK、非官方 Anthropic —— 但 Anthropic 格式兼容,SDK 正常工作

## 现状(集成点)

- `Agent` 接口(`runtime/agent.py`):`metadata: AgentMetadata` + `async run(task: AgentTask, emit: EventEmitter)`
- `EventEmitter`(`runtime/events.py`):8 事件 `TEXT/THINKING/TOOL_CALL/TOOL_RESULT/TOKEN_USAGE/ACTION/ERROR/DONE`
- `@register_agent` 装饰器 → `registry` → `/api/agents/{id}/run`(SSE)
- BaseAgent 走 ArkProvider;现有 agent:assistant / research / echo

## spike 实测结论(2026-06-15)

1. `claude-agent-sdk 0.2.101` 装入 `backend/.venv`,`query()` 跑通,走 `ANTHROPIC_BASE_URL=http://10.199.5.25:8080/`,后端 model=`glm-5.2`(Anthropic 格式兼容,响应正常)
2. message 流可映射:`AssistantMessage`(含 `TextBlock`/`ThinkingBlock`/`ToolUseBlock`)、`ToolResultBlock`、`ResultMessage`(含 usage/cost/subtype)
3. **依赖冲突**:SDK 依赖 `mcp` → `sse-starlette 3.4`(要求 `starlette>=0.49`)与现有 `FastAPI 0.115`(要求 `starlette<0.39`)**互斥**。当前钉 `starlette 0.38.6`,实测 `sse_starlette` + FastAPI `main` import + SDK `query()` **均通过**(pip 版本警告存在,运行时不致命)
4. **SDK 默认加载 `~/.claude` 文件系统配置**(spike 触发了 superpowers `SessionStart` hook,Windows PowerShell 下还报错)→ adapter 必须用 `setting_sources=[]` 隔离
5. 不需要官方 `sk-ant-` key,复用 Claude Code CLI 同套 env(`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`)

## 关键决策(brainstorming 确认)

| 决策点 | 选择 |
|---|---|
| 定位 | 第二种 agent 范式,对比教学(BaseAgent 手写 loop vs Agent SDK 自主 loop) |
| 工具 | SDK 内置(Read/Glob/Grep/Bash/Edit/WebSearch…),**不接** anysearch |
| 权限模式 | `bypassPermissions`(无头 SSE 服务无法交互式批准工具调用) |
| 工作目录 | `backend/sandbox/`(沙箱隔离,Read/Edit/Bash 默认在内) |
| Provider | 复用 `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`(uvicorn 进程需继承这两个 env) |
| 配置隔离 | `setting_sources=[]`(不加载 `~/.claude` / 项目 `.claude`,避免污染 + 省 token) |
| 范围 | 本地开发机跑通 + 接入应用库;**Docker/生产延后** |

## 目标架构(增量,复用现有 6 层)

L2 新增 `backend/runtime/claude_sdk_agent.py`:

```python
class ClaudeSdkAgent(Agent):
    metadata = AgentMetadata(id="claude-sdk", name="Claude SDK Agent",
                             description="...", workspace={"type": "chat"})
    async def run(self, task: AgentTask, emit: EventEmitter) -> None:
        # 1. 拼 task.messages → prompt / system
        # 2. 构造 ClaudeAgentOptions(
        #      permission_mode="bypassPermissions",
        #      cwd=<backend/sandbox 绝对路径>,
        #      setting_sources=[],
        #      allowed_tools=["Read","Glob","Grep","Bash","Edit", ...],
        #      system_prompt=...)
        # 3. async for message in query(prompt, options): 映射 → emit
        # 4. ResultMessage.subtype=success → emit_done;is_error/error_* → emit_error
```

- L3:经 `@register_agent` 自动进应用库
- L4 `/api/agents/{id}/run`(SSE)**零改动**
- L5 AgentLibrary 自动列出
- L6 ObservabilityBar / eventAdapter **零改动**(事件格式已统一)

## 事件映射

| SDK message | 我们的 emit |
|---|---|
| `AssistantMessage` + `TextBlock` | `TEXT(text)` |
| `AssistantMessage` + `ThinkingBlock` | `THINKING(thinking)` |
| `AssistantMessage` + `ToolUseBlock` | `TOOL_CALL(name, params)` |
| `ToolResultBlock` | `TOOL_RESULT(name, result)` |
| `ResultMessage.usage` | `TOKEN_USAGE(input_tokens, output_tokens)` |
| `ResultMessage.subtype="success"` | `DONE` |
| `ResultMessage.is_error` / `error_*` | `ERROR` |
| `AssistantMessage.error` 非空 | `ERROR` |
| 其他(SystemMessage/HookEventMessage/RateLimit…) | 忽略(v1) |

> 关键范式差异:工具由 **SDK 自主执行**,我们只观察其 message 流并 emit `TOOL_CALL`/`TOOL_RESULT` —— 不像 BaseAgent 我们自己执行工具。可视化层应体现这一点。

## 配置(env)

- uvicorn 启动需继承 `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`(本地 shell 已有;Docker 阶段需 `-e` 注入)
- `config.py` **无需改**(SDK 不走 ArkProvider,直接读 env)

## 沙箱目录

- `backend/sandbox/`(gitignore),agent 默认 cwd
- 放置示例文件(README / 示例代码)供 agent 操作,演示 Read/Edit/Bash
- **已知风险**:Bash 理论可 `cd ..` 逃逸沙箱;v1 本地优先可接受,后续可用 `PreToolUse` hook 加白名单护栏

## 不破坏现有

- BaseAgent / ArkProvider / FastAPI 路由 / 会话持久化 **零改动**
- 增量:1 个 agent 文件 + 1 个沙箱目录 + `.venv` 加 SDK 依赖
- 依赖冲突本地可接受(Docker 阶段正式处理)

## v1 范围

**做**:
- `claude_sdk_agent.py`(adapter + 事件映射)
- `backend/sandbox/` 沙箱目录 + 示例文件
- 注册进应用库,前端能选 / 能跑 / 能可视化
- 配置隔离(`setting_sources=[]`)
- 测试(adapter 单测:事件映射;集成:端到端 SSE 跑通)

**不做**(后续):
- Docker/生产集成(依赖冲突正式处理、镜像装 SDK + 运行时)
- `PreToolUse` 安全护栏(bash 白名单等)
- 子代理(Agent 工具)、hooks、MCP 接入
- 会话持久化(SDK 自管 session,v1 不落 MySQL)
- 结构化输出 / 流式输入

## 已知风险

1. **依赖冲突**(starlette)—— 本地 OK,Docker 阶段需升级 FastAPI 到兼容 starlette 1.x,或独立 venv 跑 SDK agent
2. **bypassPermissions + Bash** —— 沙箱兜底但不绝对,本地优先可接受
3. **内网代理后端 GLM-5.2** —— 非 Claude,部分工具行为/Claude Code 特性可能差异(教学上作为"provider 抽象"特性展示)
4. **SDK 运行时依赖** —— spike 跑通(本机有 Claude Code CLI 2.1.170);CLI 依赖关系留 Docker 阶段厘清

## 设计理念合规

| 原则 | 检查 |
|---|---|
| 极简 | 一个 adapter 文件 + 沙箱目录,复用现有 6 层 |
| 不破坏 | BaseAgent / FastAPI 零改动,增量 |
| 教学向 | 两种 agent 范式对比(手写 loop vs 委托自主) |
| 可积累 | 加 SDK agent = 加个 `Agent` 子类,符合接口驱动 |

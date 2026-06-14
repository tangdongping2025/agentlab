# 项目重新定位为智能体载体平台（Agent Carrier Platform）— 规格设计

> 需求编号以《项目执行跟踪矩阵.md》为准（推测 RQ-030）。

## 需求概述

将 Context Lab 从「智能体上下文管理实验平台」重新定位为「智能体载体平台」：一个能装载、运行、可视化多种智能体的**教学/理解向**应用。载体定义统一 agent 接口，支持两类实现（参考 hello-agents 的自实现 + Claude Agent SDK），agent 增量积累；UI 常驻一个**助手 agent**，帮用户回答项目疑问、（后续）代为操作平台。**现有 Docker 单镜像全流程部署保持不破坏。**

## 现状

- 前端 React + TS + Vite + Tailwind + Zustand；后端 Python FastAPI + SQLAlchemy；MySQL（my-mysql:3306，context_lab 库）
- 前端 `agentService.ts`（1100+ 行）：fetch 直调 `/api/anthropic/v1/messages`（火山引擎 ARK 代理），内置 agentic loop + tool use + 4 种上下文策略 + 可视化回调
- 工具：anysearch / anysearch-extract（Vite middleware 转发）
- 可视化资产：TimelineReplay、TokenAllocation、StrategyEffectCard、StepDetailPanel 等
- 部署：单镜像（nginx + uvicorn via supervisord），Watchtower 60s 轮询自动升级；nginx 反代 `/`（静态）、`/api/anthropic`（LLM）、`/api/db`（后端）
- 会话持久化：MySQL（sessions + messages 表，全文搜索）

## 关键决策（brainstorming 确认）

| 决策点 | 选择 |
|--------|------|
| 定位 | 教学/理解向（透明可观察的 agent 应用库） |
| 形态 | Agent 应用库 / 按需调用（透明可观察融合） |
| agent 实现 | 后端 Python，参考 hello-agents 逐个重做积累（非引用） |
| 知识库定位 | 开发参考（AI与技术目录），非运行时层 |
| 运行时野心 | 半通用：统一 agent 接口，增量积累 |
| 实现方式 | 支持两种：自实现 + Claude Agent SDK |
| Provider | Claude Agent SDK 兼容性 v1 首个 spike；Managed Agents 放弃 |
| 架构方案 | 方案 B：接口驱动 |
| 助手 agent | 横切元 agent；v1 简版（只读 + 项目疑问，CLAUDE.md 知识源）；后续写操作 + RAG |
| 部署约束 | Docker 单镜像全流程保持不破坏（增量融入） |

## 目标架构：6 层

严格自底向上依赖（上层只调下层；唯一反向是事件流，经事件总线解耦，不算违反分层）。

### L1 基础设施层（Infrastructure）

纯地基，不含任何 agent 逻辑。所有上层通过 `llm/provider` 抽象调 LLM，不直接碰 ARK/Anthropic。

| 模块 | 职责 | 代码位置 |
|---|---|---|
| llm/provider | LLM 调用抽象接口（chat / stream / tool use） | `backend/infra/llm/base.py` 新增 |
| llm/ark_provider | ARK（Anthropic 格式）实现，复用现有 agentService 调用经验 | `backend/infra/llm/ark.py` 新增 |
| llm/anthropic_provider | Anthropic 直连实现（为 Claude SDK spike 预留） | `backend/infra/llm/anthropic.py` 新增 |
| config | env 配置（api key / base url / model / 超时） | `backend/config.py` 现有扩展 |
| database | SQLAlchemy 引擎 + session | `backend/database.py` 现有 |
| logging | 结构化日志 | `backend/infra/logging.py` 新增 |
| errors | 自定义异常 + 通用错误处理 | `backend/infra/errors.py` 新增 |

### L2 Agent 运行时层（载体核心）

| 模块 | 职责 | 代码位置 |
|---|---|---|
| agent | Agent 协议（metadata + run）、AgentMetadata、AgentTask | `backend/runtime/agent.py` 新增 |
| events | 标准事件类型 + EventEmitter + 事件总线 | `backend/runtime/events.py` 新增 |
| registry | agent 注册/发现（id→实例）、元数据查询 | `backend/runtime/registry.py` 新增 |
| base_agent | 自实现 agent 基类（通用 loop：调 LLM + 工具循环 + emit） | `backend/runtime/base_agent.py` 新增 |
| claude_sdk_adapter | Claude Agent SDK 包装成 Agent 接口 | `backend/runtime/claude_sdk_adapter.py` 待 spike |
| tools | 工具注册 / schema / 执行（超时 + 错误）；迁移 anysearch | `backend/runtime/tools/` 新增 |
| executor | agent run 生命周期、并发、取消（abort） | `backend/runtime/executor.py` 新增 |

### L3 Agent 实现层

| 模块 | 职责 | 代码位置 |
|---|---|---|
| assistant_agent | v1 简版助手（只读工具 + 项目疑问，CLAUDE.md 知识源） | `backend/agents/assistant_agent.py` 新增 |
| （后续）react / reflection / principle_explorer / claude_sdk agent | 应用库 agent，逐个积累 | `backend/agents/` 预留 |

### L4 API 网关层

| 模块 | 职责 | 代码位置 |
|---|---|---|
| routers/sessions | 会话 CRUD + 查询 | `backend/routers/sessions.py` 现有 |
| routers/migrate | localStorage 批量导入 | `backend/routers/migrate.py` 现有 |
| routers/agents | `GET /api/agents`、`GET /api/agents/{id}`、`POST /api/agents/{id}/run`（SSE） | `backend/routers/agents.py` 新增 |
| main | FastAPI app，挂载所有 router | `backend/main.py` 现有扩展 |

### L5 前端应用层

| 模块 | 职责 | 代码位置 |
|---|---|---|
| AgentLibrary | agent 列表/选择 UI（应用库形态） | `src/components/AgentLibrary.tsx` 新增 |
| AgentWorkspace | agent 工作台（调用 + 对话） | `src/components/AgentWorkspace.tsx` 新增/复用 |
| AssistantSidebar | 助手侧边栏（右侧，横切） | `src/components/AssistantSidebar.tsx` 新增 |
| agentRuntimeApi | 调 `/api/agents`，订阅 SSE | `src/services/agentRuntimeApi.ts` 新增 |
| stores 扩展 | agent 选择 / 助手状态 / 事件流 | `src/stores/` 扩展 |
| （现有）ChatInteraction / MessageList / ConfigSidebar | v1 暂留（并存过渡，见迁移策略 A） | 现有 |

### L6 观察可视化层

| 模块 | 职责 | 代码位置 |
|---|---|---|
| eventAdapter | 后端 SSE 事件 → 现有可视化组件所需格式 | `src/services/eventAdapter.ts` 新增 |
| 现有可视化组件 | TimelineReplay / TokenAllocation / StrategyEffectCard / StepDetailPanel / MessageBubble | 现有，复用 |

### 数据流

```
用户选 agent
   → [L5 前端] → [L4 API] → [L2 Runtime 定位实现]
                                  ↓
                       [L3 Agent] 跑 loop
                          ├ 调 [L1 LLM provider]
                          └ 用工具
                                  ↓ emit 标准事件
                       [L4 SSE 流] → [L5 前端] → [L6 观察层] 渲染
```

## 部署架构（Docker 全流程保持，增量融入）

**核心约束：不破坏昨天上线的 Docker 单镜像全流程。** 新架构在现有拓扑上增量扩展。

### 拓扑（不变 + 增量）

```
浏览器 → nginx :80
   /*               → 静态 dist/（增量：加 agent 选择 + 助手侧边栏）
   /api/anthropic/* → 反代 ARK/deepseek（不变）
   /api/db/*        → uvicorn :8000（现有：会话持久化）
   /api/agents/*    → uvicorn :8000（新增：agent 调用 + SSE 事件流）
```

- **单进程 uvicorn 承载**：`/api/db` 和 `/api/agents` 挂在同一个 FastAPI app（不同 router）。supervisord 仍只管 nginx + uvicorn 两进程。
- **Watchtower 链路不变**：仍是 ghcr.io 推镜像 → Watchtower 60s 轮询。
- **MySQL 不变**：复用 my-mysql 的 context_lab 库；agent 相关数据（如有）加表，不动现有 sessions/messages。

### 风险点

1. **镜像膨胀**：若引入 Claude Agent SDK，依赖变重。v1 助手是自实现（走 ARK），不引入 SDK；SDK 在 spike 通过后再决定是否进镜像。
2. **uvicorn 阻塞**：agent loop 可能长跑。必须用 async + SSE 流式，不阻塞 `/api/db` 现有请求。
3. **现有功能回归**：会话持久化、历史查询、LLM 代理不能坏。新代码增量，不动现有 router 逻辑。

## v1 范围

**载体骨架（L1 部分 + L2 + L4 + L5 + L6）+ 简版助手 agent（L3）跑通闭环。**

v1 做：
- L1：LLM provider 抽象（先支持 ARK 走 Anthropic 格式，复用现有 agentService 的调用经验）
- L2：Agent 协议 + 注册表 + 事件总线 + 工具注册（迁移 anysearch）
- L3：一个简版助手 agent（只读工具 + 回答项目疑问，知识源 = CLAUDE.md / 项目说明）
- L4：`/api/agents/*` 路由 + SSE 事件流
- L5：助手侧边栏（右侧，横切）+ agent 调用/事件订阅
- L6：适配现有可视化组件，订阅 agent 事件流

v1 不做：
- 应用库里的功能 agent（ReAct / Reflection / 原理探索器）—— 后续逐个积累
- 助手的写操作 + 确认机制 —— v1.1
- Claude Agent SDK agent —— 待 spike，作为第二个 agent
- RAG 知识库 —— 后续助手知识来源
- Managed Agents —— 放弃

## 关键设计点

### 1. L2 Agent 接口规范（待 spec review 细化）

```python
class Agent(Protocol):
    metadata: AgentMetadata  # name, description, capabilities, config_schema, workspace, ui_mode
    async def run(self, task: AgentTask, emit: EventEmitter) -> None: ...
```

`run` 不返回结果，而是通过 `emit` 流式产出标准事件。事件类型（v1 初定）：
- `thinking`（思考内容）
- `tool_call`（工具调用：name + params）
- `tool_result`（工具结果）
- `text`（生成的文本，增量）
- `token_usage`（token 计数）
- `action`（agent 驱动 UI 的动作指令 —— 为助手预留）
- `error` / `done`

### 2. 前后端通信：SSE

agent 调用走 SSE 流式（单向 server→client 推事件）。前端 EventSource 订阅 `/api/agents/{id}/run`。与现有 `/api/db` 的请求-响应式 API 共存。

### 3. 助手 agent v1 能力边界

- 工具：只读/导航类（列出 agent、查看会话、解释功能）—— 具体清单 spec review 定
- 知识源：CLAUDE.md + 项目说明文档（直接喂 system prompt，非 RAG）
- 不做：写操作（创建/删除/切换）、破坏性操作

### 4. 现有 agentService.ts 的迁移策略（待定，spec review）

现有前端 agentService 是"前端直调 LLM + 驱动可视化"。新架构是"后端 agent runtime + 前端订阅事件"。两个选项：
- **A. 并存过渡（倾向）**：v1 新助手走新后端，现有 agentService 暂留（现有功能继续可用），后续逐步迁移
- **B. 直接重构**：v1 把 agentService 重构成"事件订阅层"，一步到位

倾向 A（降低 v1 风险，符合"不破坏现有"约束）。待 review 确认。

### 5. Claude Agent SDK 兼容性 spike

v1 首个技术验证：Claude Agent SDK 能否配 ARK baseURL。
- 兼容 → 两种实现都走 ARK
- 不兼容 → Claude SDK agent 引真 Anthropic API（provider 共存）

spike 结果决定是否引入 SDK 依赖进 Docker 镜像。

### 6. 特殊 agent 的 iframe 降级嵌入（例外口子）

极少数 UI 极特殊、重写成本过高的 agent（如自带复杂 Gradio UI 的），允许 iframe 嵌入作为降级模式。

- agent metadata 加 `ui_mode: "native" | "embedded"` 字段
  - `native`（默认）：走 Context Lab 统一 React UI + L6 可视化
  - `embedded`：agent 提供外部 URL（如 Gradio 应用地址），Context Lab iframe 嵌入；**不享受 L6 可视化**（iframe 隔离）；UI 风格割裂
- 这是例外，不作主流；所有参考重做的 agent 默认 `native`

### 7. 主界面布局与工作区容器模型

- **三栏 + 底部**：左侧应用库 | 中间工作区 | 右侧助手栏 + 底部可视化面板（可折叠）
- **工作区容器**（核心）：中间工作台形态由 agent 的 `workspace.type` 声明决定，不是固定对话窗口
  - `chat` 型：纯对话流（助手、ReAct、Reflection）
  - `tabs` 型：多 tab（原理探索：对话 / 策略配置 / 可视化）
  - Context Lab 控制 UI 框架，agent 只声明形态 + 配置（不自带 UI；自带 UI 的走 `ui_mode: embedded` 降级）
- **左侧栏 = 纯应用库**（agent 卡片 + 类型标签 chat/tabs + 搜索）；不放会话列表
- **新对话** 在工作台标题栏；**会话历史** 走 Header「历史」入口（复用现有 HistoryPage，跨 agent 查询）
- **分屏（多 agent 并排）**：v1 不做，架构预留（工作区容器可扩展 split），作为后续「对比实验」能力

## 后续路线（非 v1）

1. 应用库 agent 逐个积累：ReAct → Reflection → 原理探索器 → Claude SDK agent
2. 助手写操作 + 确认机制（护栏：本地/线上共享同一个 MySQL，误操作风险高）
3. RAG 知识库作为助手知识来源
4. agent 对比实验（同任务跑不同 agent，可视化对比）—— 可选演进

## 现有资产映射（复用度高）

| 现有资产 | 新架构归属 |
|---|---|
| `agentService.ts` LLM 调用逻辑 | L1（provider 抽象参考） |
| `agentService.ts` agentic loop | L2（runtime 参考） |
| 可视化组件（TimelineReplay 等） | L6 直接复用 |
| anysearch 工具 | L2 工具系统 |
| sessions 后端 + MySQL | L4 + L1 |
| Docker 单镜像 + supervisord + nginx | 部署（不变） |

## 沿用现有机制

- Vite proxy（dev）+ nginx 反代（prod）模式
- supervisord 管 nginx + uvicorn
- Watchtower 自动更新
- MySQL context_lab 库
- 前端 Zustand store 模式

## 待定点（spec review 确认）

1. L2 Agent 接口的事件类型最终清单
2. 助手 v1 只读工具的具体清单
3. agentService 迁移策略：并存（A）还是重构（B）
4. Claude Agent SDK spike 时机（v1 并行 or v1 后）
5. 项目知识源：CLAUDE.md 够不够，是否要单独写面向用户的项目说明

## 设计理念合规检查

| 原则 | 检查 |
|------|------|
| 极简 | v1 只做载体骨架 + 一个简版助手；功能 agent / 写操作 / RAG 全部推后 |
| 专注 | 载体职责单一：定义接口、注册、调用、可视化；不混入具体业务 |
| 不破坏 | Docker 单镜像全流程零改动拓扑，只加 `/api/agents` 路由 + 前端增量 |
| 可积累 | 接口驱动（方案 B），加 agent = 加个类，符合"慢慢积累" |
| 教学向 | 每个 agent 是清晰可读的 Python 类；可视化复用现有资产 |

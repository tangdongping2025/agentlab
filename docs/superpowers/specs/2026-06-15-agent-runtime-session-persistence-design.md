# agent runtime 会话持久化(每 agent 累积会话)— 规格设计

> 载体平台路线的功能补全(非 RQ-7~10 的 ReAct/Reflection/RAG,是用户验证 RQ-7 时发现的历史会话覆盖缺口)。

## 需求概述

补全 agent runtime 主界面的会话持久化:每个 workspace agent 一个**累积会话**,落 MySQL,切换 agent 恢复各自历史;HistoryPage 按 agent 筛选 + 颜色标签,且不再显示老界面(`view='chat'`)的会话。

## 现状(缺口)

- **agent runtime**(`view='agentRuntime'`,当前主界面)的对话**纯内存**(`agentRuntimeStore.workspaceByAgent`),刷新丢,HistoryPage 查不到
- **老体系**(`view='chat'`)走 `appStore` → `dbApi` → MySQL,HistoryPage 查的是这个
- `sessions` 表 / `schemas.py` / `dbApi.ts` **全无 agent 字段**
- 两套会话体系割裂:agent runtime 是当前主界面,但对话无持久化

## 关键决策(brainstorming 确认)

| 决策点 | 选择 |
|---|---|
| 会话粒度 | 每 agent 一个累积会话(1 agent = 1 session,不支持多会话) |
| 持久化范围 | 只 workspace agent(echo/research/claude-sdk 等);**assistant 右侧栏不动** |
| 老会话(`agent_id=null`) | HistoryPage **不显示**(过滤);老数据保留,老体系 `view='chat'` 不动 |
| agent 标签 | **颜色区分**(每 agent 一色) |
| message 格式 | 只存 `role + content`;observability(token/events)不持久化 |
| 持久化策略 | 乐观更新内存 + 异步落库(复刻 `appStore` 模式) |

## 数据模型

`sessions` 表加 `agent_id`:

- `agent_id`: String(64), nullable=True,index;null = 老会话(view='chat' 的)
- `session.id` 仍是 uuid(primary key,不变)
- 每 agent 一个 session:**按 `agent_id` 查;没则 create,有则加载**

迁移:已有 sessions(`agent_id=null`,老会话)不动(保留);新 agent runtime 会话带 `agent_id`。加列用 `ALTER TABLE`(部署时手动或 alembic)。

## 后端改动

**models.py** — `SessionModel` 加:
```python
agent_id = Column(String(64), nullable=True, index=True)
```

**schemas.py** — `SessionCreate`/`SessionUpdate`/`SessionOut`/`SessionListItem` 加:
```python
agentId: Optional[str] = None
```

**routers/sessions.py**:
- `create_session`:写 `agent_id=payload.agentId`
- `update_session`:支持更新 `agent_id`(`payload.agentId`)
- `_to_session_out`:返回 `agentId=sess.agent_id`
- `query_sessions`:加 `agent: Optional[str]` 参数,`where agent_id == agent`(不传则不过滤,含 null)
- `SessionListItem` 返回 `agentId`

## 前端改动

**dbApi.ts**:
- `SessionListItem` 加 `agentId?: string`
- `QueryParams` 加 `agent?: string`

**agentRuntimeStore.ts**(核心改造):
- **去掉 `workspaceByAgent` 内存** → 改 MySQL
- 新增 `workspaceSessionId: string | null`(当前 agent 的 session id)
- `selectAgent(id)`:
  - `dbApi.querySessions({ agent: id, size: 1 })` 查该 agent 的 session
  - 没则 `dbApi.createSession({ agentId: id, name: <agent name> })` 创建
  - `workspaceSessionId = session.id`,`workspaceMessages = session.messages.map({role, content})`
- `runWorkspace` onDone:
  - 累积 messages(user + assistant)
  - 乐观更新 `workspaceMessages`(同步)
  - 异步 `dbApi.updateSession(workspaceSessionId, { messages })`(fire-and-forget)
- `resetWorkspace`:`dbApi.updateSession(workspaceSessionId, { messages: [] })` 清空(或删 session 重建)

**HistoryPage.tsx**:
- 筛选加 **agent 下拉**(选项 = `useAgentRuntimeStore.agents`,应用库列表)
- 列表项加 **agent 标签**(颜色 + 名字)
- **过滤老会话**:只显示 `agentId` 不为 null 的(后端 query 传 agent 时天然只该 agent;不传时前端过滤 `agentId` 为空的)
- 颜色:agent id → 颜色映射(预定义调色板,按 id 哈希取色)

## message 格式

agent runtime 的 `ChatMessage`(`{role, content}`)存成 `MessageModel`:
- `role`: user/assistant
- `content`: 文本
- `payload`: 可存 `{}` 或额外(observability 不存)

老体系 `MessageOut` 的丰富字段(tokenUsage/toolsUsed/files/thinkingContent 等)对 agent runtime 不适用 —— agent runtime 只用 role/content,observability 实时聚合不入库。

## 改动面

| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | models.py | SessionModel + agent_id |
| 后端 | schemas.py | 4 个 schema + agentId |
| 后端 | routers/sessions.py | create/query/update/_to_session_out |
| 前端 | dbApi.ts | SessionListItem/QueryParams + agent |
| 前端 | agentRuntimeStore.ts | 持久化逻辑,去 workspaceByAgent |
| 前端 | HistoryPage.tsx | agent 筛选 + 颜色标签 + 过滤老 |
| 迁移 | ALTER TABLE sessions ADD agent_id | 加列(部署手动/alembic) |

## 测试

- **后端**:`create_session` 带 agent_id 落库;`query_sessions` agent 筛选;`SessionOut`/`SessionListItem` 返回 agentId
- **前端**:agentRuntimeStore `selectAgent` 加载/创建 session;`runWorkspace` 落库(updateSession 被调);HistoryPage agent 筛选只显示该 agent

## 不做

- assistant 右侧栏持久化
- 每 agent 多会话(会话列表/管理 UI)
- observability 持久化(token/events)
- 老体系 `view='chat'` 废弃(保留功能,只是历史不显示其会话)
- 老会话数据删除(保留,HistoryPage 过滤即可)

## 设计理念合规

| 原则 | 检查 |
|---|---|
| 极简 | 每 agent 一会话,复刻 appStore 模式,不造新机制 |
| 不破坏 | 老体系/appStore/sessions 现有数据不动,增量加 agent_id |
| 复用 | 持久化走现有 dbApi/sessions 端点,不新建 |
| 对齐 | agent runtime 持久化模式 = 老体系(乐观+异步),消除割裂 |

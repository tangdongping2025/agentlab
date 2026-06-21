# Agent 对话窗口消息分页与窗口化设计

## 背景

长会话上下文压缩已经降低了 Claude SDK Agent 运行时 prompt 过长带来的慢响应和 SSE 超时风险，但 Agent 对话窗口仍会从 MySQL 拉取并渲染完整原始消息。长会话继续增长后，打开会话、切换 Agent、滚动阅读和 React 渲染仍可能变慢。

本需求只优化 Agent 对话窗口，不改历史详情页。MySQL 仍完整保留原始消息；分页只影响前端展示，不影响 Agent 的真实运行上下文。

## 目标

- Agent 对话窗口初始只加载最近 12 条消息。
- 用户向上滚动接近顶部时自动加载更早 12 条消息。
- 加载更早消息后保持当前阅读位置不跳动。
- 用户翻历史时，新回复不强制拉到底部，只显示“有新回复，跳到最新”。
- Agent 运行上下文不依赖前端已加载窗口，而由后端基于 `sessionId` 读取完整历史并套用已有摘要逻辑。
- 任务列表使用全局轻量索引，不因正文分页而只显示当前窗口内任务。

## 非目标

- 不改历史详情页的全量消息展示。
- 不做完整虚拟列表库接入，第一版通过分页窗口减少渲染节点。
- 不改变 MySQL 原始消息的保留策略。
- 不让用户是否加载早期消息影响 Agent 记忆。

## 后端接口设计

### 会话元数据

Agent 对话窗口加载 session 时应避免通过 `getSession` 拉取全量消息。可以复用现有 session 查询返回的元信息，或让 `getSession` 支持不包含 messages 的模式。第一版优先新增明确接口或参数，避免影响历史页。

### 消息分页接口

新增接口：

```http
GET /api/db/sessions/{sessionId}/messages?beforeSeq=&aroundSeq=&limit=12
```

规则：

- `limit` 默认 12，最大值限制为 50。
- 不传 `beforeSeq` / `aroundSeq` 时，返回最新 12 条。
- 传 `beforeSeq` 时，返回 `seq < beforeSeq` 的更早 12 条。
- 传 `aroundSeq` 时，返回包含目标消息附近的一段窗口，用于任务列表跳转。
- 返回消息按 `seq` 升序排列，前端可直接渲染。
- `beforeSeq` 和 `aroundSeq` 不同时使用；若同时传入，返回 400。

响应：

```ts
{
  messages: Array<{
    seq: number;
    role: string;
    content: string;
    timestamp?: string;
    tokenUsage?: { input?: number; output?: number };
  }>;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestSeq: number | null;
  newestSeq: number | null;
  total: number;
}
```

### 增量追加消息接口

当前 `updateSession` 会用前端传入的 `messages` 重建整段历史，这与窗口化冲突。Agent 对话窗口需要改为增量追加：

```http
POST /api/db/sessions/{sessionId}/messages
```

请求：

```ts
{
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    tokenUsage?: { input?: number; output?: number };
  }>;
}
```

规则：

- 只追加新消息，不覆盖已有消息。
- 后端分配连续 `seq`。
- 更新 session 的 `updated_at` 和 `total_tokens`。
- 返回新增消息及最新窗口元信息。

### Agent run 完整上下文

`runAgent` 仍传 `sessionId`，但后端 Claude SDK Agent 不再信任前端传入的窗口消息作为完整上下文。后端在运行前：

1. 根据 `sessionId` 从 MySQL 读取完整原始消息。
2. 合并当前用户新消息，保证本次请求包含最新输入。
3. 调用现有 `build_runtime_context()` 执行摘要/压缩。
4. 将压缩后的 runtime prompt 交给 Claude SDK Agent。

这样正文分页不会改变 Agent 的记忆。

## 前端状态设计

Agent runtime store 增加窗口状态：

```ts
workspaceMessages: ChatMessage[];
workspaceOldestSeq: number | null;
workspaceNewestSeq: number | null;
workspaceHasMoreBefore: boolean;
workspaceHasMoreAfter: boolean;
workspaceLoadingOlder: boolean;
workspaceLoadOlderError: string | null;
workspaceIsAtLatest: boolean;
workspaceHasNewerNotice: boolean;
workspaceTaskIndex: WorkspaceTaskIndexItem[];
```

加载流程：

- `selectAgent` / `resumeWorkspaceSession` 只加载 session 元数据和最新 12 条消息。
- `loadOlderWorkspaceMessages` 使用当前 `workspaceOldestSeq` 请求更早消息，并 prepend 到窗口。
- 正在加载时忽略重复请求。
- 加载失败时保留当前窗口，显示可重试提示。
- `jumpToLatest` 请求最新 12 条或滚到当前最新窗口底部，并恢复自动跟随。

发送消息：

- 如果当前窗口不是最新，先切回最新窗口，再乐观追加用户消息。
- 用户消息通过增量追加接口落库。
- Agent 回复完成后，助手消息追加到窗口并通过增量追加接口落库。
- 不再用窗口消息调用 `updateSession` 覆盖全量历史。

## 对话窗口交互

- 初始显示最近 12 条消息。
- 顶部接近可视区域时自动加载更早 12 条。
- 加载中显示“正在加载更早消息...”。
- 加载失败显示“加载更早消息失败，点击重试”。
- 不足 12 条或没有更早消息时，不强制显示提示；如果用户已经上滑到顶部，可轻量显示“已到达会话开始”。
- 加载更早消息后保持滚动锚点不跳动。
- 用户在底部时，流式回复自动跟随。
- 用户不在底部时，显示“有新回复，跳到最新”，不打断阅读。
- 点击“跳到最新”后滚到底部并恢复自动跟随。

## 任务列表设计

`SessionTaskNavigator` 不再直接从当前 `workspaceMessages` 推导全量任务，否则分页后早期任务会看似消失。

新增轻量任务索引接口：

```http
GET /api/db/sessions/{sessionId}/message-index
```

响应：

```ts
{
  items: Array<{
    messageSeq: number;
    role: 'user' | 'assistant';
    title: string;
    preview: string;
    timestamp?: string;
  }>;
}
```

规则：

- 索引覆盖完整 session。
- 只返回轻量字段，不返回完整大段 content。
- 第一版沿用当前任务导航的提取规则，但提取对象改为全量消息的轻量投影。

点击任务：

1. 如果目标 `messageSeq` 已在当前窗口，直接滚动并高亮。
2. 如果目标未加载，请求 `aroundSeq=messageSeq&limit=12`。
3. 用目标附近窗口替换当前正文窗口。
4. 滚动并高亮目标消息。
5. 显示“跳到最新”，因为当前窗口可能不在最新位置。

这样任务列表看全局，对话正文看窗口。

## 错误处理

- 分页请求失败：顶部显示可重试提示，不清空已加载消息。
- 任务索引请求失败：隐藏任务列表或显示轻量错误，不影响正文对话。
- aroundSeq 不存在：返回 404，前端提示“目标消息不存在或已被删除”。
- 增量追加失败：保留前端乐观消息并显示持久化失败提示；不回退用户已看到的内容。
- Agent run 失败：沿用当前错误消息展示，并通过增量追加接口保存失败消息，方便历史复盘。

## 测试计划

### 后端

- 分页接口默认返回最近 12 条。
- `beforeSeq` 返回更早 12 条，顺序为升序。
- `aroundSeq` 返回包含目标消息的窗口。
- `hasMoreBefore` / `hasMoreAfter` / `oldestSeq` / `newestSeq` / `total` 正确。
- 增量追加接口不会覆盖已有历史，新增消息 seq 连续。
- Agent run 在前端只传窗口消息时，仍基于 `sessionId` 读取完整历史。
- 长会话仍触发已有 `context_compression`。

### 前端 store

- `selectAgent` 初始只加载最近 12 条。
- `loadOlderWorkspaceMessages` prepend 更早消息。
- 重复加载不会并发请求。
- 发送消息时，如果不是最新窗口，会先切到最新窗口。
- `runWorkspace` 不再把窗口消息作为完整上下文来源。
- 增量追加失败会保留乐观消息并记录错误提示。

### 组件

- 顶部加载中、失败重试、到达开始状态正确展示。
- 加载更早消息后滚动位置保持稳定。
- 在底部时流式回复自动跟随。
- 不在底部时显示“有新回复，跳到最新”。
- 任务列表显示全局索引；点击未加载任务会加载 aroundSeq 窗口并高亮。

### 手工验证

- 准备 30 条以上 Agent 会话。
- 打开后只显示最近 12 条。
- 上滑两次能加载更早记录且位置不跳。
- 点击早期任务能跳到对应窗口。
- 发送新消息后不会覆盖旧历史。
- Agent 仍能参考早期历史或触发压缩提示。

# 实现计划:智能体运行状态可见性

## Task 1: 提取并增强 getWorkspaceStatus(TDD)

- 把 `ChatWorkspace.tsx:53` 的 `getWorkspaceStatus` 提取到 `eventAdapter.ts`,签名 `getWorkspaceStatus(events: DisplayEvent[]): string`
- 增补逻辑:
  - 零事件 → `正在启动…`(冷启动,区别于思考)
  - tool_call 且工具为 WebSearch → 从 `detail`(JSON params)解析 query → `🔍 正在搜索「{query}」…`
  - 其余分支保持(thinking/tool_result/Read/Edit/Bash/其他)
- 先写失败测试 `eventAdapter.test.ts`:WebSearch 带 query、零事件、各工具分支
- ChatWorkspace.tsx 删本地函数,改 import

## Task 2: MessageBubble 状态卡片计时 + 动效

- `MessageBubble.tsx:228` runtimeStatus 区块:
  - 加 `useElapsedSeconds`(runtimeStatus 非空期间每秒 tick),显示 `已用 {n}s`
  - 状态文字加省略号呼吸动效(CSS @keyframes 或 inline)
- 不破坏现有 runtimeEvents/error 渲染

## Task 3: 验证 + 部署

- `npm test` + `npm run typecheck`
- 本地 docker 验证「税友」请求:状态卡片显示「正在搜索「税友公司介绍」…  已用 Xs」,有动效
- 重建镜像部署 ECS

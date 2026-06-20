# Assistant 消息内运行状态与工具时间线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each behavior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将龙虾 Agent 本轮运行状态和工具调用时间线放进当前 assistant 消息卡片内。

**Architecture:** 复用 `ChatWorkspace` 已有的 `workspaceEvents` 和 `getWorkspaceStatus`。给 streaming `MessageBubble` 传入运行状态和工具事件，由 `MessageBubble` 在 assistant 卡片顶部与正文下方渲染，只影响当前流式消息。

**Tech Stack:** React + TypeScript + Vitest + Testing Library

---

### Task 1: Streaming assistant 卡片显示本轮状态

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.tsx`

- [ ] 添加测试：龙虾 Agent running + streaming + `tool_call: Bash` 时，assistant 卡片内出现 `龙虾 Agent · 正在执行命令…`，且旧的漂浮状态不再出现。
- [ ] 运行该测试确认失败。
- [ ] 给 `MessageBubble` 增加可选 `runtimeStatus` prop，并在 assistant 卡片顶部渲染。
- [ ] 修改 `ChatWorkspace`，只给 streaming assistant 消息传入 `runtimeStatus`。
- [ ] 重跑测试确认通过。

### Task 2: Streaming assistant 卡片内折叠工具时间线

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.tsx`

- [ ] 添加测试：`workspaceEvents` 包含 `tool_call` 和 `tool_result` 时，streaming assistant 卡片内出现 `工具时间线`、`调用工具: Bash`，详情默认折叠。
- [ ] 运行该测试确认失败。
- [ ] 给 `MessageBubble` 增加可选 `runtimeEvents` prop，只渲染工具相关事件。
- [ ] 使用 `<details>` 默认折叠显示时间线，保留事件详情但不展示 secret。
- [ ] 重跑测试确认通过。

### Task 3: 验证

- [ ] 运行 `npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx --run`。
- [ ] 运行 `npm run typecheck`。
- [ ] 如需交付 UI，启动前后端并请用户在浏览器验证龙虾对话运行态。

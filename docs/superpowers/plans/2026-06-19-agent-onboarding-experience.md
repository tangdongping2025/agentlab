# 智能体新用户体验优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加欢迎引导、产品化错误提示和龙虾 Agent 运行过程状态，让新用户更容易理解智能体正在做什么。

**Architecture:** 只修改前端体验层。`ChatWorkspace` 负责空状态欢迎卡、示例按钮和运行状态条；`agentRuntimeStore` 负责把运行错误转换为用户可读消息。后端 agent 注册、SSE 协议和工具执行逻辑不变。

**Tech Stack:** React 18、TypeScript、Zustand、Vitest、Testing Library。

---

### Task 1: 聊天工作区引导与状态

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`

- [ ] 写失败测试：空对话的 `claude-sdk` 显示 `我是龙虾 Agent` 欢迎语和示例按钮。
- [ ] 写失败测试：点击示例按钮调用 `runWorkspace` 发送示例内容。
- [ ] 写失败测试：`workspaceRunning=true` 且最近事件为 `tool_call` 时显示自然语言过程状态。
- [ ] 实现欢迎卡、示例按钮和单行过程状态条。
- [ ] 运行 `npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx`。

### Task 2: 产品化错误提示

**Files:**
- Modify: `src/stores/agentRuntimeStore.test.ts`
- Modify: `src/stores/agentRuntimeStore.ts`

- [ ] 写失败测试：workspace run 失败时追加的 assistant 消息包含 `智能体执行失败` 和 `技术详情`，不再只是裸 `[错误]`。
- [ ] 实现最小错误格式化函数，并用于 workspace 错误回调。
- [ ] 运行 `npm run test:run -- src/stores/agentRuntimeStore.test.ts`。

### Task 3: 验证和跟踪

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] 运行 `npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx src/stores/agentRuntimeStore.test.ts`。
- [ ] 运行 `npm run typecheck`。
- [ ] 更新跟踪矩阵新增 RQ-063。
- [ ] 重启或刷新本地服务后在浏览器验证空状态、示例按钮、错误提示和运行状态条。
- [ ] 提交 spec/plan、实现和跟踪矩阵。

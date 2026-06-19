# 会话任务选择后自动收缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户点击会话任务列表中的任务后，任务面板自动收起。

**Architecture:** 在 `SessionTaskNavigator` 的任务按钮点击处理中复用现有 `expanded` 状态，跳转后调用 `setExpanded(false)`。不新增组件、不改任务派生逻辑。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: 选择任务后收起面板

**Files:**
- Modify: `src/components/agentRuntime/SessionTaskNavigator.test.tsx`
- Modify: `src/components/agentRuntime/SessionTaskNavigator.tsx`

- [ ] **Step 1: Write failing test**

在 `SessionTaskNavigator.test.tsx` 中新增测试：展开任务列表，点击任务项后断言 `onJumpToMessage` 被调用、面板消失、入口 `aria-expanded=false`。

- [ ] **Step 2: Run focused test**

Run: `npm run test:run -- src/components/agentRuntime/SessionTaskNavigator.test.tsx`

Expected: FAIL，因为当前点击任务后不会收起面板。

- [ ] **Step 3: Implement minimal change**

在任务项 `onClick` 中先调用 `onJumpToMessage(task.messageIndex)`，再调用 `setExpanded(false)`。

- [ ] **Step 4: Verify**

Run: `npm run test:run -- src/components/agentRuntime/SessionTaskNavigator.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/agentRuntime/SessionTaskNavigator.tsx src/components/agentRuntime/SessionTaskNavigator.test.tsx
git commit -m "fix(runtime): 选择任务后收起任务列表"
```

---

## Self-Review

- 覆盖 spec：点击任务、跳转、自动收起、入口保持可见。
- 无占位内容。
- 改动范围只限 `SessionTaskNavigator`。

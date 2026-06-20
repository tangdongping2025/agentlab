# 历史会话详情任务定位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在历史会话详情中增加与对话窗口一致的任务定位入口，方便用户点击任务快速滚到对应历史消息。

**Architecture:** `HistoryPage` 复用 `SessionTaskNavigator`，通过消息 DOM refs 实现 `scrollIntoView`。测试覆盖任务入口、任务列表内容、点击跳转和选中态。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: HistoryPage 任务定位

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [x] **Step 1: Write the failing test**

在 `HistoryPage.test.tsx` 的主 `describe('HistoryPage')` 中新增测试：打开含两条用户消息的历史会话，点击任务入口后应显示两个任务；点击第二个任务后应调用第二条用户消息卡片的 `scrollIntoView`，并在再次展开后看到第二个任务 `aria-current="true"`。

Run: `npm run test:run -- src/components/HistoryPage.test.tsx`
Expected: FAIL，因为历史详情尚未渲染 `SessionTaskNavigator`，也没有消息跳转 refs。

- [x] **Step 2: Implement minimal code**

在 `HistoryPage.tsx` 中：
- import `useRef` 和 `SessionTaskNavigator`。
- 增加 `detailMessageRefs` 与 `activeDetailMessageIndex`。
- `openDetail` 时清空当前定位。
- 在会话信息卡片内、“继续这个上下文”下方渲染 `SessionTaskNavigator`。
- 给每个历史消息卡片绑定 ref。
- 点击任务时调用目标消息的 `scrollIntoView({ behavior: 'smooth', block: 'start' })` 并设置当前定位。

- [x] **Step 3: Verify tests**

Run: `npm run test:run -- src/components/HistoryPage.test.tsx`
Expected: PASS。

Run: `npm run typecheck`
Expected: PASS。

- [x] **Step 4: Update tracking matrix**

在 `项目执行跟踪矩阵.md` 中新增 RQ-068，统计总数 +1、进行中 +1，并记录本需求的规格、计划、实现和验证结果。

- [x] **Step 5: Commit**

Commit message: `feat(runtime): 为历史详情增加任务定位`。
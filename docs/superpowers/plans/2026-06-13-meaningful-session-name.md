# 会话命名改进 实现计划

> **For agentic workers:** 单任务，TDD。

**Goal:** 会话首次有用户消息时，用首条用户消息截断作会话名。

**Spec:** `docs/superpowers/specs/2026-06-13-meaningful-session-name-design.md`

## Task 1: saveCurrentSession 增加首条消息改名

**Files:**
- Modify: `src/stores/appStore.ts`（saveCurrentSession）
- Test: `src/stores/appStore.test.ts`（新建，store 测试目前缺失/过期，本任务新建一个聚焦 saveCurrentSession 改名的测试）

- [ ] **Step 1: 写失败测试** — saveCurrentSession 在首条用户消息时把内存 session.name 改为截断内容，并调用 update 带 name。

- [ ] **Step 2: 跑测试验证失败**

- [ ] **Step 3: 实现** — saveCurrentSession 里：找到当前内存 session；若其 messages 为空且 conversationHistory 有非空首条用户消息，设 name = 首条用户消息 trim 后 slice(0,30)（超长加「…」），乐观更新内存 session.name 和 messages，PUT 带 name。

- [ ] **Step 4: 跑测试验证通过 + typecheck**

- [ ] **Step 5: Commit**

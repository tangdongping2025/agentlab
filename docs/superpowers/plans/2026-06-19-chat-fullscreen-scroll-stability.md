# ChatWorkspace 全屏滚动稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复 ChatWorkspace 切换全屏时消息视口回到会话顶端的问题。

**Architecture:** 在 ChatWorkspace 内部维护普通/全屏两个视口 ref。切换前捕获当前视口滚动快照，目标视口挂载后恢复滚动位置；消息变化时保留现有自动滚到底部行为。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: 修复全屏切换滚动位置

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`

- [x] 写失败测试：普通模式滚动到中间后点击“全屏”，全屏视口不保持 `scrollTop=0`。
- [x] 写失败测试：全屏模式滚动到中间后点击“退出全屏”，普通视口不保持 `scrollTop=0`。
- [x] 实现：为全屏视口增加 ref，切换前记录滚动快照，切换后恢复目标视口。
- [x] 保留：消息新增和流式输出仍自动滚到底部。
- [x] 运行 `npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx`。
- [x] 运行 `npm run typecheck`。
- [x] 更新跟踪矩阵新增 RQ-065。
- [x] 提交 spec/plan、实现和跟踪矩阵。

# 手机模式隐藏左右侧栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机精简模式下隐藏左右侧栏、相邻水平拖拽条、底部观测栏和垂直拖拽条。

**Architecture:** 给 AgentRuntimeView 中左右侧栏包裹节点、水平 ResizeHandle 包裹节点、底部 ObservabilityBar 包裹节点和垂直 ResizeHandle 包裹节点加 `mobile-compact-hidden`，复用已有 CSS/运行时触发逻辑。

**Tech Stack:** React 18、TypeScript、Vitest、CSS media/body class。

---

### Task 1: 标记可隐藏左右 chrome

**Files:**
- Modify: `src/components/agentRuntime/AgentRuntimeView.tsx`
- Test: `src/components/agentRuntime/AgentRuntimeView.test.tsx`

- [ ] Step 1: 添加失败测试，断言左右侧栏、两个水平 resize handle、底部观测栏、垂直 resize handle 的包裹节点有 `mobile-compact-hidden`。
- [ ] Step 2: 运行目标测试确认失败。
- [ ] Step 3: 给相关包裹节点加 class。
- [ ] Step 4: 运行目标测试、typecheck、build。
- [ ] Step 5: 热更新 Docker 静态资源并手机验证。
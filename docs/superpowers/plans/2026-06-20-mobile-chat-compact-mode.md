# 手机窄屏对话窗口精简模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each behavior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机窄屏时隐藏顶部与工作区说明性 chrome，把空间让给对话消息区。

**Architecture:** 给现有 `App` header、`TabsWorkspace` tabbar、`ChatWorkspace` header 添加稳定 className，由 `src/index.css` 的 `@media (max-width: 768px)` 控制隐藏。桌面端不改变现有 inline style 和组件结构。

**Tech Stack:** React + TypeScript + CSS media query + Vitest + Testing Library

---

### Task 1: 为可隐藏区域添加稳定标识

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] 添加测试断言三个区域分别带有 `mobile-compact-hidden` class。
- [ ] 运行测试确认失败。
- [ ] 给 App header、tabbar、ChatWorkspace header 添加该 class。
- [ ] 重跑测试确认通过。

### Task 2: 添加窄屏隐藏 CSS

**Files:**
- Modify: `src/index.css`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] 添加测试读取 `src/index.css`，断言存在 `@media (max-width: 768px)` 和 `.mobile-compact-hidden { display: none`。
- [ ] 运行测试确认失败。
- [ ] 在 `src/index.css` 添加 media query。
- [ ] 重跑目标测试、typecheck、build。

### Task 3: 更新跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] 新增 RQ-075 记录。
- [ ] 记录自动化验证结果与浏览器验收项。

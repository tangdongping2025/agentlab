# 暖白主题可读性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复暖白界面下全局 token 和文件面板文字对比不足的问题。

**Architecture:** 用全局 CSS token 统一浅底深字基础色，再对 `FilesPanel` 做局部字号和背景增强。测试通过读取 CSS 文本与渲染 `FilesPanel` 关键元素样式来锁定可读性要求。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、CSS variables。

---

### Task 1: 全局暖白 token 与文件面板可读性

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/agentRuntime/FilesPanel.tsx`
- Test: `src/components/agentRuntime/WarmThemeReadability.test.tsx`

- [x] **Step 1: Write failing tests**

新增 `WarmThemeReadability.test.tsx`：
- 读取 `src/index.css`，断言全局 token 不再使用暗色 `--bg-surface: #161c2e` / `--text-primary: #e8ecf4`。
- 渲染 `FilesPanel`，mock 文件列表，断言文件列表容器浅色背景、文件名 `fontSize` 为 14px、元信息 `fontSize` 为 12px、路径区域使用 `var(--text-secondary)`。

- [x] **Step 2: Run failing test**

Run: `npm run test:run -- src/components/agentRuntime/WarmThemeReadability.test.tsx`
Expected: FAIL，因为当前 token 和 FilesPanel 样式仍偏暗/偏小。

- [x] **Step 3: Implement minimal code**

- `index.css` 改为暖白 token：浅背景、深文本、暖灰边框。
- `FilesPanel.tsx`：文件列表容器设浅色背景，文件行字号 14px，元信息 12px，路径/空状态/加载状态使用更深文本，预览区改浅底深字。

- [x] **Step 4: Verify**

Run: `npm run test:run -- src/components/agentRuntime/WarmThemeReadability.test.tsx`
Expected: PASS。

Run: `npm run typecheck`
Expected: PASS。

- [x] **Step 5: Update tracking matrix**

新增 RQ-070 并记录验证结果。

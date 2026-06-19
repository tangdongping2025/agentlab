# Assistant 卡片复制纯文本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 assistant 卡片增加适合分享的纯文本复制能力。

**Architecture:** 在 `MessageBubble.tsx` 内新增一个小型 Markdown-to-plain-text 转换函数，仅服务当前组件。操作区保留“复制内容”，新增“复制纯文本”，两者独立状态。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Clipboard writeText。

---

### Task 1: 复制纯文本

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `项目执行跟踪矩阵.md`

- [ ] 更新测试：验证“复制纯文本”按钮展示、`showActions=false` 隐藏、点击后写入去 Markdown 后的纯文本。
- [ ] 更新实现：新增 `toPlainText(content)`，新增 `copyPlainText()` 和按钮文案“复制纯文本 / 已复制纯文本”。
- [ ] 运行 `npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx`。
- [ ] 运行 `npm run typecheck`。
- [ ] 更新跟踪矩阵 RQ-059 说明。
- [ ] 分别提交 spec/plan、实现、矩阵。

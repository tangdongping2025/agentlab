# Assistant 卡片复制内容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用稳定的文本/Markdown 内容复制替代不可用的截图复制。

**Architecture:** 只修改 `MessageBubble` 及其测试，删除截图生成相关状态、ref、Canvas/SVG/ClipboardItem 测试 mock。保留 `navigator.clipboard.writeText(content)`，把按钮文案改为“复制内容”。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Clipboard writeText。

---

### Task 1: 替换截图复制为内容复制

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `项目执行跟踪矩阵.md`

- [ ] 更新测试：期望 assistant 默认显示“复制内容”，点击后写入原始 content；不再出现截图相关按钮和状态。
- [ ] 更新实现：删除 `copyScreenshot`、`screenshotStatus`、`assistantCardRef` 和截图按钮；文本复制按钮文案为“复制内容 / 已复制”。
- [ ] 运行 `npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx`。
- [ ] 运行 `npm run typecheck`。
- [ ] 更新跟踪矩阵说明 RQ-059 已改为复制内容方案。
- [ ] 分别提交 spec/plan、实现、矩阵。

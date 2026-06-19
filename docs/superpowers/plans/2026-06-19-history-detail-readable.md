# 历史会话详情阅读清晰度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让历史会话右侧详情正文真正清晰可读。

**Architecture:** 只改 `HistoryPage` 前端展示。用测试锁定详情栏更宽、消息正文更大更深、行距更舒适。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: 强化会话详情正文阅读体验

**Files:**
- Modify: `src/components/HistoryPage.test.tsx`
- Modify: `src/components/HistoryPage.tsx`
- Modify: `项目执行跟踪矩阵.md`

- [x] 写失败测试：历史详情布局右侧阅读栏 flex 大于左侧列表。
- [x] 写失败测试：详情消息正文正文字号为 16px、行距不低于 1.8、颜色为深色。
- [x] 实现：调整 recovery 主体左右列比例，右侧详情栏优先阅读空间。
- [x] 实现：消息卡片正文提到 16px、lineHeight 1.85、颜色使用深色；标题区更清楚。
- [x] 运行 `npm run test:run -- src/components/HistoryPage.test.tsx`。
- [x] 运行 `npm run typecheck`。
- [x] 更新跟踪矩阵新增 RQ-067。
- [x] 提交 spec/plan、实现和跟踪矩阵。

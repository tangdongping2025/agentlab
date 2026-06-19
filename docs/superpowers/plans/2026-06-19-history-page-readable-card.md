# 历史会话可读性与卡片风格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让历史会话页变成和主对话窗口一致的暖白卡片阅读体验。

**Architecture:** 只改 `HistoryPage` 前端展示。新增本地样式对象和小型渲染 helper，复用现有数据流、查询、恢复、洞察和沉淀库行为。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: 重构历史页视觉层级

**Files:**
- Modify: `src/components/HistoryPage.test.tsx`
- Modify: `src/components/HistoryPage.tsx`

- [x] 写失败测试：历史页根容器使用暖白底色，tab 当前项为蓝色主按钮风格。
- [x] 写失败测试：会话列表项使用卡片背景、圆角、选中项有蓝色边框。
- [x] 写失败测试：会话详情消息以用户/助手卡片呈现，不再是裸文本。
- [x] 实现：抽取页面、卡片、tab、消息卡片样式对象。
- [x] 实现：搜索筛选区、会话列表、详情信息卡、消息详情统一为暖白卡片风格。
- [x] 实现：洞察和沉淀库卡片同步统一视觉，不改行为。
- [x] 运行 `npm run test:run -- src/components/HistoryPage.test.tsx`。
- [x] 运行 `npm run typecheck`。
- [x] 更新跟踪矩阵新增 RQ-066。
- [x] 提交 spec/plan、实现和跟踪矩阵。

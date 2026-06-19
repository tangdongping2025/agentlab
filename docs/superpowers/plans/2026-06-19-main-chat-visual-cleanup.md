# RQ-058 主聊天视觉清理 Implementation Plan

**Goal:** 清理 AgentRuntime 主聊天视觉噪音：隐藏聊天区工具调用流水、改浅色代码块、去掉主界面残留黑色头部/标签。

**Architecture:** 只改前端展示层。`workspaceEvents` 数据继续保留给观测栏，聊天窗口不再渲染事件列表。`CodeBlock` 使用浅色暖白样式。AgentRuntime 小标签避免 `var(--bg-deep)`。

## Task 1: 隐藏聊天窗口工具调用流水

- 修改 `ChatWorkspace.test.tsx` 增加回归：有 `workspaceEvents` 时消息区不渲染事件 label。
- 修改 `ChatWorkspace.tsx` 删除/隐藏 `workspaceEvents` block。
- 运行 `ChatWorkspace.test.tsx`。

## Task 2: 改浅色代码块

- 修改 `CodeBlock.test.tsx` / `YuanbaoWarmTheme.test.tsx` 期望浅色背景。
- 修改 `CodeBlock.tsx`：外框、头部、代码区改为暖白浅色。
- 保留复制按钮行为。

## Task 3: 清理主界面深色标签/头部残留

- 修改 `YuanbaoWarmTheme.test.tsx` 覆盖 AgentLibrary workspace type 标签非黑底。
- 修改 `AgentLibrary.tsx` 中 `var(--bg-deep)` 标签背景为暖白/白色系。

## Task 4: 验证和跟踪

- 运行 focused tests：`ChatWorkspace.test.tsx`、`CodeBlock.test.tsx`、`YuanbaoWarmTheme.test.tsx`、`DefaultWorkbenchMode.test.tsx`、`SessionTaskNavigator.test.tsx`。
- 运行 `npm run typecheck`。
- 更新 `项目执行跟踪矩阵.md` 增加 RQ-058。
- 启动/复用 dev server，等待用户浏览器确认。

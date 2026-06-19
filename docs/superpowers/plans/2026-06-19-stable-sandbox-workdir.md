# 沙箱工作目录稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让 FilesPanel 不再静默改变用户的当前工作目录，只在用户主动操作时更新 cwd。

**Architecture:** 修改前端工作目录决策层。`FilesPanel` 负责显示提示和区分系统恢复/用户主动切换；`filesUtils` 保留路径判定，但不再把空 cwd 自动解析成 rootDir。后端 rootDir、文件 API 和 Claude SDK 默认 sandbox 不变。

**Tech Stack:** React 18、TypeScript、Zustand、Vitest、Testing Library。

---

### Task 1: 修复 FilesPanel cwd 自动兜底

**Files:**
- Modify: `src/components/agentRuntime/filesUtils.test.ts`
- Modify: `src/components/agentRuntime/filesUtils.ts`
- Modify: `src/components/agentRuntime/FilesPanel.tsx`
- Modify: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`

- [x] 写失败测试：`resolveCwdForRoot('', root, null)` 返回空串，不返回 root。
- [x] 写失败测试：FilesPanel 没有 cwd 和记忆时显示重新选择提示，不调用 `setWorkspaceCwd(rootDir)`。
- [x] 写失败测试：当前 cwd 不在 rootDir 下时显示跨环境提示，不调用 `setWorkspaceCwd(rootDir)`。
- [x] 实现：移除空 cwd / 无效 cwd 的静默 rootDir 兜底；只恢复有效 localStorage 记忆。
- [x] 实现：用户主动 switchDir/enterChild/goUp/历史下拉继续调用 `setWorkspaceCwd` 并写历史。
- [x] 运行 `npm run test:run -- src/components/agentRuntime/filesUtils.test.ts src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`。

### Task 2: 验证和跟踪

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [x] 运行 `npm run typecheck`。
- [x] 更新跟踪矩阵新增 RQ-064。
- [x] 浏览器刷新确认 FilesPanel 空 cwd 不自动跳到 rootDir；用户主动切换后保持稳定。
- [x] 提交 spec/plan、实现和跟踪矩阵。

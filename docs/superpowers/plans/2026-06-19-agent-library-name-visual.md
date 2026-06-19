# 应用库智能体名称视觉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升左侧应用库智能体名称可读性，并将 `claude-sdk` 显示名改为 `龙虾 Agent`。

**Architecture:** 前端只在 `AgentLibrary` 中给智能体名称增加局部渐变文字样式。后端只修改 `ClaudeSdkAgent.metadata.name`，不改变 agent id、能力、路由或会话逻辑。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Python FastAPI metadata。

---

### Task 1: 应用库名称视觉与默认名称

**Files:**
- Modify: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`
- Modify: `src/components/agentRuntime/AgentLibrary.tsx`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `src/stores/agentRuntimeStore.test.ts`
- Modify: `项目执行跟踪矩阵.md`

- [ ] 更新测试：断言应用库展开后智能体名称使用蓝紫渐变文字样式。
- [ ] 更新测试：将 `claude-sdk` 默认名称期望从 `Claude SDK Agent` 改为 `龙虾 Agent`。
- [ ] 更新实现：`AgentLibrary` 中智能体名称使用蓝紫渐变文字。
- [ ] 更新实现：`ClaudeSdkAgent.metadata.name` 改为 `龙虾 Agent`。
- [ ] 运行 `npm run test:run -- src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/stores/agentRuntimeStore.test.ts`。
- [ ] 如涉及 Python 测试可用，再运行相关后端 agent metadata 测试；没有专门测试则以前端 store mock 期望覆盖。
- [ ] 运行 `npm run typecheck`。
- [ ] 更新跟踪矩阵，记录本次 UI/命名调整。
- [ ] 分别提交 spec/plan、实现、矩阵。

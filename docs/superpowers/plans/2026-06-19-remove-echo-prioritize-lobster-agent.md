# 移除 Echo 并置顶龙虾 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从默认应用库移除 Echo，并让龙虾 Agent 排在第一位。

**Architecture:** 后端 agent 注册入口决定 `/api/agents` 的可见 agent 和顺序；前端应用库不额外排序，继续按接口顺序展示。修改 `backend/agents/__init__.py` 即可控制默认注册集合和顺序。

**Tech Stack:** Python FastAPI、pytest、React 18、Vitest。

---

### Task 1: 移除 Echo 并调整顺序

**Files:**
- Modify: `backend/tests/test_agents_api.py`
- Modify: `backend/agents/__init__.py`
- Modify: `src/stores/agentRuntimeStore.test.ts`
- Modify: `项目执行跟踪矩阵.md`

- [ ] 更新后端测试：`/api/agents` 第一项是 `claude-sdk`，不包含 `echo`。
- [ ] 更新后端测试：`/api/agents/echo` 返回 404。
- [ ] 更新后端实现：默认注册入口不导入 `echo_agent`，并先导入 `runtime.claude_sdk_agent`。
- [ ] 更新前端 store 测试 mock，避免继续把 Echo 作为默认应用库样例。
- [ ] 运行 `cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py`。
- [ ] 运行 `npm run test:run -- src/stores/agentRuntimeStore.test.ts`。
- [ ] 运行 `npm run typecheck`。
- [ ] 更新跟踪矩阵。
- [ ] 分别提交 spec/plan、实现、矩阵。

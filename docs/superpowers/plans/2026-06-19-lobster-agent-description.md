# 龙虾 Agent 描述文案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将龙虾 Agent 的描述从技术实现文案改为面向用户的行动型能力描述。

**Architecture:** 只修改 `ClaudeSdkAgent.metadata.description` 和对应 API 测试，不改变 agent id、名称、工作区、工具能力或执行逻辑。

**Tech Stack:** Python FastAPI、pytest。

---

### Task 1: 描述文案替换

**Files:**
- Modify: `backend/tests/test_agents_api.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `项目执行跟踪矩阵.md`

- [ ] 更新测试：断言 `/api/agents` 中 `claude-sdk.description` 是 `会使用工具、读写文件、执行命令并观察结果的行动型智能体`。
- [ ] 更新实现：替换 `ClaudeSdkAgent.metadata.description`。
- [ ] 运行 `cd backend && .venv/Scripts/python.exe -m pytest tests/test_agents_api.py`。
- [ ] 更新跟踪矩阵。
- [ ] 分别提交 spec/plan、实现、矩阵。

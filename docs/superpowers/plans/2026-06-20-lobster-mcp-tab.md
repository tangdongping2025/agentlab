# 龙虾 Agent MCP Tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each behavior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在龙虾 Agent 工作区新增 MCP tab，展示当前智能体的 MCP server 和诊断状态。

**Architecture:** 后端 metadata 增加 tab；前端新增 `McpPanel`，复用已有 MCP settings/diagnose API。首版只读，不改 MCP 配置保存逻辑。

**Tech Stack:** FastAPI + React + TypeScript + Vitest + pytest

---

### Task 1: 后端 metadata 暴露 MCP tab

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `backend/tests/test_claude_sdk_agent.py`

- [ ] 修改测试期望 tabs 为 `['对话', '文件', 'Skill', 'MCP']`。
- [ ] 运行相关测试确认失败。
- [ ] 修改 `ClaudeSdkAgent.metadata.workspace.tabs`。
- [ ] 重跑后端 agent 测试。

### Task 2: 前端 MCP Panel

**Files:**
- Create: `src/components/agentRuntime/McpPanel.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Modify/Create: `src/components/agentRuntime/TabsWorkspace.test.tsx`

- [ ] 新增测试：点击 `MCP` tab 后调用 `getMcpSettings()` 与 `diagnoseMcpSettings()`。
- [ ] 测试断言展示高德地图、已分配给龙虾、secret 状态、launchMode 和 selectedCommand。
- [ ] 运行测试确认失败。
- [ ] 实现 `McpPanel` 只读卡片和“刷新诊断”按钮。
- [ ] 在 `TabsWorkspace` 中渲染 `McpPanel`。
- [ ] 重跑前端测试和 typecheck。

### Task 3: 验证与部署

**Files:**
- No source changes expected.

- [ ] 运行后端 MCP/agent 相关测试。
- [ ] 运行前端 MCP tab 测试。
- [ ] 运行 `npm run typecheck` 和 `npm run build`。
- [ ] 本地接口验证 `/api/agents` 包含 `MCP` tab。
- [ ] 同步到 Docker `agentlab` 并重启。
- [ ] 验证 `http://127.0.0.1:8080/api/agents` 包含 `MCP` tab。

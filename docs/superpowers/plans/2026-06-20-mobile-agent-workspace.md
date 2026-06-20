# Agent 工作区移动端适配实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each behavior. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让龙虾 Agent 工作区在 360px 手机宽度下保持 tabs 可切换、Skill/MCP 内容不横向撑破页面。

**Architecture:** 对现有 `TabsWorkspace`、`SkillPanel`、`McpPanel` 做局部 CSS 调整，不改数据流和业务逻辑。

**Tech Stack:** React + TypeScript + Vitest + Testing Library

---

### Task 1: Tab 栏窄屏横向滚动

**Files:**
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.test.tsx`

- [ ] 添加测试断言 tab bar 使用横向滚动并且 tab 不收缩。
- [ ] 运行测试确认失败。
- [ ] 给 tab bar 添加 `overflowX: 'auto'`、`flexShrink: 0`、`minWidth: 'max-content'` 等样式。
- [ ] 重跑测试。

### Task 2: Skill/MCP 卡片窄屏不溢出

**Files:**
- Modify: `src/components/agentRuntime/SkillPanel.tsx`
- Modify: `src/components/agentRuntime/McpPanel.tsx`
- Modify: `src/components/agentRuntime/TabsWorkspace.test.tsx`

- [ ] 添加测试断言面板关键卡片容器包含 `minWidth: 0`、长文本区域支持换行。
- [ ] 运行测试确认失败。
- [ ] 给卡片、标题行、pre 和路径区域补充 `minWidth: 0`、`overflowWrap: 'anywhere'`。
- [ ] 重跑测试和 typecheck。

### Task 3: 构建与 Docker 同步

- [ ] 运行 `npm run test -- src/components/agentRuntime/TabsWorkspace.test.tsx --run`。
- [ ] 运行 `npm run typecheck`。
- [ ] 运行 `npm run build`。
- [ ] 同步到 Docker 并重启 `agentlab`。
- [ ] 验证 Docker 首页和 `/api/agents` 可访问。

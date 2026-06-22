# 设置弹窗精简 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 删 `SettingsModal` 的 MCP/Skill/全局提示词三 tab,保留系统信息 + 模型配置。

**Architecture:** 纯前端改动,只动 `SettingsModal.tsx` + `.test.tsx`。service 层 / 后端接口 / 工作台面板均不动。

**Tech Stack:** React + TypeScript + Vitest(Testing Library)。

---

### Task 1: 删 SettingsModal 三 tab(TDD)

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Test: `src/components/SettingsModal.test.tsx`

- [ ] **Step 1: 改测试(RED)**

在 `src/components/SettingsModal.test.tsx`:

删整块(三个测试 case):
- `it('shows assistant and research as MCP-supported agents', ...)`
- `it('shows Skill tab with supported agents', ...)`
- `it('shows global prompt tab with supported agents', ...)`

删 `beforeEach` 里 `fetchMock.mockImplementation` 中三个分支:
- `if (url === '/api/settings/mcp') ...`
- `if (url === '/api/settings/skills') ...`
- `if (url === '/api/settings/global-prompt') ...`

删顶部的 `let skillSettingsResponse` / `let globalPromptResponse` 声明 + `beforeEach` 里对它们的赋值。

保留 `it('saves model config without rendering the api key back', ...)`。

加一个新测试(验证三 tab 已删,system/agentModels 仍在):

```tsx
it('hides MCP/Skill/globalPrompt tabs, keeps system and agentModels', async () => {
  render(<SettingsModal isOpen onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText('MCP')).not.toBeInTheDocument());
  expect(screen.queryByText('Skill')).not.toBeInTheDocument();
  expect(screen.queryByText('全局提示词')).not.toBeInTheDocument();
  expect(screen.getByText('系统信息')).toBeInTheDocument();
  expect(screen.getByText('模型配置')).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试验证失败**

Run: `npm run test -- SettingsModal.test --run`
Expected: FAIL(新测试:MCP/Skill/全局提示词 tab 当前存在,`queryByText('MCP')` 找得到)

- [ ] **Step 3: 实现(GREEN)**

`src/components/SettingsModal.tsx` 改动:

1. **import(行 4)**:删 `getMcpSettings, saveMcpSettings, diagnoseMcpSettings, getSkillSettings, saveSkillSettings, getGlobalPromptSettings, saveGlobalPromptSettings` + 类型 `McpSettingsResponse, McpDiagnosticResponse, McpLaunchMode, SkillSettingsResponse, GlobalPromptSettingsResponse`;只留 `getAgentModelSettings, saveAgentModelSettings, type AgentModelSettingsResponse`。

2. **tabs 数组(行 29-35)**:删 `{ id: 'mcp', ... }`、`{ id: 'skill', ... }`、`{ id: 'globalPrompt', ... }` 三项,只留 `system` + `agentModels`。

3. **state(行 52-64)**:删 `mcpSettings`/`mcpDraft`/`mcpError`/`mcpSaved`/`mcpDiagnostic`/`skillSettings`/`skillDraft`/`skillError`/`skillSaved`/`globalPromptSettings`/`globalPromptDraft`/`globalPromptError`/`globalPromptSaved` 全部 `useState`。

4. **useEffect(行 90-124)**:删 MCP/Skill/全局提示词三个加载 `useEffect`。

5. **事件函数(行 144-225)**:删 `updateMcpServer`/`saveMcp`/`runMcpDiagnose`/`updateSkill`/`saveSkills`/`saveGlobalPrompt`。

6. **渲染块(行 363-556)**:删 `{activeTab === 'mcp' && (...)}`、`{activeTab === 'skill' && (...)}`、`{activeTab === 'globalPrompt' && (...)}` 三个整块。

7. **clone 函数(行 924-944)**:删 `cloneMcpSettings`/`cloneSkillSettings`/`cloneGlobalPromptSettings`,只留 `cloneAgentModelSettings`。

保留:`noticeStyle`/`buttonStyle`/`inputStyle`/`selectStyle`/`checkboxRowStyle`/`errorStyle`/`SectionTitle`/`InfoRow`(agentModels tab 仍用;若某样式删后无消费者,顺手删——预计 `selectStyle`/`checkboxRowStyle` 会 orphan,一并删)。

- [ ] **Step 4: 跑测试验证通过**

Run: `npm run test -- SettingsModal.test --run`
Expected: 2 passed(`hides tabs` + `saves model config`)

- [ ] **Step 5: typecheck + build 确认无 orphan 报错**

Run: `npm run typecheck && npm run build`
Expected: 通过(确认无 unused import / 未使用变量报错)

- [ ] **Step 6: commit**

```bash
git add src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat(settings): 精简设置弹窗,删 MCP/Skill/全局提示词三 tab"
```

- [ ] **Step 7: 更新跟踪矩阵**

在 `项目执行跟踪矩阵.md` 加一条 2026-06-22 精简记录,commit。

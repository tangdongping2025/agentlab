# Default Workbench Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main interface open directly into a focused Claude SDK chat workbench with collapsed sidebars and a useful default status bar.

**Architecture:** Keep existing component boundaries. Change default local collapsed state in both sidebars, change the store's first-load agent selection rule, and improve the collapsed summary rendering of `ObservabilityBar` without touching backend APIs or expanded observability panels.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library.

---

## File Structure

- Modify: `src/stores/agentRuntimeStore.ts` — prefer `claude-sdk` on first `loadAgents()` when no current agent is selected.
- Modify: `src/stores/agentRuntimeStore.test.ts` — add/adjust store test for default Claude SDK selection.
- Modify: `src/components/agentRuntime/AgentLibrary.tsx` — default collapsed state to true.
- Modify: `src/components/agentRuntime/AssistantSidebar.tsx` — default collapsed state to true.
- Modify: `src/components/agentRuntime/ObservabilityBar.tsx` — improve collapsed default summary with useful information.
- Modify/Create tests as needed for sidebar and status bar defaults.
- Modify: `项目执行跟踪矩阵.md` — add RQ-055 after verification.

## Task 1: Prefer Claude SDK Agent by Default

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Modify: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: Add failing store test**

Add a test proving `loadAgents()` selects `claude-sdk` when present and `currentAgentId` is empty.

Expected test shape:

```ts
it('defaults to claude-sdk agent when available', async () => {
  listAgentsMock.mockResolvedValue([
    { id: 'assistant', name: '项目助手', description: '', workspace: { type: 'chat' }, capabilities: [] },
    { id: 'claude-sdk', name: 'Claude SDK Agent', description: '', workspace: { type: 'chat' }, capabilities: [] },
  ]);
  querySessionsMock.mockResolvedValue({ items: [] });
  createSessionMock.mockResolvedValue({ id: 's1', messages: [] });

  await useAgentRuntimeStore.getState().loadAgents();

  expect(useAgentRuntimeStore.getState().currentAgentId).toBe('claude-sdk');
});
```

Run:

```bash
npm run test:run -- src/stores/agentRuntimeStore.test.ts
```

Expected: FAIL because current logic selects the first agent.

- [ ] **Step 2: Implement default selection**

In `loadAgents()`, replace first-agent default selection with:

```ts
const defaultAgentId = agents.find(agent => agent.id === 'claude-sdk')?.id || agents[0]?.id || null;
const newId = oldId || defaultAgentId;
```

Keep the existing behavior that does not override `oldId`.

- [ ] **Step 3: Run store tests**

Run:

```bash
npm run test:run -- src/stores/agentRuntimeStore.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 1**

Run:

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(runtime): 默认进入 Claude SDK 工作台"
```

## Task 2: Collapse Sidebars by Default

**Files:**
- Modify: `src/components/agentRuntime/AgentLibrary.tsx`
- Modify: `src/components/agentRuntime/AssistantSidebar.tsx`
- Test: existing component tests if present, otherwise add coverage in `src/App.test.tsx` or focused component tests.

- [ ] **Step 1: Add failing tests for collapsed defaults**

Add tests proving:

- `AgentLibrary` initially shows the vertical “应用库” rail instead of the full list.
- `AssistantSidebar` initially shows the vertical “项目助手” rail instead of the input box.

Expected assertions:

```tsx
expect(screen.getByTitle('展开应用库')).toBeInTheDocument();
expect(screen.queryByText('加载中...')).not.toBeInTheDocument();
expect(screen.getByTitle('展开助手')).toBeInTheDocument();
expect(screen.queryByPlaceholderText('问助手...')).not.toBeInTheDocument();
```

Run the focused test command for the file where the tests are added.

Expected: FAIL because both components currently default to expanded.

- [ ] **Step 2: Set sidebars collapsed initially**

In `AgentLibrary.tsx`:

```ts
const [collapsed, setCollapsed] = useState(true);
```

In `AssistantSidebar.tsx`:

```ts
const [collapsed, setCollapsed] = useState(true);
```

Do not remove expand/collapse buttons.

- [ ] **Step 3: Run focused sidebar tests**

Run the same focused test command.

Expected: PASS.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add src/components/agentRuntime/AgentLibrary.tsx src/components/agentRuntime/AssistantSidebar.tsx <test-files>
git commit -m "feat(runtime): 默认收起主界面侧边栏"
```

## Task 3: Useful Default Observability Summary

**Files:**
- Modify: `src/components/agentRuntime/ObservabilityBar.tsx`
- Add/modify focused tests for `ObservabilityBar`.

- [ ] **Step 1: Add failing status bar test**

Add a focused test proving collapsed status bar shows useful default info:

```tsx
expect(screen.getByText(/Claude SDK Agent/)).toBeInTheDocument();
expect(screen.getByText('空闲')).toBeInTheDocument();
expect(screen.getByText('消息 0')).toBeInTheDocument();
expect(screen.getByText(/默认沙箱/)).toBeInTheDocument();
expect(screen.getByText(/等待首次运行/)).toBeInTheDocument();
```

Run the focused test command.

Expected: FAIL because current collapsed summary does not show these labels.

- [ ] **Step 2: Implement useful summary pills**

In `ObservabilityBar.tsx`, derive:

```ts
const messageCount = target === 'workspace' ? workspaceMessages.length : assistantMessages.length;
const capabilityText = agent?.capabilities?.length ? agent.capabilities.slice(0, 4).join(' · ') : '无工具';
const cwdText = workspaceCwd ? workspaceCwd.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : '默认沙箱';
const hasTokenUsage = obs.tokenUsage.input > 0 || obs.tokenUsage.output > 0;
```

Render a compact summary row with labels for `消息`, `能力`, `目录`, and `Token`. Keep target select and expand button.

- [ ] **Step 3: Run focused status bar tests**

Run the focused test command.

Expected: PASS.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add src/components/agentRuntime/ObservabilityBar.tsx <test-files>
git commit -m "feat(runtime): 优化默认状态栏信息密度"
```

## Task 4: Verification and Tracking

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:run -- src/stores/agentRuntimeStore.test.ts <sidebar/statusbar-test-files>
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Update tracking matrix**

Add this row after RQ-054:

```md
| RQ-055 | 主界面默认工作台模式优化 | [`2026-06-19-default-workbench-mode-design.md`](docs/superpowers/specs/2026-06-19-default-workbench-mode-design.md) | [`2026-06-19-default-workbench-mode.md`](docs/superpowers/plans/2026-06-19-default-workbench-mode.md) | ✅ | 🔍 浏览器验收待确认 |
```

Update summary:

```md
- **总数**：53
- **已完成**：47
- **进行中**：6
```

- [ ] **Step 4: Commit tracking update**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录主界面默认工作台模式优化"
```

## Task 5: Browser Verification

**Files:**
- No file changes.

- [ ] **Step 1: Refresh frontend**

Open the running frontend.

Expected:
- Default selected workspace is Claude SDK Agent.
- Left and right sidebars are collapsed rails.
- Middle chat workspace has more width.
- Bottom status bar shows useful default info instead of mostly empty metrics.

- [ ] **Step 2: Expand sidebars and status bar**

Expected:
- Left and right sidebars can still expand.
- Status bar expanded content still shows running steps, token allocation, and strategy effect.

## Self-Review

- Spec coverage: default Claude SDK selection, collapsed sidebars, useful default status bar info, no persistence, no settings, no backend changes are covered.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: file names, selectors, store fields, and commit commands match current code.

# Resume History Session and Hide Legacy Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users continue an agent session from HistoryPage and remove the old scene/sidebar entry from the current app UI.

**Architecture:** Add a focused `resumeWorkspaceSession` action to `agentRuntimeStore` so App can restore a persisted agent session into the active workspace. HistoryPage remains mostly read-only but exposes a callback button for agent sessions. App drops the old `chat` view entry and no longer mounts legacy scene sidebar/modal while keeping old scene code untouched.

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest + React Testing Library.

---

## File Structure

- Modify `src/stores/agentRuntimeStore.ts`: add `resumeWorkspaceSession(session)` action that restores an existing agent session into workspace state.
- Modify `src/stores/agentRuntimeStore.test.ts`: add TDD coverage for restoring session state and appending future messages to the same session.
- Modify `src/components/HistoryPage.tsx`: add optional `onResumeSession` prop and “继续此会话” button for selected agent sessions.
- Modify `src/components/HistoryPage.test.tsx`: add TDD coverage for resume button visibility and callback payload.
- Modify `src/App.tsx`: remove legacy chat view entry/sidebar/modal wiring and connect HistoryPage resume callback to `agentRuntimeStore.resumeWorkspaceSession`.
- Modify `src/App.test.tsx`: update stale app title expectations and add smoke coverage that old chat/scene entry is absent.
- Modify `项目执行跟踪矩阵.md`: add RQ-045 completion entry after implementation validation.

---

### Task 1: Store Resume Existing Agent Session

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Test: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: Write the failing store restore test**

Append this test inside `describe('agentRuntimeStore persistence', () => { ... })` in `src/stores/agentRuntimeStore.test.ts`:

```ts
  it('resumes an existing agent session into the workspace', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 'old-session',
      workspaceMessages: [{ role: 'user', content: 'old' }],
      workspaceStreaming: 'partial',
      workspaceEvents: [{ id: 'evt-1', type: 'text', title: 'text', description: 'partial' } as any],
      workspaceObservability: { steps: [{ id: 'step-1' }], tokenUsage: { input: 1, output: 2 }, strategyEffect: 'changed' } as any,
      workspaceRunning: true,
      workspaceAbortController: new AbortController(),
      workspaceResetToken: { agentId: 'echo', sessionId: 'old-session', messages: [] },
      workspaceCwd: 'D:/old',
      workspaceCwdHistory: ['D:/old'],
    });

    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'research',
      messages: [
        { role: 'user', content: 'hello', timestamp: '2026-06-18T01:00:00' },
        { role: 'assistant', content: 'hi', timestamp: '2026-06-18T01:01:00' },
        { role: 'system', content: 'ignored' },
      ],
    } as any);

    const state = useAgentRuntimeStore.getState();
    expect(state.currentAgentId).toBe('research');
    expect(state.workspaceSessionId).toBe('history-session');
    expect(state.workspaceMessages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
    expect(state.workspaceStreaming).toBe('');
    expect(state.workspaceEvents).toEqual([]);
    expect(state.workspaceObservability).toEqual({ steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null });
    expect(state.workspaceRunning).toBe(false);
    expect(state.workspaceAbortController).toBeNull();
    expect(state.workspaceResetToken).toBeNull();
    expect(state.workspaceCwd).toBeNull();
    expect(state.workspaceCwdHistory).toEqual([]);
  });
```

- [ ] **Step 2: Write the failing same-session append test**

Append this second test in the same describe block:

```ts
  it('persists future workspace messages to the resumed session', async () => {
    runAgentMock.mockImplementation(async (_agentId, _messages, _cwd, onEvent, onDone) => {
      onEvent({ type: 'text', data: { text: 'new answer' } });
      onDone();
    });

    useAgentRuntimeStore.setState({
      agents: [{ id: 'research', name: '研究助手', description: '', workspace: { type: 'chat' }, capabilities: [] }],
    });

    useAgentRuntimeStore.getState().resumeWorkspaceSession({
      id: 'history-session',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello' }],
    } as any);

    await useAgentRuntimeStore.getState().runWorkspace('follow up');

    expect(updateSession).toHaveBeenCalledWith('history-session', {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'user', content: 'follow up' },
        { role: 'assistant', content: 'new answer' },
      ],
    });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts --run
```

Expected: FAIL because `resumeWorkspaceSession` does not exist.

- [ ] **Step 4: Implement store action**

In `src/stores/agentRuntimeStore.ts`, update the `AgentRuntimeState` interface with:

```ts
  resumeWorkspaceSession: (session: { id: string; agentId?: string | null; messages?: Array<{ role: string; content?: string }> }) => void;
```

Add this action before `setWorkspaceCwd`:

```ts
  resumeWorkspaceSession: (session) => {
    if (!session.agentId) return;
    const controller = get().workspaceAbortController;
    controller?.abort();
    set({
      currentAgentId: session.agentId,
      workspaceSessionId: session.id,
      workspaceMessages: (session.messages || [])
        .filter((m): m is { role: 'user' | 'assistant'; content?: string } => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content || '' })),
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceResetToken: null,
      workspaceCwd: null,
      workspaceCwdHistory: [],
    });
  },
```

- [ ] **Step 5: Run store tests**

Run:

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

Do not commit unless explicitly authorized by the user. If authorized later, include:

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(agent-runtime): resume workspace session from history"
```

---

### Task 2: HistoryPage Continue Session Button

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing callback test**

Add this test to `src/components/HistoryPage.test.tsx` inside `describe('HistoryPage', () => { ... })`:

```tsx
  it('calls onResumeSession with selected agent session detail', async () => {
    const onResumeSession = vi.fn();
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '研究会话', agentId: 'research', preview: 'hello', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 's1',
      name: '研究会话',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello', timestamp: '2026-06-18T01:02:00' }],
    } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={onResumeSession} />);
    fireEvent.click(await screen.findByText('研究会话'));
    fireEvent.click(await screen.findByText('继续此会话'));

    expect(onResumeSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 's1',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello', timestamp: '2026-06-18T01:02:00' }],
    }));
  });
```

- [ ] **Step 2: Write failing no-agent hidden test**

Add this test in the same describe block:

```tsx
  it('does not show continue button for sessions without agentId', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 'legacy', name: '旧会话', preview: 'old', totalTokens: 10 }],
      total: 1, page: 1, size: 20,
    });
    mockedGet.mockResolvedValue({
      id: 'legacy',
      name: '旧会话',
      messages: [{ role: 'user', content: 'old' }],
    } as any);

    render(<HistoryPage onBack={() => {}} onResumeSession={vi.fn()} />);
    fireEvent.click(await screen.findByText('旧会话'));

    expect(screen.queryByText('继续此会话')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL because `onResumeSession` prop and button do not exist.

- [ ] **Step 4: Implement prop and detail storage**

In `src/components/HistoryPage.tsx`, change props to:

```ts
interface Props {
  onBack: () => void;
  onResumeSession?: (session: { id: string; agentId?: string | null; messages?: any[] }) => void;
}
```

Change component signature to:

```ts
export default function HistoryPage({ onBack, onResumeSession }: Props) {
```

Change detail state to preserve the full session fields needed by App:

```ts
  const [detail, setDetail] = useState<{ id: string; agentId?: string | null; messages: any[] } | null>(null);
```

Change `openDetail` success assignment to:

```ts
      setDetail({ id: full.id, agentId: full.agentId, messages: full.messages || [] });
```

- [ ] **Step 5: Render continue button**

In the detail panel, before the message map, render:

```tsx
          {selected && detail && detail.agentId && onResumeSession && (
            <button onClick={() => onResumeSession(detail)} style={{ ...inputStyle, marginBottom: '12px' }}>
              继续此会话
            </button>
          )}
```

Keep the existing message rendering unchanged except for being below this button.

- [ ] **Step 6: Run HistoryPage tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

Do not commit unless explicitly authorized by the user. If authorized later, include:

```bash
git add src/components/HistoryPage.tsx src/components/HistoryPage.test.tsx
git commit -m "feat(history): continue agent session"
```

---

### Task 3: App Connects Resume and Hides Legacy Scenes

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Replace stale App tests with current smoke tests**

Replace `src/App.test.tsx` contents with:

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./services/migration', () => ({ migrateIfPending: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./components/agentRuntime/AgentRuntimeView', () => ({ default: () => <div>Agent Runtime View</div> }));
vi.mock('./components/HistoryPage', () => ({ default: () => <div>History Page</div> }));
vi.mock('./components/SettingsModal', () => ({ default: () => null }));

test('renders agent lab title and runtime view by default', () => {
  render(<App />);
  expect(screen.getByText(/AGENT LAB/i)).toBeInTheDocument();
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});

test('does not render legacy chat scene entry by default', () => {
  render(<App />);
  expect(screen.queryByTitle('上下文实验台(老界面)')).not.toBeInTheDocument();
  expect(screen.queryByText('场景')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add failing App resume integration test**

Append this test to `src/App.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react';
import { useAgentRuntimeStore } from './stores/agentRuntimeStore';

vi.mock('./components/HistoryPage', () => ({
  default: ({ onResumeSession }: { onResumeSession?: (session: any) => void }) => (
    <button onClick={() => onResumeSession?.({
      id: 'history-session',
      agentId: 'research',
      messages: [{ role: 'user', content: 'hello' }],
    })}>
      Mock Resume Session
    </button>
  ),
}));

test('resumes selected history session into agent runtime workspace', () => {
  useAgentRuntimeStore.setState({
    currentAgentId: null,
    workspaceSessionId: null,
    workspaceMessages: [],
  });

  render(<App />);
  fireEvent.click(screen.getByTitle('历史会话'));
  fireEvent.click(screen.getByText('Mock Resume Session'));

  const state = useAgentRuntimeStore.getState();
  expect(state.currentAgentId).toBe('research');
  expect(state.workspaceSessionId).toBe('history-session');
  expect(state.workspaceMessages).toEqual([{ role: 'user', content: 'hello' }]);
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});
```

If Vitest rejects duplicate `vi.mock('./components/HistoryPage')`, instead implement one HistoryPage mock at the top that renders both `History Page` and the `Mock Resume Session` button.

- [ ] **Step 3: Run App tests to verify failure**

Run:

```bash
npm run test -- src/App.test.tsx --run
```

Expected: FAIL because App still exposes old chat entry and does not pass `onResumeSession`.

- [ ] **Step 4: Implement App changes**

In `src/App.tsx`:

1. Remove these imports:

```ts
import ConfigSidebar from './components/ConfigSidebar';
import ChatInteraction from './components/ChatInteraction';
import BottomPanel from './components/BottomPanel';
import SceneEditModal from './components/SceneEditModal';
```

2. Add this import:

```ts
import { useAgentRuntimeStore } from './stores/agentRuntimeStore';
```

3. Change the app store destructuring to remove legacy-only fields and actions:

```ts
  const {
    contextSize,
    loadSessions, loadUserConfig,
  } = useAppStore();
```

4. Add store action near state declarations:

```ts
  const resumeWorkspaceSession = useAgentRuntimeStore(s => s.resumeWorkspaceSession);
```

5. Change view state type:

```ts
  const [view, setView] = useState<'history' | 'agentRuntime'>('agentRuntime');
```

6. Remove `sceneEditOpen`, `editingSceneId`, `handleNewChat`, `handleEditScene`, `handleCloseSceneEdit`, and `setSceneEditOpen(false)` from Escape handler.

7. Remove the legacy chat toggle button titled `上下文实验台(老界面)`.

8. Change history button click from:

```tsx
onClick={() => setView(view === 'history' ? 'chat' : 'history')}
```

to:

```tsx
onClick={() => setView(view === 'history' ? 'agentRuntime' : 'history')}
```

9. Remove sidebar rendering:

```tsx
{view !== 'agentRuntime' && <ConfigSidebar onEditScene={handleEditScene} onNewChat={handleNewChat} />}
```

10. Change main `marginLeft` to `0`.

11. Replace the main conditional with:

```tsx
        {view === 'history' ? (
          <HistoryPage
            onBack={() => setView('agentRuntime')}
            onResumeSession={(session) => {
              resumeWorkspaceSession(session);
              setView('agentRuntime');
            }}
          />
        ) : (
          <AgentRuntimeView />
        )}
```

12. Remove `SceneEditModal` render.

- [ ] **Step 5: Run App tests**

Run:

```bash
npm run test -- src/App.test.tsx --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

Do not commit unless explicitly authorized by the user. If authorized later, include:

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): resume history sessions and hide legacy scenes"
```

---

### Task 4: Verification and Tracking Matrix

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts src/components/HistoryPage.test.tsx src/App.test.tsx --run
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Browser verification**

Start or reuse the dev servers:

```bash
cd backend && .venv/Scripts/python.exe run_server.py
npm run dev -- --host 127.0.0.1
```

Verify in the browser:

1. Open HistoryPage.
2. Select an agent session.
3. Click “继续此会话”.
4. Confirm the app returns to agent runtime view with the same agent and messages restored.
5. Send a follow-up message and confirm it appends to the same history session.
6. Confirm the old “上下文实验台(老界面)” entry and left scene area are not visible.

- [ ] **Step 4: Update tracking matrix**

In `项目执行跟踪矩阵.md`:

1. Update project status date to `2026-06-18` if not already current.
2. Increment total and completed counts by 1.
3. Add row:

```md
| RQ-045 | 历史会话继续对话与旧场景入口隐藏 | [`2026-06-18-resume-history-session-and-hide-legacy-scenes-design.md`](docs/superpowers/specs/2026-06-18-resume-history-session-and-hide-legacy-scenes-design.md) | [`2026-06-18-resume-history-session-and-hide-legacy-scenes.md`](docs/superpowers/plans/2026-06-18-resume-history-session-and-hide-legacy-scenes.md) | ✅ | ✅ 已完成 |
```

4. Append timeline entry:

```md
### 2026-06-18（历史会话继续对话与旧场景入口隐藏）

- 🆕 新增需求：历史页可继续 agent session；当前 UI 隐藏旧场景区入口
- 📋 规格：`docs/superpowers/specs/2026-06-18-resume-history-session-and-hide-legacy-scenes-design.md`
- 📝 计划：`docs/superpowers/plans/2026-06-18-resume-history-session-and-hide-legacy-scenes.md`（4 Task，subagent-driven 执行）
- 🔄 执行：
  - T1：agentRuntimeStore 新增恢复历史 session 到 workspace 的 action
  - T2：HistoryPage 增加“继续此会话”按钮，仅 agent session 展示
  - T3：App 接入恢复回调并移除旧 chat/场景区入口
  - T4：自动化验证与 UI 验收
- ✅ 完成：历史会话继续对话与旧场景入口隐藏
```

- [ ] **Step 5: Commit tracking update**

Do not commit unless explicitly authorized by the user. If authorized later, include:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): record history resume update"
```

---

## Self-Review

- Spec coverage: Task 1 restores sessions into workspace and preserves same-session persistence; Task 2 adds HistoryPage continue action; Task 3 connects App and hides legacy scene entry; Task 4 verifies and records tracking.
- Placeholder scan: No TBD/TODO/placeholders remain.
- Type consistency: The plan uses existing `Session`-like objects from `dbApi.getSession`, existing `HistoryPage` props, and the new `resumeWorkspaceSession` action consistently.

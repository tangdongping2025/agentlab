# Agent Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agent “new conversation” create independent sessions and show per-message timestamps in history details.

**Architecture:** Keep the existing FastAPI/MySQL session model. Backend returns a reliable message timestamp by falling back to `messages.created_at`; frontend creates a new DB session on reset/new conversation and renders timestamps in `HistoryPage` detail.

**Tech Stack:** React 18 + TypeScript + Zustand + Vitest; FastAPI + SQLAlchemy + pytest; MySQL-backed session persistence.

---

## File Structure

- Modify `backend/routers/sessions.py`: return `MessageModel.created_at` as timestamp fallback when payload lacks `timestamp`.
- Modify `backend/tests/test_agent_runtime_sessions.py` or create focused backend test if no suitable file exists: verify message timestamp fallback.
- Modify `src/stores/agentRuntimeStore.ts`: change workspace reset/new conversation behavior to create a fresh session for the selected agent instead of clearing the existing session.
- Modify `src/stores/agentRuntimeStore.test.ts`: verify reset creates a new session and does not update old session messages to empty.
- Modify `src/components/HistoryPage.tsx`: show message timestamp next to role in the right detail panel.
- Modify `src/components/HistoryPage.test.tsx`: verify detail renders message timestamp.

---

### Task 1: Backend Message Timestamp Fallback

**Files:**
- Modify: `backend/routers/sessions.py:27-42`
- Test: `backend/tests/test_agent_runtime_sessions.py`

- [ ] **Step 1: Write the failing backend test**

Add this test to `backend/tests/test_agent_runtime_sessions.py`:

```python
def test_get_session_uses_message_created_at_when_payload_timestamp_missing(client):
    create_resp = client.post("/api/db/sessions", json={
        "id": "timestamp-fallback-session",
        "name": "Timestamp fallback",
        "agentId": "research",
    })
    assert create_resp.status_code == 200

    update_resp = client.put("/api/db/sessions/timestamp-fallback-session", json={
        "messages": [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
    })
    assert update_resp.status_code == 200

    get_resp = client.get("/api/db/sessions/timestamp-fallback-session")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert len(body["messages"]) == 2
    assert body["messages"][0]["timestamp"]
    assert body["messages"][1]["timestamp"]
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agent_runtime_sessions.py::test_get_session_uses_message_created_at_when_payload_timestamp_missing -q
```

Expected: FAIL because `timestamp` is currently `None` when payload has no `timestamp`.

- [ ] **Step 3: Implement timestamp fallback**

In `backend/routers/sessions.py`, change `MessageOut(timestamp=...)` inside `_to_session_out` to:

```python
timestamp=payload.get("timestamp") or (mm.created_at.isoformat() if mm.created_at else None),
```

- [ ] **Step 4: Run backend test**

Run:

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agent_runtime_sessions.py::test_get_session_uses_message_created_at_when_payload_timestamp_missing -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/sessions.py backend/tests/test_agent_runtime_sessions.py
git commit -m "fix(history): return message timestamp fallback"
```

---

### Task 2: New Agent Conversation Creates New Session

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Test: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: Locate current reset method**

Read `src/stores/agentRuntimeStore.ts` and find the method that clears workspace conversation, currently expected to call `dbApi.updateSession(sid, { messages: [] })`.

- [ ] **Step 2: Write the failing frontend store test**

Add this test to `src/stores/agentRuntimeStore.test.ts` near other reset/session tests:

```ts
it('creates a new session when resetting workspace conversation', async () => {
  const { useAgentRuntimeStore } = await import('./agentRuntimeStore');
  const { dbApi } = await import('../services/dbApi');

  vi.mocked(dbApi.createSession).mockResolvedValue({
    id: 'new-research-session',
    name: '研究助手',
    agentId: 'research',
    messages: [],
  } as any);

  useAgentRuntimeStore.setState({
    selectedAgentId: 'research',
    workspaceSessionId: 'old-research-session',
    workspaceMessages: [{ role: 'user', content: 'old question' }],
  });

  await useAgentRuntimeStore.getState().resetWorkspace();

  expect(dbApi.createSession).toHaveBeenCalledWith(expect.objectContaining({
    name: '研究助手',
    agentId: 'research',
  }));
  expect(dbApi.updateSession).not.toHaveBeenCalledWith('old-research-session', { messages: [] });
  expect(useAgentRuntimeStore.getState().workspaceSessionId).toBe('new-research-session');
  expect(useAgentRuntimeStore.getState().workspaceMessages).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts -t "creates a new session when resetting workspace conversation"
```

Expected: FAIL because reset currently clears the old session instead of creating a new one.

- [ ] **Step 4: Implement minimal store change**

In `src/stores/agentRuntimeStore.ts`, update `resetWorkspace` so it:

```ts
const agentId = get().selectedAgentId;
const agent = get().agents.find(a => a.id === agentId);
let newSessionId = '';
try {
  const session = await dbApi.createSession({
    name: agent?.name || agentId,
    agentId,
    messages: [],
  });
  newSessionId = session.id;
} catch (e) {
  console.error('create reset session failed', e);
}
set({
  workspaceSessionId: newSessionId,
  workspaceMessages: [],
  workspaceStreaming: '',
  workspaceEvents: [],
  workspaceObservability: EMPTY_OBS,
});
```

Do not call `dbApi.updateSession(oldSessionId, { messages: [] })` in this method.

- [ ] **Step 5: Run frontend store test**

Run:

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts -t "creates a new session when resetting workspace conversation"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(agent-runtime): create session for new conversation"
```

---

### Task 3: History Detail Shows Message Time

**Files:**
- Modify: `src/components/HistoryPage.tsx:147-152`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write the failing UI test**

Add this test to `src/components/HistoryPage.test.tsx`:

```tsx
it('shows message timestamps in session detail', async () => {
  const { dbApi } = await import('../services/dbApi');
  vi.mocked(dbApi.querySessions).mockResolvedValue({
    total: 1,
    page: 1,
    size: 20,
    items: [{
      id: 'session-with-time',
      name: '研究助手',
      agentId: 'research',
      preview: 'hello',
      totalTokens: 0,
      createdAt: '2026-06-18T01:00:00',
      updatedAt: '2026-06-18T01:01:00',
    }],
  });
  vi.mocked(dbApi.getSession).mockResolvedValue({
    id: 'session-with-time',
    name: '研究助手',
    agentId: 'research',
    messages: [{ role: 'user', content: 'hello', timestamp: '2026-06-18T01:02:00' }],
  } as any);

  render(<HistoryPage onBack={() => {}} />);

  fireEvent.click(await screen.findByText('研究助手'));

  expect(await screen.findByText(/2026-06-18 01:02/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx -t "shows message timestamps in session detail"
```

Expected: FAIL because right detail panel does not render `m.timestamp`.

- [ ] **Step 3: Render timestamp next to role**

In `src/components/HistoryPage.tsx`, change the role header inside detail mapping to:

```tsx
<div style={{ fontSize: '11px', color: m.role === 'user' ? 'var(--accent-blue)' : 'var(--text-tertiary)', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
  <span>{m.role === 'user' ? '👤 用户' : '🤖 助手'}</span>
  {m.timestamp && <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{fmt(m.timestamp)}</span>}
</div>
```

- [ ] **Step 4: Run UI test**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx -t "shows message timestamps in session detail"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/HistoryPage.tsx src/components/HistoryPage.test.tsx
git commit -m "feat(history): show message timestamps"
```

---

### Task 4: Verification

**Files:**
- No code changes unless tests reveal a direct regression from this plan.

- [ ] **Step 1: Run targeted backend tests**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_agent_runtime_sessions.py -q
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

```bash
npm run test -- src/stores/agentRuntimeStore.test.ts src/components/HistoryPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual verification in UI**

Start backend and frontend or use the Docker app already running. Verify:

1. Open an agent workspace.
2. Click new conversation/reset conversation.
3. Send a message.
4. Open history page.
5. Confirm the same agent can have multiple sessions.
6. Select a session and confirm each message shows a timestamp.

- [ ] **Step 5: Update tracking matrix**

Add a short entry to `项目执行跟踪矩阵.md` referencing:

- Spec: `docs/superpowers/specs/2026-06-18-agent-session-history-design.md`
- Plan: `docs/superpowers/plans/2026-06-18-agent-session-history.md`
- Status: completed after tests and manual verification pass.

- [ ] **Step 6: Commit verification/docs update**

```bash
git add 项目执行跟踪矩阵.md
 git commit -m "docs(tracking): record agent session history update"
```

---

## Self-Review

- Spec coverage: Task 1 covers reliable message timestamps; Task 2 covers new conversation creating a new session; Task 3 covers UI timestamp display; Task 4 covers verification and tracking matrix.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: Plan uses existing `SessionOut.messages[].timestamp`, `dbApi.createSession`, `dbApi.updateSession`, and `resetWorkspace` names from the current codebase.

# Task List Refresh Key Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure sending a new user message keeps task-list updates stable by preventing React key collisions between persisted and local messages.

**Architecture:** Keep the existing task derivation path unchanged: `SessionTaskNavigator` still derives tasks from `workspaceMessages` plus `workspaceTaskIndex`. The only runtime change is to namespace message render keys in `ChatWorkspace` so persisted `seq` values cannot collide with fallback local indexes.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library.

---

## File Structure

- Modify `src/components/agentRuntime/ChatWorkspace.tsx`: change message wrapper `key` expression from a raw `seq ?? index` value to a namespaced string.
- Modify `src/components/agentRuntime/ChatWorkspace.test.tsx`: add a regression test that sends a new message after an existing persisted message and asserts the task count updates without duplicate-key warnings.

---

### Task 1: Stabilize Chat Message Keys

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`

- [ ] **Step 1: Write the failing regression test**

Add this test before `it('keeps normal task jumps working after fullscreen closes', ...)` in `src/components/agentRuntime/ChatWorkspace.test.tsx`:

```tsx
  it('updates the session task count after sending a local message without duplicate message keys', () => {
    const keyWarningSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runWorkspace = vi.fn((message: string) => {
      useAgentRuntimeStore.setState(state => ({
        workspaceMessages: [...state.workspaceMessages, { role: 'user', content: message }],
        workspaceRunning: true,
      }));
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '已有任务', seq: 1 }],
      workspaceTaskIndex: [{ messageSeq: 1, role: 'user', title: '已有任务', preview: '已有任务' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      runWorkspace,
    });

    render(<ChatWorkspace />);
    fireEvent.change(screen.getByPlaceholderText('输入消息...'), { target: { value: '新任务' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByRole('button', { name: '任务 2' })).toBeInTheDocument();
    expect(keyWarningSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key'),
      expect.anything(),
    );

    keyWarningSpy.mockRestore();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: the new test fails because React logs a duplicate-key warning for key `1`.

- [ ] **Step 3: Write the minimal implementation**

In `src/components/agentRuntime/ChatWorkspace.tsx`, replace this message wrapper key:

```tsx
              key={m.seq ?? i}
```

with:

```tsx
              key={m.seq !== undefined ? `seq-${m.seq}` : `local-${i}`}
```

- [ ] **Step 4: Run the focused test again**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: all tests in this file pass, and the duplicate-key regression test passes.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript check passes.

- [ ] **Step 6: Commit implementation**

Run:

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx docs/superpowers/plans/2026-06-22-task-list-refresh-key-stability.md
git commit -m "fix(runtime): 稳定任务列表消息键"
```

---

## Self-Review

- Spec coverage: The plan covers the only runtime requirement, preventing key collisions while keeping task derivation and backend index behavior unchanged.
- Placeholder scan: No TBD/TODO/placeholders remain.
- Type consistency: Uses existing `workspaceMessages`, `workspaceTaskIndex`, `runWorkspace`, and `seq` fields exactly as currently defined.

# History and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe HistoryPage as “历史与恢复” so users can understand stored agent sessions as recoverable work context without changing the session data model.

**Architecture:** Keep existing session query, detail loading, and resume flow unchanged. Update only HistoryPage presentation and tests, then record the requirement in the tracking matrix.

**Tech Stack:** React 18 + TypeScript + Vitest + React Testing Library.

---

## File Structure

- Modify `src/components/HistoryPage.tsx`: update page title, filter labels, session list card presentation, detail information card, and resume button text.
- Modify `src/components/HistoryPage.test.tsx`: add coverage for “历史与恢复”, detail info card, and “继续这个上下文”.
- Modify `项目执行跟踪矩阵.md`: add RQ-046 after validation.

---

### Task 1: HistoryPage Recovery Presentation

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing presentation tests**

Add tests that verify:

```tsx
expect(await screen.findByText('历史与恢复')).toBeInTheDocument();
expect(screen.getByText('选择一个 agent 会话，查看上下文并继续工作')).toBeInTheDocument();
```

After selecting an agent session detail, verify:

```tsx
expect(await screen.findByText('会话信息')).toBeInTheDocument();
expect(screen.getByText('继续这个上下文')).toBeInTheDocument();
expect(screen.getByText(/Session/)).toBeInTheDocument();
```

- [ ] **Step 2: Run HistoryPage tests to verify failure**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL because the new presentation text does not exist yet.

- [ ] **Step 3: Implement HistoryPage presentation update**

In `src/components/HistoryPage.tsx`:

- Change title from `历史会话` to `历史与恢复`.
- Add subtitle `选择一个 agent 会话，查看上下文并继续工作`.
- Change token placeholders to `最小 token` and `最大 token` if token inputs remain inline.
- Make list preview and metadata clearer without changing query behavior.
- Add detail info card before messages when `detail` exists.
- Change resume button text to `继续这个上下文`.

- [ ] **Step 4: Run HistoryPage tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: PASS.

---

### Task 2: Verification and Tracking Matrix

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx src/App.test.tsx --run
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Browser verification**

Start or reuse dev servers and verify:

1. History entry opens “历史与恢复”.
2. Selecting an agent session shows the会话信息 card.
3. Clicking “继续这个上下文” returns to agent runtime with the same session restored.
4. Message timestamps remain visible.

- [ ] **Step 4: Update tracking matrix**

Add RQ-046 for “历史与恢复 UI 心智优化” with links to this spec and plan, and append a 2026-06-18 timeline entry.

---

## Self-Review

- Spec coverage: The plan updates only presentation and preserves session semantics.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: No new data model or API type is introduced.

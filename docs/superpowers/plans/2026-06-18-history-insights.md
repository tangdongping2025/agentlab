# History Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only “历史洞察” view that extracts candidate user habits and focus topics from recent agent sessions.

**Architecture:** Keep HistoryPage as the single container. Reuse `dbApi.querySessions` and `dbApi.getSession`; do not add backend endpoints. Add deterministic frontend heuristics for a first read-only prototype.

**Tech Stack:** React 18 + TypeScript + Vitest + React Testing Library.

---

## File Structure

- Modify `src/components/HistoryPage.tsx`: add a two-tab mode for “历史与恢复” and “历史洞察”; add local helpers to build habit/topic candidates from recent agent sessions; render source sessions as clickable evidence.
- Modify `src/components/HistoryPage.test.tsx`: add tests for insight entry, candidate rendering, source click opening detail, and existing resume behavior not regressing.
- Modify `项目执行跟踪矩阵.md`: add RQ-048 after validation.

---

### Task 1: Read-only History Insights View

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing insights tests**

Add tests that verify:

```tsx
fireEvent.click(screen.getByText('历史洞察'));
expect(await screen.findByText('使用习惯候选')).toBeInTheDocument();
expect(await screen.findByText('关注主题候选')).toBeInTheDocument();
```

Mock recent sessions and details so that user messages include terms like `设计`, `计划`, `验证`, `历史恢复`, `知识库`; assert corresponding habit/topic cards appear and show source session names.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL because the insights view does not exist yet.

- [ ] **Step 3: Implement local insight generation**

In `HistoryPage.tsx`:

- Add `mode` state: `'recovery' | 'insights'`.
- Add `insightLoading` and `insights` state.
- When entering insights mode, query recent agent sessions with `dbApi.querySessions({ page: 1, size: 20 })`, filter `agentId`, fetch details with `dbApi.getSession`, then generate:
  - habit candidates from rule keywords such as `设计`, `规格`, `计划`, `验证`, `不要`, `去掉`, `隐藏`, `恢复`.
  - topic candidates from frequent meaningful tokens in session names, previews, and user messages.
- Each insight stores title, description, and source session list.

- [ ] **Step 4: Render insights**

Render two sections:

- `使用习惯候选`
- `关注主题候选`

Each candidate shows title, description, and source session buttons. Clicking a source session switches back to recovery mode and opens that session detail.

- [ ] **Step 5: Run HistoryPage tests**

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

1. HistoryPage shows both “历史与恢复” and “历史洞察”.
2. “历史洞察” shows habit/topic candidates when recent agent sessions exist.
3. Candidate source session click opens the original session detail.
4. “继续这个上下文” still works from the opened detail.

- [ ] **Step 4: Update tracking matrix**

Add RQ-048 for “历史洞察只读候选分析” with links to this spec and plan, and append a 2026-06-18 timeline entry.

---

## Self-Review

- Spec coverage: Plan implements read-only habit/topic candidates with source session traceability.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: No backend API or data model changes are introduced.

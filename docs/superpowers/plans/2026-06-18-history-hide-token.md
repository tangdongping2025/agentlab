# History Hide Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove token information and token filters from the History and Recovery UI.

**Architecture:** Keep backend query support and stored token data unchanged. Only stop HistoryPage from exposing token fields in UI or sending token filter params.

**Tech Stack:** React 18 + TypeScript + Vitest + React Testing Library.

---

## File Structure

- Modify `src/components/HistoryPage.tsx`: remove token state, token query params, token filter inputs, token list metadata, and token detail card row.
- Modify `src/components/HistoryPage.test.tsx`: add assertions that token filters and token text are absent while resume still works.
- Modify `项目执行跟踪矩阵.md`: add RQ-047 after validation.

---

### Task 1: Remove Token From HistoryPage UI

**Files:**
- Modify: `src/components/HistoryPage.tsx`
- Test: `src/components/HistoryPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Add/adjust tests to assert:

```tsx
expect(screen.queryByPlaceholderText('最小 token')).not.toBeInTheDocument();
expect(screen.queryByPlaceholderText('最大 token')).not.toBeInTheDocument();
expect(screen.queryByText(/tokens/i)).not.toBeInTheDocument();
expect(screen.queryByText(/Token：/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL before implementation.

- [ ] **Step 3: Implement removal**

In `src/components/HistoryPage.tsx`:

- Remove `minToken` and `maxToken` state.
- Remove `params.min_token` and `params.max_token` assignment.
- Remove `minToken` and `maxToken` from `runQuery` dependencies.
- Remove token number inputs from filter bar.
- Remove list `tokens` display.
- Remove detail card Token row.

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

- [ ] **Step 3: Update tracking matrix**

Add RQ-047 for “历史与恢复隐藏 Token 信息” with links to this spec and plan, and append a 2026-06-18 timeline entry.

---

## Self-Review

- Spec coverage: Token UI and token query inputs are removed; backend data remains untouched.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: No new API or data type is introduced.

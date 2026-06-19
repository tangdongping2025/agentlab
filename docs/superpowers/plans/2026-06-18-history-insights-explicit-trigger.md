# History Insights Explicit Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make history insight analysis explicitly user-triggered instead of running on tab switch.

**Architecture:** Keep `HistoryPage` as the only changed UI component. Reuse existing local `loadInsights` analysis pipeline, but call it from a button instead of the mode-change effect.

**Tech Stack:** React 18 + TypeScript + Vitest + React Testing Library.

---

## File Structure

- Modify `src/components/HistoryPage.test.tsx`: update insight tests so tab switch alone does not analyze, and button click triggers analysis.
- Modify `src/components/HistoryPage.tsx`: remove automatic `loadInsights()` from `mode === 'insights'` effect; render explicit “分析历史会话” / “重新分析” button and empty instruction state.
- Modify `项目执行跟踪矩阵.md`: add RQ-051 as browser validation pending after automated checks.

---

### Task 1: Explicit Trigger UI

**Files:**
- Modify: `src/components/HistoryPage.test.tsx`
- Modify: `src/components/HistoryPage.tsx`

- [ ] **Step 1: Write failing tests**

Update the existing history insights test so it clicks `历史洞察`, verifies no candidate appears before clicking `分析历史会话`, then clicks the button and expects `使用习惯候选`, `关注主题候选`, and candidate cards.

Add a test where preloaded results exist after analysis and the action button reads `重新分析`.

- [ ] **Step 2: Run failing test**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: FAIL because switching tabs still triggers analysis automatically and no explicit button exists.

- [ ] **Step 3: Implement minimal UI change**

In `HistoryPage.tsx`:

- Keep loading persisted ignored insights when entering `insights` mode if needed, but do not call `loadInsights()` automatically.
- Add a button in the insights view:
  - `分析历史会话` when both candidate lists are empty.
  - `重新分析` once candidates exist.
- Call `loadInsights()` only from that button.
- Show an instruction empty state before first analysis.

- [ ] **Step 4: Verify component tests**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx --run
```

Expected: PASS.

---

### Task 2: Verification and Tracking Matrix

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run front-end validation**

Run:

```bash
npm run test -- src/components/HistoryPage.test.tsx src/App.test.tsx --run
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Update tracking matrix**

Add RQ-051 “历史洞察显式触发分析” with this spec and plan. Mark it as `浏览器验收待确认` until the user verifies the UI.

---

## Self-Review

- Spec coverage: Covers tab switch, explicit trigger, rerun button, and no backend/LLM expansion.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: Reuses existing `Insights` and `loadInsights` behavior.

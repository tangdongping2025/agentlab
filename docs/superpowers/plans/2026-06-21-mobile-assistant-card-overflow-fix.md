# 手机端 assistant 卡片右侧溢出修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复手机端 Agent 对话窗口 assistant 卡片右侧显示不全。

**Architecture:** 只收紧 `MessageBubble` 的移动端宽度约束，让消息行和卡片在父容器内收缩，不改变桌面端样式和消息窗口化实现。

**Tech Stack:** React + TypeScript + Vitest。

---

## File Structure

- Modify: `src/components/agentRuntime/MessageBubble.tsx` — 给 assistant 行和卡片增加安全宽度/box sizing 约束。
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx` — 覆盖移动端卡片不超过父容器的样式约束。

---

### Task 1: 修复移动端 assistant 卡片宽度约束

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing style test**

In `src/components/agentRuntime/MessageBubble.test.tsx`, after the mobile compact row test, add:

```tsx
  it('keeps assistant card inside mobile compact content width', () => {
    const { container } = render(<MessageBubble role="assistant" content="hello" />);

    const row = container.firstElementChild as HTMLElement;
    const card = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;

    expect(row.style.maxWidth).toBe('100%');
    expect(row.style.width).toBe('100%');
    expect(row.style.minWidth).toBe('0px');
    expect(row.style.boxSizing).toBe('border-box');
    expect(card.style.width).toBe('100%');
    expect(card.style.maxWidth).toBe('100%');
    expect(card.style.boxSizing).toBe('border-box');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/components/agentRuntime/MessageBubble.test.tsx -t "mobile compact content width"
```

Expected: FAIL because row/card do not yet have all required constraints.

- [ ] **Step 3: Implement minimal style fix**

In `src/components/agentRuntime/MessageBubble.tsx`, change assistant row style from:

```tsx
style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%', width: 'fit-content' }}
```

to:

```tsx
style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
```

In assistant card style, add:

```tsx
width: '100%',
maxWidth: '100%',
boxSizing: 'border-box',
overflowWrap: 'anywhere',
```

- [ ] **Step 4: Run focused test**

Run:

```bash
npx vitest run src/components/agentRuntime/MessageBubble.test.tsx -t "mobile compact content width"
```

Expected: PASS.

- [ ] **Step 5: Run related tests**

Run:

```bash
npx vitest run src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-06-21-mobile-assistant-card-overflow-fix.md docs/superpowers/plans/2026-06-21-mobile-assistant-card-overflow-fix.md src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "fix(runtime): 修复手机端 assistant 卡片溢出"
```

---

## Self-Review

- Scope limited to assistant card width constraints.
- No desktop layout, task navigator, or session windowing behavior changed.
- Tests cover the CSS invariants that prevent right-side clipping.

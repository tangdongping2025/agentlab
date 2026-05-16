# RQ-013 会话列表显示优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace session item display from "session name + relative update time" to "smart start time · first message preview", helping users quickly identify each session.

**Architecture:** Single-file change to `SessionList.tsx`. Replace `formatRelativeTime` with a new `formatSmartTime` function, and rewrite the session item rendering to show time + first message in a single line with `·` separator. No type, service, or store changes needed.

**Tech Stack:** React 18, TypeScript, existing Zustand store data

---

## File Structure

### Modified Files
- `src/components/SessionList.tsx` — Replace formatRelativeTime with formatSmartTime, rewrite session item rendering

### No New Files

---

### Task 1: Replace formatRelativeTime with formatSmartTime and update session item rendering

**Files:**
- Modify: `src/components/SessionList.tsx`

- [ ] **Step 1: Replace formatRelativeTime with formatSmartTime**

Replace the `formatRelativeTime` function (lines 10-24) with:

```typescript
function formatSmartTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const YYYY = d.getFullYear();

  if (isToday) return `${hh}:${mm}`;
  if (isThisYear) return `${MM}-${DD} ${hh}:${mm}`;
  return `${YYYY}-${MM}-${DD}`;
}
```

- [ ] **Step 2: Add getFirstMessagePreview helper**

Add this function after `formatSmartTime`:

```typescript
function getFirstMessagePreview(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return '新对话';
  const text = messages[0].content.trim();
  return text.length > 20 ? text.slice(0, 20) + '...' : text;
}
```

- [ ] **Step 3: Rewrite the session item content**

Replace the session item inner content (the two `<span>` elements at lines 74-84) with a single line:

Old (remove):
```tsx
<span style={{
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
}}>
  {session.name}
</span>
<span style={{
  fontFamily: 'var(--font-mono)', fontSize: '9px',
  color: 'var(--text-tertiary)', marginLeft: '8px', flexShrink: 0,
}}>
  {formatRelativeTime(session.updatedAt)}
</span>
```

New:
```tsx
<span style={{
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
  fontFamily: 'var(--font-mono)', fontSize: '11px',
}}>
  <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
    {formatSmartTime(session.createdAt)}
  </span>
  <span style={{ color: 'var(--text-tertiary)', margin: '0 6px' }}>·</span>
  <span style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
    {getFirstMessagePreview(session.messages)}
  </span>
</span>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 5: Verify production build**

Run: `cd context-lab && npm run build 2>&1`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
cd context-lab && git add src/components/SessionList.tsx && git commit -m "feat(RQ-013): show smart time + first message in session list items"
```

---

### Task 2: Visual verification

**Files:**
- None (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd context-lab && npm run dev`

- [ ] **Step 2: Manual verification checklist**

1. Create a new session → should show time + "新对话"
2. Send a message → session item should update to time + first message preview
3. Switch to another session → verify display is correct
4. Check that sessions from previous days show `MM-DD HH:mm` format
5. Verify active session still has blue highlight + left border
6. Verify delete button still appears on hover
7. Verify "更多" pagination still works
8. Verify long messages are truncated at 20 chars with `...`

- [ ] **Step 3: Request user verification**

Tell user: "RQ-013 implemented. Please verify: 1) New sessions show '新对话' 2) Sent messages show time + first message 3) Time format is smart (today=HH:mm, earlier=MM-DD HH:mm) 4) Active/delete/more still work"

---

## Self-Review

**1. Spec coverage:**
- ✅ Smart time format (today/this-year/cross-year) — Task 1 Step 1
- ✅ First message preview with 20-char truncation — Task 1 Step 2
- ✅ "新对话" for empty sessions — Task 1 Step 2
- ✅ Single line with `·` separator — Task 1 Step 3
- ✅ Only SessionList.tsx modified — confirmed
- ✅ No type/service/store changes — confirmed

**2. Placeholder scan:** No TBD/TODO found. All code shown in full.

**3. Type consistency:** `formatSmartTime(string): string` and `getFirstMessagePreview(messages[])` match the `Session.messages` type from `src/types/index.ts` (`Array<{ role: string; content: string; timestamp: string }>`).

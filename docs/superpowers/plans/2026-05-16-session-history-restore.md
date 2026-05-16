# RQ-014 会话切换时恢复历史消息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When user switches to a historical session, show all previous messages in the chat area so they can seamlessly continue the conversation.

**Architecture:** Add a `useEffect` in `ChatInteraction.tsx` that watches `conversationHistory` from the store and syncs it to the local `messages` state. This bridges the gap where `switchSession` updates the store but the component's local state stays empty.

**Tech Stack:** React 18, TypeScript, Zustand

---

## File Structure

### Modified Files
- `src/components/ChatInteraction.tsx` — Add useEffect to sync conversationHistory → messages

### No New Files

---

### Task 1: Add conversationHistory sync effect to ChatInteraction

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

- [ ] **Step 1: Add conversationHistory to destructured store values**

In the `useAppStore()` destructuring (around line 25-39), `conversationHistory` is already destructured. Verify it is present. If not, add it.

- [ ] **Step 2: Add useEffect to sync conversationHistory to local messages**

Add this `useEffect` after the existing `initialMessage` effect (after line 23):

```typescript
useEffect(() => {
  if (conversationHistory.length > 0 && messages.length === 0) {
    setMessages(
      conversationHistory.map(m =>
        m.role === 'user' ? `用户: ${m.content}` : `智能体: ${m.content}`
      )
    );
  }
}, [conversationHistory]);
```

This effect triggers when `conversationHistory` changes (i.e., when user switches sessions). It only syncs when the local `messages` is empty, so it doesn't interfere with messages added during the current session's active conversation.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 4: Verify production build**

Run: `cd context-lab && npm run build 2>&1`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd context-lab && git add src/components/ChatInteraction.tsx && git commit -m "feat(RQ-014): restore chat history when switching sessions"
```

---

### Task 2: Visual verification

**Files:**
- None (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd context-lab && npm run dev`

- [ ] **Step 2: Manual verification checklist**

1. Create a new session, send a message → messages appear normally
2. Create another new session, send a different message → new session shows its own messages
3. Click on the first session in the sidebar → should show that session's full message history
4. Click back to the second session → should show that session's messages
5. Continue sending a message in the restored session → new message appears after history
6. Switch to a brand new session with no messages → chat area should be empty (shows "开始对话来体验上下文管理！")
7. Verify scrollToBottom works after history is restored

- [ ] **Step 3: Request user verification**

Tell user: "RQ-014 implemented. Please verify: 1) Switching to a session with messages shows the full history 2) New messages can be sent after history 3) Switching to an empty session shows empty chat"

---

## Self-Review

**1. Spec coverage:**
- ✅ Switch to session with messages → history displayed (Task 1 Step 2)
- ✅ Switch to new session with no messages → empty chat (conversationHistory empty → no sync)
- ✅ Send new message after restore → works (messages.length > 0 → sync skipped, handleSendWithInput appends normally)
- ✅ Visual style same as new messages (no style changes)
- ✅ Only ChatInteraction.tsx modified — confirmed

**2. Placeholder scan:** No TBD/TODO found. All code shown in full.

**3. Type consistency:** `conversationHistory` items have `{ role: 'user' | 'assistant', content: string, timestamp: Date }` matching the store type. Map function produces `"用户: ${content}"` or `"智能体: ${content}"` matching existing messages format used in `handleSendWithInput`.

# RQ-012 配置与状态持久化恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist all user configuration and session state to localStorage, and restore it on app startup so the user resumes exactly where they left off.

**Architecture:** Extend the existing `saveUserConfig`/`loadUserConfig` methods in the Zustand store to cover all persistable fields (adding `currentSessionId` and `sidebarOpen`). Call `saveUserConfig` automatically after every mutation that changes persistable state. In App.tsx, call `loadUserConfig` + `loadSessions` on mount, and use the restored session's message count to decide whether to show the chat view or welcome screen.

**Tech Stack:** React 18, Zustand, localStorage Web API, existing SessionService

---

## File Structure

### Modified Files
- `src/stores/appStore.ts` — Expand save/load coverage, add auto-save calls
- `src/App.tsx` — Call loadUserConfig on mount, restore hasStarted from session data

### No New Files

---

### Task 1: Expand saveUserConfig to persist currentSessionId and sidebarOpen

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: Update saveUserConfig**

In `src/stores/appStore.ts`, find the `saveUserConfig` method and add `currentSessionId` and `sidebarOpen` to the persisted object:

```typescript
  saveUserConfig: () => {
    const state = get();
    localStorage.setItem('context-lab.config', JSON.stringify({
      currentScene: state.currentScene,
      contextStrategy: state.contextStrategy,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextSize: state.contextSize,
      currentSessionId: state.currentSessionId,
      sidebarOpen: state.sidebarOpen,
    }));
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-012): expand saveUserConfig with currentSessionId and sidebarOpen"
```

---

### Task 2: Expand loadUserConfig to restore full state including session

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: Rewrite loadUserConfig**

Replace the `loadUserConfig` method with a version that restores each field individually and recovers the last active session:

```typescript
  loadUserConfig: () => {
    const raw = localStorage.getItem('context-lab.config');
    if (!raw) return;
    try {
      const config = JSON.parse(raw);
      const restore: Partial<AppState> = {};
      if (config.currentScene) restore.currentScene = config.currentScene;
      if (config.contextStrategy) restore.contextStrategy = config.contextStrategy;
      if (config.systemPrompt) restore.systemPrompt = config.systemPrompt;
      if (config.selectedTools) restore.selectedTools = config.selectedTools;
      if (config.contextSize) restore.contextSize = config.contextSize;
      if (typeof config.sidebarOpen === 'boolean') restore.sidebarOpen = config.sidebarOpen;
      set(restore);

      // Restore last active session
      if (config.currentSessionId) {
        const session = sessionService.getById(config.currentSessionId);
        if (session) {
          set({
            currentSessionId: config.currentSessionId,
            currentScene: session.sceneId,
            systemPrompt: session.systemPrompt,
            selectedTools: [...session.selectedTools],
            contextStrategy: session.contextStrategy,
            contextSize: session.contextSize,
            conversationHistory: session.messages.map(m => ({
              role: m.role,
              content: m.content,
              timestamp: new Date(m.timestamp),
            })),
          });
        }
      }
    } catch { /* ignore corrupt data */ }
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-012): expand loadUserConfig to restore full state and last active session"
```

---

### Task 3: Add auto-save calls after every persistable mutation

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: Add saveUserConfig() calls to all persistable action methods**

Update each of the following methods to call `get().saveUserConfig()` after the state change:

**setScene** — add `get().saveUserConfig()` after the `set()` call

**setStrategy** — change from `set({ contextStrategy: strategy })` to:
```typescript
  setStrategy: (strategy) => {
    set({ contextStrategy: strategy });
    get().saveUserConfig();
  },
```

**setContextSize** — same pattern:
```typescript
  setContextSize: (size) => {
    set({ contextSize: size });
    get().saveUserConfig();
  },
```

**setSystemPrompt** — same pattern:
```typescript
  setSystemPrompt: (prompt) => {
    set({ systemPrompt: prompt });
    get().saveUserConfig();
  },
```

**toggleTool** — use setTimeout to avoid calling saveUserConfig during batch set:
```typescript
  toggleTool: (toolId) => set(state => {
    const selectedTools = state.selectedTools.includes(toolId)
      ? state.selectedTools.filter(id => id !== toolId)
      : [...state.selectedTools, toolId];
    setTimeout(() => get().saveUserConfig(), 0);
    return { selectedTools };
  }),
```

**selectAllTools** — same setTimeout pattern:
```typescript
  selectAllTools: () => set(state => {
    setTimeout(() => get().saveUserConfig(), 0);
    return { selectedTools: state.availableTools.map(t => t.id) };
  }),
```

**clearAllTools** — call after set:
```typescript
  clearAllTools: () => {
    set({ selectedTools: [] });
    get().saveUserConfig();
  },
```

**toggleSidebar** — call after set:
```typescript
  toggleSidebar: () => {
    set(state => ({ sidebarOpen: !state.sidebarOpen }));
    get().saveUserConfig();
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-012): add auto-save after every persistable state mutation"
```

---

### Task 4: Update App.tsx to call loadUserConfig on mount and restore chat view

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add loadUserConfig and conversationHistory to destructured store values**

Add `loadUserConfig` and `conversationHistory` to the useAppStore destructuring.

- [ ] **Step 2: Call loadUserConfig in the mount useEffect**

Update the mount effect to call `loadUserConfig()` before `loadSessions()`:
```typescript
  useEffect(() => {
    loadUserConfig();
    loadSessions();
  }, []);
```

- [ ] **Step 3: Add a useEffect to restore hasStarted based on restored session messages**

```typescript
  useEffect(() => {
    if (currentSessionId && conversationHistory.length > 0) {
      setHasStarted(true);
    }
  }, [currentSessionId, conversationHistory.length]);
```

- [ ] **Step 4: Verify build passes**

Run: `cd context-lab && npm run build 2>&1`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd context-lab && git add src/App.tsx && git commit -m "feat(RQ-012): call loadUserConfig on mount, restore chat view from persisted session"
```

---

### Task 5: Build verification and manual testing

**Files:**
- None (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1`

Expected: Zero errors.

- [ ] **Step 2: Run production build**

Run: `cd context-lab && npm run build 2>&1`

Expected: Build succeeds.

- [ ] **Step 3: Start dev server and manually verify persistence**

Run: `cd context-lab && npm run dev`

Manual checks:
1. Switch strategy from "滑动窗口" to "摘要记忆" → refresh page → strategy should still be "摘要记忆"
2. Change context size from 32K to 128K → refresh → should still show 128K
3. Toggle sidebar closed → refresh → sidebar should still be closed
4. Switch scene to "投资研究" → refresh → scene should still be "投资研究"
5. Start a conversation → refresh → should see chat view with previous messages

- [ ] **Step 4: Request user verification**

Tell user: "RQ-012 persistence implemented. Please verify: 1) Strategy/size persist after refresh 2) Sidebar state persists 3) Scene selection persists 4) Active session with messages restores to chat view on restart"

---

## Self-Review

**1. Spec coverage:**
- ✅ currentScene persisted (Task 1 + 3)
- ✅ contextStrategy persisted (Task 1 + 3)
- ✅ contextSize persisted (Task 1 + 3)
- ✅ systemPrompt persisted (Task 1 + 3)
- ✅ selectedTools persisted (Task 1 + 3)
- ✅ currentSessionId persisted (Task 1)
- ✅ sidebarOpen persisted (Task 1 + 3)
- ✅ Session restore with messages (Task 2 + 4)
- ✅ Auto-save on mutations (Task 3)
- ✅ Data corruption protection (Task 2 try/catch)
- ✅ Chat view restoration on restart (Task 4)

**2. Placeholder scan:** No TBD/TODO found. All code shown in full.

**3. Type consistency:** `Partial<AppState>` used consistently in loadUserConfig. All method signatures match between Task 1-4.

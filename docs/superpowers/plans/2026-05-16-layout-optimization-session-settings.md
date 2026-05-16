# RQ-011 布局优化：会话管理+设置重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar into scene cards + session list, extract strategy/size settings into a modal, add scene editing modal, and add tool selector to the input bar — enabling multi-session management and a cleaner layout.

**Architecture:** Sessions are persisted in localStorage via a dedicated service. The store manages a `sessions` array and `currentSessionId`, swapping all conversation + config state on session switch. Scene configs are consolidated into the store (removing the redundant SceneService data), supporting both preset and user-created custom scenes. Three new modals (Settings, SceneEdit) and one inline dropdown (ToolSelectorBar) replace the sidebar's inline configuration sections.

**Tech Stack:** React 18, TypeScript, Zustand, CSS variables (matching existing pattern), localStorage for persistence

---

## File Structure

### New Files
- `src/types/session.ts` — Session, SessionSummary types
- `src/services/sessionService.ts` — Session CRUD + localStorage persistence
- `src/components/SettingsModal.tsx` — Strategy + context size modal
- `src/components/SceneEditModal.tsx` — Scene name/prompt/tools editing modal
- `src/components/SceneCards.tsx` — Scene card list for sidebar
- `src/components/SessionList.tsx` — Session list for sidebar
- `src/components/ToolSelectorBar.tsx` — Tool dropdown for input bar

### Modified Files
- `src/types/index.ts` — Add `icon`, `isPreset` to SceneConfig; widen SceneType
- `src/stores/appStore.ts` — Add session state, scene array, remove redundant scene methods
- `src/components/ConfigSidebar.tsx` — Restructure: SceneCards + SessionList only
- `src/components/ChatInteraction.tsx` — Add ToolSelectorBar to input area
- `src/components/WelcomeScreen.tsx` — Update hint text
- `src/App.tsx` — Add modals, session switching, settings button
- `src/index.css` — Update `--sidebar-width` to 260px

### Deleted Files
- `src/services/sceneService.ts` — Data consolidated into store

---

### Task 1: Update Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update SceneConfig and SceneType, add Session types**

Replace the entire contents of `src/types/index.ts`:

```typescript
// src/types/index.ts
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface SceneConfig {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
  tools: string[];
  isPreset: boolean;
}

export interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  total: number;
}

export type ContextStrategy = 'sliding' | 'full' | 'summary' | 'none';

export type SceneType = string; // 'restaurant' | 'research' | 'dialog' | 'custom' | custom UUID

export interface Session {
  id: string;
  name: string;
  sceneId: string;
  systemPrompt: string;
  selectedTools: string[];
  contextStrategy: ContextStrategy;
  contextSize: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -20`

Expected: May show errors in appStore.ts due to the widened `SceneType` — these will be fixed in Task 3. Confirm that `src/types/index.ts` itself has no errors.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/types/index.ts && git commit -m "feat(RQ-011): update types — add Session, widen SceneType, add icon/isPreset to SceneConfig"
```

---

### Task 2: Create SessionService

**Files:**
- Create: `src/services/sessionService.ts`

- [ ] **Step 1: Write the sessionService**

Create `src/services/sessionService.ts`:

```typescript
import type { Session } from '../types/index';

const STORAGE_KEY = 'context-lab.sessions';

export class SessionService {
  getAll(): Session[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const sessions: Session[] = JSON.parse(raw);
      return sessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  getById(id: string): Session | null {
    return this.getAll().find(s => s.id === id) || null;
  }

  save(session: Session): void {
    const sessions = this.getAll().filter(s => s.id !== session.id);
    sessions.unshift(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  delete(id: string): void {
    const sessions = this.getAll().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  create(partial: Omit<Session, 'id' | 'messages' | 'createdAt' | 'updatedAt'>): Session {
    const now = new Date().toISOString();
    const session: Session = {
      ...partial,
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.save(session);
    return session;
  }

  update(id: string, partial: Partial<Session>): Session | null {
    const session = this.getById(id);
    if (!session) return null;
    const updated = { ...session, ...partial, updatedAt: new Date().toISOString() };
    this.save(updated);
    return updated;
  }
}

export const sessionService = new SessionService();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd context-lab && npx tsc --noEmit src/services/sessionService.ts 2>&1 | head -10`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/services/sessionService.ts && git commit -m "feat(RQ-011): add SessionService with localStorage CRUD"
```

---

### Task 3: Update AppStore — Add Session State, Consolidate Scenes

**Files:**
- Modify: `src/stores/appStore.ts`

This is the largest change. The store gains session management, a `scenes` array, and loses the redundant `loadPromptForScene`/`loadToolsForScene` methods.

- [ ] **Step 1: Rewrite appStore.ts**

Replace the entire contents of `src/stores/appStore.ts`:

```typescript
import { create } from 'zustand';
import type { Session, SceneConfig, ContextStrategy } from '../types/index';
import { sessionService } from '../services/sessionService';

type SceneType = string;

interface TimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;
  expanded: boolean;
  details?: {
    type: 'api' | 'tool' | 'context' | 'default';
    content: any;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ToolInteractionDetails {
  type: 'tool';
  toolInfo: { name: string; description: string; parameters: any };
  callContext: { systemPrompt: string; userQuery: string; conversationHistory: string[] };
  toolOutput: any;
  reorganizedContext: string;
  toolUseReasoning: string;
}

interface ApiInteraction {
  id: string;
  timestamp: Date;
  request: { url: string; headers: Record<string, string>; body: string };
  response: { status: number; headers: Record<string, string>; body: string; duration: number } | null;
}

const DEFAULT_SCENES: SceneConfig[] = [
  {
    id: 'restaurant',
    name: '餐厅预订',
    icon: '🍽️',
    systemPrompt: '你是一个专业的餐厅预订助手，帮助用户查询和预订餐厅。可以使用搜索和时间工具。',
    tools: ['xueqiu-search', 'xueqiu-quote'],
    isPreset: true,
  },
  {
    id: 'research',
    name: '投资研究',
    icon: '📊',
    systemPrompt: '你是一个专业的投资研究助手，帮助用户分析股票、市场和投资机会。可以使用雪球搜索和AkShare数据工具。',
    tools: ['xueqiu-search', 'akshare-data'],
    isPreset: true,
  },
  {
    id: 'dialog',
    name: '对话分析',
    icon: '💬',
    systemPrompt: '你是一个对话分析助手，帮助用户分析对话内容、情感和主题。',
    tools: [],
    isPreset: true,
  },
  {
    id: 'custom',
    name: '自定义',
    icon: '✏️',
    systemPrompt: '',
    tools: [],
    isPreset: true,
  },
];

const AVAILABLE_TOOLS = [
  { id: 'xueqiu-search', name: '📈 雪球搜索', description: '在雪球上搜索股票、基金、投资信息', icon: '📈' },
  { id: 'xueqiu-quote', name: '💰 股票行情', description: '获取实时股票行情、涨跌幅、成交量信息', icon: '💰' },
  { id: 'xueqiu-news', name: '📰 投资资讯', description: '获取最新财经新闻、公司公告、研报信息', icon: '📰' },
  { id: 'tradingview-chart', name: '📊 图表分析', description: '查看TradingView图表进行技术分析', icon: '📊' },
  { id: 'akshare-data', name: '🔢 数据获取', description: '使用AkShare获取各种金融市场数据', icon: '🔢' },
  { id: 'akshare-indicator', name: '📉 指标计算', description: '计算各种技术指标、财务指标', icon: '📉' },
];

const INITIAL_TIMELINE_STEPS: TimelineStep[] = [
  { id: 'user-input', icon: '💬', title: '用户输入', description: '等待用户输入...', active: true, completed: false, expandable: false, expanded: false },
  { id: 'context-pack', icon: '🧠', title: '上下文打包', description: '准备打包上下文...', active: false, completed: false, expandable: false, expanded: false },
  { id: 'tool-call', icon: '🔧', title: '工具调用', description: '准备调用工具...', active: false, completed: false, expandable: true, expanded: false },
  { id: 'result-pack', icon: '📦', title: '结果打包', description: '准备打包结果...', active: false, completed: false, expandable: true, expanded: false },
  { id: 'api-reorganize', icon: '📄', title: '重新组织上下文报文', description: '准备重新组织上下文...', active: false, completed: false, expandable: true, expanded: false },
  { id: 'agent-response', icon: '🤖', title: '智能体响应', description: '等待大模型响应...', active: false, completed: false, expandable: false, expanded: false },
];

function loadScenesFromStorage(): SceneConfig[] {
  const raw = localStorage.getItem('context-lab.scenes');
  if (!raw) return DEFAULT_SCENES;
  try {
    const custom: SceneConfig[] = JSON.parse(raw);
    return [...DEFAULT_SCENES, ...custom];
  } catch {
    return DEFAULT_SCENES;
  }
}

function saveCustomScenes(scenes: SceneConfig[]) {
  const custom = scenes.filter(s => !s.isPreset);
  localStorage.setItem('context-lab.scenes', JSON.stringify(custom));
}

interface AppState {
  // Timeline replay
  timelineReplayIndex: number;
  isTimelinePlaying: boolean;
  timelineSpeed: number;
  showLearningNotes: boolean;
  learningNotes: string[];

  // Scenes (consolidated from SceneService)
  scenes: SceneConfig[];
  currentScene: SceneType;

  // Strategy & context
  contextStrategy: ContextStrategy;
  contextSize: number;

  // System prompt & tools
  systemPrompt: string;
  selectedTools: string[];
  availableTools: typeof AVAILABLE_TOOLS;

  // Sessions
  sessions: Session[];
  currentSessionId: string | null;

  // UI
  showDetails: boolean;
  isLoading: boolean;
  sidebarOpen: boolean;

  // Timeline steps
  timelineSteps: TimelineStep[];
  currentStepIndex: number;
  lastUserInput: string;

  // Conversation
  conversationHistory: Message[];

  // API interactions
  apiInteractions: ApiInteraction[];

  // === Actions ===

  // Timeline replay
  setTimelineReplayIndex: (index: number) => void;
  toggleTimelinePlaying: () => void;
  setTimelineSpeed: (speed: number) => void;
  toggleLearningNotes: () => void;
  addLearningNote: (note: string) => void;
  clearLearningNotes: () => void;

  // Scene
  setScene: (sceneId: string) => void;
  addScene: (scene: Omit<SceneConfig, 'id' | 'isPreset'>) => void;
  updateScene: (sceneId: string, partial: Partial<SceneConfig>) => void;

  // Strategy & size
  setStrategy: (strategy: ContextStrategy) => void;
  setContextSize: (size: number) => void;

  // Prompt & tools
  setSystemPrompt: (prompt: string) => void;
  toggleTool: (toolId: string) => void;
  selectAllTools: () => void;
  clearAllTools: () => void;

  // Session
  createSession: (name?: string) => Session;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  saveCurrentSession: () => void;
  loadSessions: () => void;

  // Timeline
  resetTimeline: () => void;
  updateTimelineStep: (stepId: string, description: string, active?: boolean, completed?: boolean) => void;
  nextTimelineStep: () => void;
  setLastUserInput: (input: string) => void;

  // Conversation
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  clearHistory: () => void;

  // API
  addApiRequest: (url: string, headers: Record<string, string>, body: string) => string;
  addApiResponse: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => void;

  // Step details
  toggleStepExpanded: (stepId: string) => void;
  setStepDetails: (stepId: string, details: any) => void;
  clearStepDetails: (stepId: string) => void;
  recordToolInteraction: (stepId: string, toolName: string, toolDesc: string, params: any, callCtx: any, output: any, reasoning: string, reorganizedCtx: string) => void;

  // Sidebar
  toggleSidebar: () => void;

  // Config persistence (kept for backward compat)
  saveUserConfig: () => void;
  loadUserConfig: () => void;
  resetPromptForScene: (scene: SceneType) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  timelineReplayIndex: 0,
  isTimelinePlaying: false,
  timelineSpeed: 1000,
  showLearningNotes: true,
  learningNotes: [
    '系统提示词定义了角色和任务',
    '对话历史是最大的Token消耗',
    '策略优化可以显著降低成本',
  ],

  scenes: loadScenesFromStorage(),
  currentScene: 'restaurant',
  contextStrategy: 'sliding',
  systemPrompt: DEFAULT_SCENES[0].systemPrompt,
  selectedTools: DEFAULT_SCENES[0].tools,
  contextSize: 32768,
  availableTools: AVAILABLE_TOOLS,

  sessions: [],
  currentSessionId: null,

  showDetails: false,
  isLoading: false,
  sidebarOpen: true,

  conversationHistory: [],
  apiInteractions: [],

  timelineSteps: INITIAL_TIMELINE_STEPS.map(s => ({ ...s })),
  currentStepIndex: 0,
  lastUserInput: '',

  // === Scene actions ===
  setScene: (sceneId: string) => {
    const scene = get().scenes.find(s => s.id === sceneId);
    if (!scene) return;
    set({
      currentScene: sceneId,
      systemPrompt: scene.systemPrompt,
      selectedTools: [...scene.tools],
    });
  },

  addScene: (partial) => {
    const id = `scene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const scene: SceneConfig = { ...partial, id, isPreset: false };
    const scenes = [...get().scenes, scene];
    saveCustomScenes(scenes);
    set({ scenes });
  },

  updateScene: (sceneId, partial) => {
    const scenes = get().scenes.map(s =>
      s.id === sceneId ? { ...s, ...partial } : s
    );
    saveCustomScenes(scenes);
    set({ scenes });
    // If updating the current scene, reflect changes
    if (get().currentScene === sceneId) {
      const updated = scenes.find(s => s.id === sceneId);
      if (updated) {
        set({
          systemPrompt: partial.systemPrompt ?? get().systemPrompt,
          selectedTools: partial.tools ? [...partial.tools] : get().selectedTools,
        });
      }
    }
  },

  // === Strategy & size ===
  setStrategy: (strategy) => set({ contextStrategy: strategy }),
  setContextSize: (size) => set({ contextSize: size }),

  // === Prompt & tools ===
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),

  toggleTool: (toolId) => set(state => ({
    selectedTools: state.selectedTools.includes(toolId)
      ? state.selectedTools.filter(id => id !== toolId)
      : [...state.selectedTools, toolId]
  })),

  selectAllTools: () => set(state => ({
    selectedTools: state.availableTools.map(t => t.id)
  })),

  clearAllTools: () => set({ selectedTools: [] }),

  // === Session actions ===
  loadSessions: () => {
    const sessions = sessionService.getAll();
    set({ sessions });
  },

  createSession: (name?: string) => {
    const state = get();
    // Save current session first
    if (state.currentSessionId) {
      state.saveCurrentSession();
    }
    const scene = state.scenes.find(s => s.id === state.currentScene);
    const sessionName = name || `${scene?.icon || '✏️'} ${scene?.name || '新对话'}`;
    const session = sessionService.create({
      name: sessionName,
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
    });
    set({
      currentSessionId: session.id,
      sessions: sessionService.getAll(),
      conversationHistory: [],
      apiInteractions: [],
    });
    state.resetTimeline();
    return session;
  },

  switchSession: (sessionId) => {
    const state = get();
    // Save current
    if (state.currentSessionId) {
      state.saveCurrentSession();
    }
    const session = sessionService.getById(sessionId);
    if (!session) return;
    const scene = state.scenes.find(s => s.id === session.sceneId);
    set({
      currentSessionId: sessionId,
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
      apiInteractions: [],
    });
    state.resetTimeline();
  },

  deleteSession: (sessionId) => {
    sessionService.delete(sessionId);
    const sessions = sessionService.getAll();
    const state = get();
    if (state.currentSessionId === sessionId) {
      set({
        currentSessionId: null,
        sessions,
        conversationHistory: [],
        apiInteractions: [],
      });
      state.resetTimeline();
    } else {
      set({ sessions });
    }
  },

  saveCurrentSession: () => {
    const state = get();
    if (!state.currentSessionId) return;
    sessionService.update(state.currentSessionId, {
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
      messages: state.conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      })),
    });
    set({ sessions: sessionService.getAll() });
  },

  // === Timeline ===
  resetTimeline: () => set({
    timelineSteps: INITIAL_TIMELINE_STEPS.map(s => ({ ...s })),
    currentStepIndex: 0,
    lastUserInput: '',
  }),

  updateTimelineStep: (stepId, description, active?, completed?) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, description, active: active ?? step.active, completed: completed ?? step.completed } : step
    )
  })),

  nextTimelineStep: () => set(state => {
    if (state.currentStepIndex < state.timelineSteps.length - 1) {
      const newIndex = state.currentStepIndex + 1;
      return {
        timelineSteps: state.timelineSteps.map((step, i) => ({
          ...step,
          active: i === newIndex,
          completed: i < newIndex,
        })),
        currentStepIndex: newIndex,
      };
    }
    return state;
  }),

  setLastUserInput: (input) => set({ lastUserInput: input }),

  // === Conversation ===
  addMessage: (role, content) => set(state => ({
    conversationHistory: [...state.conversationHistory, { role, content, timestamp: new Date() }]
  })),

  clearHistory: () => set({ conversationHistory: [] }),

  // === API ===
  addApiRequest: (url, headers, body) => {
    const id = `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set(state => ({
      apiInteractions: [...state.apiInteractions, { id, timestamp: new Date(), request: { url, headers, body }, response: null }]
    }));
    return id;
  },

  addApiResponse: (id, status, headers, body, duration) => set(state => ({
    apiInteractions: state.apiInteractions.map(inter =>
      inter.id === id ? { ...inter, response: { status, headers, body, duration } } : inter
    )
  })),

  // === Step details ===
  toggleStepExpanded: (stepId) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, expanded: !step.expanded } : step
    )
  })),

  setStepDetails: (stepId, details) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, details } : step
    )
  })),

  clearStepDetails: (stepId) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, details: undefined } : step
    )
  })),

  recordToolInteraction: (stepId, toolName, toolDesc, params, callCtx, output, reasoning, reorganizedCtx) => {
    const details: ToolInteractionDetails = {
      type: 'tool',
      toolInfo: { name: toolName, description: toolDesc, parameters: params },
      callContext: callCtx,
      toolOutput: output,
      reorganizedContext: reorganizedCtx,
      toolUseReasoning: reasoning,
    };
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details } : step
      )
    }));
  },

  // === Sidebar ===
  toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),

  // === Backward compat ===
  saveUserConfig: () => {
    const state = get();
    localStorage.setItem('context-lab.config', JSON.stringify({
      currentScene: state.currentScene,
      contextStrategy: state.contextStrategy,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextSize: state.contextSize,
    }));
  },

  loadUserConfig: () => {
    const raw = localStorage.getItem('context-lab.config');
    if (raw) {
      try { set(JSON.parse(raw)); } catch { /* ignore */ }
    }
  },

  resetPromptForScene: (sceneId: SceneType) => {
    const scene = get().scenes.find(s => s.id === sceneId);
    if (scene) set({ systemPrompt: scene.systemPrompt });
  },
}));
```

- [ ] **Step 2: Delete sceneService.ts**

The scene data is now in the store. Delete the redundant file:

```bash
rm src/services/sceneService.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: Errors in `ConfigSidebar.tsx` (imports `SceneService`), `App.test.tsx` — these will be fixed in later tasks. No errors in the store itself.

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add -A && git commit -m "feat(RQ-011): restructure appStore — add session state, consolidate scenes, remove SceneService"
```

---

### Task 4: Create SettingsModal

**Files:**
- Create: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Write the SettingsModal component**

Create `src/components/SettingsModal.tsx`:

```typescript
import React from 'react';
import { useAppStore } from '../stores/appStore';
import type { ContextStrategy } from '../types/index';

const strategies: Array<{ id: ContextStrategy; name: string; savings: string }> = [
  { id: 'sliding', name: '滑动窗口', savings: '节省 40%' },
  { id: 'full', name: '完整记忆', savings: '基线' },
  { id: 'summary', name: '摘要记忆', savings: '节省 60%' },
  { id: 'none', name: '无记忆', savings: '节省 80%' },
];

const sizePresets = [
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 32768, label: '32K' },
  { value: 131072, label: '128K' },
  { value: 1048576, label: '1M' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { contextStrategy, setStrategy, contextSize, setContextSize } = useAppStore();

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '400px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600 }}>⚙ 设置</h3>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px',
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Strategy */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
            }}>
              上下文策略
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {strategies.map(s => (
                <div
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
                    border: `1px solid ${contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--border-subtle)'}`,
                    background: contextStrategy === s.id ? 'rgba(167,139,250,0.06)' : 'var(--bg-surface)',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 500 }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-tertiary)',
                    }} />
                    <span style={{ color: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-secondary)' }}>
                      {s.name}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px',
                    color: s.savings === '基线' ? 'var(--text-tertiary)' : 'var(--accent-emerald)',
                  }}>
                    {s.savings}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Context Size */}
          <div>
            <div style={{
              fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
            }}>
              上下文窗口大小
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {sizePresets.map(p => (
                <div
                  key={p.value}
                  onClick={() => setContextSize(p.value)}
                  style={{
                    flex: 1, padding: '10px 0', textAlign: 'center',
                    background: contextSize === p.value ? 'rgba(91,156,245,0.08)' : 'var(--bg-surface)',
                    border: `1px solid ${contextSize === p.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: '6px', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600,
                    color: contextSize === p.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>tokens</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/SettingsModal.tsx && git commit -m "feat(RQ-011): add SettingsModal — strategy + context size"
```

---

### Task 5: Create SceneEditModal

**Files:**
- Create: `src/components/SceneEditModal.tsx`

- [ ] **Step 1: Write the SceneEditModal component**

Create `src/components/SceneEditModal.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { SceneConfig } from '../types/index';

interface SceneEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: string | null; // null = creating new scene
}

export default function SceneEditModal({ isOpen, onClose, sceneId }: SceneEditModalProps) {
  const { scenes, availableTools, addScene, updateScene } = useAppStore();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState<string[]>([]);

  const isEditing = sceneId !== null;

  useEffect(() => {
    if (isOpen) {
      if (sceneId) {
        const scene = scenes.find(s => s.id === sceneId);
        if (scene) {
          setName(scene.name);
          setPrompt(scene.systemPrompt);
          setTools([...scene.tools]);
        }
      } else {
        setName('');
        setPrompt('');
        setTools([]);
      }
    }
  }, [isOpen, sceneId, scenes]);

  const toggleTool = (toolId: string) => {
    setTools(prev =>
      prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (isEditing && sceneId) {
      updateScene(sceneId, { name: name.trim(), systemPrompt: prompt, tools });
    } else {
      addScene({ name: name.trim(), icon: '✏️', systemPrompt: prompt, tools });
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '440px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
            {isEditing ? '✏️ 编辑场景' : '✏️ 新建场景'}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px',
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Name */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              场景名称
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="输入场景名称..."
              style={{
                width: '100%', padding: '9px 11px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* System Prompt */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              系统提示词
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="定义这个场景的角色和行为..."
              style={{
                width: '100%', padding: '9px 11px', minHeight: '72px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '12px',
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Tools */}
          <div>
            <div style={{
              fontSize: '10px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              关联工具{' '}
              <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: '9px' }}>
                （点击切换启用/禁用）
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {availableTools.map(tool => {
                const active = tools.includes(tool.id);
                return (
                  <span
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    style={{
                      fontSize: '11px', padding: '4px 10px', borderRadius: '12px',
                      background: active ? 'rgba(91,156,245,0.08)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(91,156,245,0.2)' : 'var(--border-default)'}`,
                      color: active ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                      cursor: 'pointer', transition: 'all 0.12s',
                      ...(active ? {} : { opacity: 0.4, textDecoration: 'line-through' }),
                    }}
                  >
                    {tool.icon} {tool.name.replace(tool.icon + ' ', '')}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Save */}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', fontSize: '12px', fontWeight: 500,
                borderRadius: '6px', border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                padding: '8px 16px', fontSize: '12px', fontWeight: 500,
                borderRadius: '6px', border: '1px solid var(--accent-blue)',
                background: 'var(--accent-blue)', color: 'white', cursor: 'pointer',
                opacity: name.trim() ? 1 : 0.5,
              }}
            >
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/SceneEditModal.tsx && git commit -m "feat(RQ-011): add SceneEditModal — name/prompt/tools editing"
```

---

### Task 6: Create SceneCards Component

**Files:**
- Create: `src/components/SceneCards.tsx`

- [ ] **Step 1: Write the SceneCards component**

Create `src/components/SceneCards.tsx`:

```typescript
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SceneCardsProps {
  onEditScene: (sceneId: string) => void;
}

export default function SceneCards({ onEditScene }: SceneCardsProps) {
  const { scenes, currentScene, setScene } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.9px', color: 'var(--text-tertiary)',
          padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>场景</span>
        <span style={{
          fontSize: '10px', transition: 'transform 0.2s',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          display: 'inline-block',
        }}>
          ▾
        </span>
      </div>
      {!collapsed && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {scenes.map(scene => {
            const isActive = currentScene === scene.id;
            const toolCount = scene.tools.length;
            const strategyLabel = isActive
              ? useAppStore.getState().contextStrategy === 'sliding' ? '滑动窗口'
                : useAppStore.getState().contextStrategy === 'full' ? '完整记忆'
                : useAppStore.getState().contextStrategy === 'summary' ? '摘要记忆'
                : '无记忆'
              : '';

            return (
              <div
                key={scene.id}
                onClick={() => setScene(scene.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '8px',
                  border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  background: isActive ? 'rgba(91,156,245,0.06)' : 'var(--bg-surface)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{scene.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px', fontWeight: 600,
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)',
                  }}>
                    {scene.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                    {toolCount} 工具{isActive && strategyLabel ? ` · ${strategyLabel}` : ''}
                  </div>
                </div>
                <span
                  onClick={e => { e.stopPropagation(); onEditScene(scene.id); }}
                  title="编辑场景"
                  style={{
                    opacity: 0, width: '22px', height: '22px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                    borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-tertiary)', transition: 'all 0.12s', flexShrink: 0,
                    fontSize: '11px',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; }}
                >
                  ✎
                </span>
              </div>
            );
          })}
          {/* New scene card */}
          <div
            onClick={() => onEditScene(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '8px',
              border: '1px dashed var(--border-default)',
              background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLElement).style.background = 'rgba(91,156,245,0.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '16px', color: 'var(--text-tertiary)', flexShrink: 0 }}>＋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)' }}>新建场景</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/SceneCards.tsx && git commit -m "feat(RQ-011): add SceneCards — sidebar scene section with edit/new"
```

---

### Task 7: Create SessionList Component

**Files:**
- Create: `src/components/SessionList.tsx`

- [ ] **Step 1: Write the SessionList component**

Create `src/components/SessionList.tsx`:

```typescript
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SessionListProps {
  onNewChat: () => void;
}

const VISIBLE_COUNT = 10;

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffMs / 604800000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return `${diffWeek}w`;
}

export default function SessionList({ onNewChat }: SessionListProps) {
  const { sessions, currentSessionId, switchSession, deleteSession, scenes } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleSessions = showAll ? sessions : sessions.slice(0, VISIBLE_COUNT);
  const hasMore = sessions.length > VISIBLE_COUNT;

  return (
    <div style={{
      borderBottom: '1px solid var(--border-subtle)',
      flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.9px', color: 'var(--text-tertiary)',
          padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>会话</span>
        <span
          onClick={e => { e.stopPropagation(); onNewChat(); }}
          style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--accent-blue)', cursor: 'pointer' }}
        >
          + 新建
        </span>
      </div>
      {!collapsed && (
        <div style={{ padding: '0 16px 0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {visibleSessions.map(session => {
              const isActive = currentSessionId === session.id;
              const scene = scenes.find(s => s.id === session.sceneId);
              return (
                <div
                  key={session.id}
                  onClick={() => switchSession(session.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', fontSize: '12px', cursor: 'pointer',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    transition: 'all 0.1s', borderRadius: '5px',
                    borderLeft: `2px solid ${isActive ? 'var(--accent-blue)' : 'transparent'}`,
                    background: isActive ? 'rgba(91,156,245,0.05)' : 'transparent',
                  }}
                >
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
                  <button
                    onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                    style={{
                      opacity: 0, background: 'transparent', border: 'none',
                      color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px',
                      padding: '2px 4px', transition: 'opacity 0.12s', flexShrink: 0, marginLeft: '4px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-rose)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {hasMore && !showAll && (
              <div
                onClick={() => setShowAll(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '7px', fontSize: '11px', color: 'var(--text-tertiary)',
                  cursor: 'pointer', borderRadius: '5px',
                }}
              >
                ··· 更多
              </div>
            )}
          </div>
          <button
            onClick={onNewChat}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              width: '100%', padding: '7px 10px', margin: '6px 0 14px',
              fontSize: '12px', fontWeight: 500, color: 'var(--accent-blue)',
              background: 'transparent', border: '1px dashed rgba(91,156,245,0.3)',
              borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            + 新建对话
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/SessionList.tsx && git commit -m "feat(RQ-011): add SessionList — sidebar session history with delete/switch/new"
```

---

### Task 8: Create ToolSelectorBar Component

**Files:**
- Create: `src/components/ToolSelectorBar.tsx`

- [ ] **Step 1: Write the ToolSelectorBar component**

Create `src/components/ToolSelectorBar.tsx`:

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

export default function ToolSelectorBar() {
  const { selectedTools, availableTools, toggleTool } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '8px 10px', background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)', borderRadius: '8px',
          fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer',
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        🔧 工具{' '}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px',
          background: 'rgba(91,156,245,0.15)', color: 'var(--accent-blue)',
          padding: '1px 6px', borderRadius: '8px',
        }}>
          {selectedTools.length}
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
          width: '200px', background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)', borderRadius: '8px',
          padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {availableTools.map(tool => {
            const isSelected = selectedTools.includes(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
                  transition: 'background 0.1s', fontSize: '12px',
                  color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{
                  width: '14px', height: '14px', borderRadius: '3px',
                  border: `1.5px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', flexShrink: 0,
                  background: isSelected ? 'var(--accent-blue)' : 'transparent',
                  color: isSelected ? '#fff' : 'transparent',
                  transition: 'all 0.12s',
                }}>
                  {isSelected ? '✓' : ''}
                </span>
                <span style={{ fontSize: '14px' }}>{tool.icon}</span>
                <span>{tool.name.replace(tool.icon + ' ', '')}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/ToolSelectorBar.tsx && git commit -m "feat(RQ-011): add ToolSelectorBar — compact tool dropdown for input bar"
```

---

### Task 9: Restructure ConfigSidebar

**Files:**
- Modify: `src/components/ConfigSidebar.tsx`

The sidebar is completely restructured: scene cards + session list replace the old inline config sections.

- [ ] **Step 1: Rewrite ConfigSidebar.tsx**

Replace the entire contents of `src/components/ConfigSidebar.tsx`:

```typescript
import React from 'react';
import { useAppStore } from '../stores/appStore';
import SceneCards from './SceneCards';
import SessionList from './SessionList';

interface ConfigSidebarProps {
  onEditScene: (sceneId: string | null) => void;
  onNewChat: () => void;
}

export default function ConfigSidebar({ onEditScene, onNewChat }: ConfigSidebarProps) {
  const { sidebarOpen } = useAppStore();

  return (
    <nav style={{
      position: 'fixed',
      left: 0,
      top: 'var(--header-height)',
      width: 'var(--sidebar-width)',
      height: 'calc(100vh - var(--header-height))',
      background: 'var(--bg-base)',
      borderRight: '1px solid var(--border-subtle)',
      overflowY: 'auto',
      zIndex: 90,
      transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <SceneCards onEditScene={onEditScene} />
      <SessionList onNewChat={onNewChat} />
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/ConfigSidebar.tsx && git commit -m "feat(RQ-011): restructure ConfigSidebar — scene cards + session list"
```

---

### Task 10: Update ChatInteraction — Add ToolSelectorBar

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

- [ ] **Step 1: Add ToolSelectorBar to the input area**

In `src/components/ChatInteraction.tsx`, make these changes:

1. Add import at the top (after existing imports):
```typescript
import ToolSelectorBar from './ToolSelectorBar';
```

2. Replace the input area section (the `<div>` with `background: 'var(--bg-base)'` and `borderTop`) with this updated version that includes the ToolSelectorBar:

Find the block starting with `{/* 输入区域 */}` and replace the entire input `<div>`:

```typescript
      {/* 输入区域 */}
      <div style={{
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '12px 20px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <ToolSelectorBar />
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              disabled={isLoading}
              rows={1}
              style={{
                width: '100%', padding: '12px 48px 12px 14px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: '10px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)', fontSize: '13px',
                resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '120px',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-default)'; }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              style={{
                position: 'absolute', right: '6px', bottom: '6px',
                width: '34px', height: '34px',
                background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
                border: 'none', borderRadius: '8px', color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors in ChatInteraction.tsx.

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/components/ChatInteraction.tsx && git commit -m "feat(RQ-011): add ToolSelectorBar to ChatInteraction input area"
```

---

### Task 11: Update App.tsx — Wire Modals, Sessions, Settings Button

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Update index.css — change sidebar width to 260px**

In `src/index.css`, change `--sidebar-width: 280px` to `--sidebar-width: 260px`.

- [ ] **Step 2: Update WelcomeScreen hint text**

In `src/components/WelcomeScreen.tsx`, change the bottom hint text from:
```
按 Enter 发送 · 在左侧面板调整场景、策略和工具
```
to:
```
按 Enter 发送 · 在左侧切换场景 · 点击 ⚙ 调整策略
```

- [ ] **Step 3: Rewrite App.tsx**

Replace the entire contents of `src/App.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import ConfigSidebar from './components/ConfigSidebar';
import WelcomeScreen from './components/WelcomeScreen';
import ChatInteraction from './components/ChatInteraction';
import BottomPanel from './components/BottomPanel';
import SettingsModal from './components/SettingsModal';
import SceneEditModal from './components/SceneEditModal';
import { useAppStore } from './stores/appStore';

const App: React.FC = () => {
  const {
    sidebarOpen, toggleSidebar, contextSize,
    sessions, currentSessionId, loadSessions, createSession, saveCurrentSession,
  } = useAppStore();

  const [hasStarted, setHasStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sceneEditOpen, setSceneEditOpen] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const sizeLabels: Record<number, string> = {
    4096: '4K', 8192: '8K', 32768: '32K', 131072: '128K', 1048576: '1M',
  };
  const sizeLabel = sizeLabels[contextSize] || `${(contextSize / 1024).toFixed(0)}K`;

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Auto-detect if current session has messages → show chat view
  useEffect(() => {
    if (currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session && session.messages.length > 0) {
        setHasStarted(true);
      }
    }
  }, [currentSessionId]);

  const handleStartConversation = (input: string) => {
    createSession();
    setInitialMessage(input);
    setHasStarted(true);
  };

  const handleNewChat = () => {
    if (currentSessionId) saveCurrentSession();
    createSession();
    setHasStarted(false);
    setInitialMessage('');
  };

  const handleEditScene = (sceneId: string | null) => {
    setEditingSceneId(sceneId);
    setSceneEditOpen(true);
  };

  const handleCloseSceneEdit = () => {
    setSceneEditOpen(false);
    setEditingSceneId(null);
  };

  // ESC to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setSceneEditOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)' }}>
      {/* Header */}
      <header style={{
        height: 'var(--header-height)',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', position: 'relative', zIndex: 100, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleSidebar}
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="切换侧栏"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px', height: '20px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
              borderRadius: '5px',
            }} />
            <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.3px' }}>Context Lab</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            padding: '3px 8px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderRadius: '4px',
            color: 'var(--text-secondary)',
          }}>
            Claude 3.5 Sonnet
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            padding: '3px 8px', background: 'rgba(91,156,245,0.1)',
            border: '1px solid rgba(91,156,245,0.2)', borderRadius: '4px',
            color: 'var(--accent-blue)',
          }}>
            {sizeLabel}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            title="设置"
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <ConfigSidebar onEditScene={handleEditScene} onNewChat={handleNewChat} />

      {/* Main */}
      <main style={{
        marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '0',
        flex: 1, display: 'flex', flexDirection: 'column',
        transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {hasStarted ? (
          <>
            <ChatInteraction initialMessage={initialMessage} />
            <BottomPanel />
          </>
        ) : (
          <WelcomeScreen onStartConversation={handleStartConversation} />
        )}
      </main>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SceneEditModal isOpen={sceneEditOpen} onClose={handleCloseSceneEdit} sceneId={editingSceneId} />
    </div>
  );
};

export default App;
```

- [ ] **Step 4: Verify the build**

Run: `cd context-lab && npm run build 2>&1 | tail -20`

Expected: Build succeeds. If there are TypeScript errors, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
cd context-lab && git add src/App.tsx src/components/WelcomeScreen.tsx src/index.css && git commit -m "feat(RQ-011): wire modals, session management, settings button in App.tsx"
```

---

### Task 12: Fix SceneCards Hover + Auto-save on Message

**Files:**
- Modify: `src/components/SceneCards.tsx`
- Modify: `src/components/ChatInteraction.tsx`

Two issues to fix: (1) the edit icon on scene cards needs to be visible on hover, and (2) the current session should auto-save after each message.

- [ ] **Step 1: Fix scene card edit icon visibility**

In `src/components/SceneCards.tsx`, add hover handling to the scene card wrapper. Find the `<div>` that wraps each scene card (the one with `key={scene.id}`) and add `onMouseEnter`/`onMouseLeave` handlers to show the edit icon:

Add this CSS-in-JS approach — replace the scene card's outer `<div>` wrapper with a fragment that uses `onMouseEnter`/`onMouseLeave` to toggle edit icon visibility. Update the edit icon's `opacity` from `0` to respond to hover:

Change the edit `<span>` style from `opacity: 0` to:
```typescript
opacity: isActive ? 1 : undefined,
```

And add a `data-active` or use a local hover state. The simplest approach: add CSS that makes the edit icon visible when the parent is hovered.

Actually, since inline styles can't do parent-hover, we need a small wrapper component. Add this inside `SceneCards.tsx` before the default export:

```typescript
function SceneCard({ scene, isActive, onSelect, onEdit }: {
  scene: { id: string; name: string; icon: string; tools: string[] };
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const strategy = useAppStore(s => s.contextStrategy);
  const strategyLabel = isActive
    ? strategy === 'sliding' ? '滑动窗口'
      : strategy === 'full' ? '完整记忆'
      : strategy === 'summary' ? '摘要记忆'
      : '无记忆'
    : '';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: '8px',
        border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
        background: isActive ? 'rgba(91,156,245,0.06)' : 'var(--bg-surface)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{scene.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12px', fontWeight: 600,
          color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)',
        }}>
          {scene.name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          {scene.tools.length} 工具{isActive && strategyLabel ? ` · ${strategyLabel}` : ''}
        </div>
      </div>
      <span
        onClick={e => { e.stopPropagation(); onEdit(); }}
        title="编辑场景"
        style={{
          opacity: hovered || isActive ? 1 : 0,
          width: '22px', height: '22px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', transition: 'all 0.12s', flexShrink: 0,
          fontSize: '11px',
        }}
      >
        ✎
      </span>
    </div>
  );
}
```

Then replace the inline scene card rendering in the `SceneCards` component's map with:

```typescript
{scenes.map(scene => (
  <SceneCard
    key={scene.id}
    scene={scene}
    isActive={currentScene === scene.id}
    onSelect={() => setScene(scene.id)}
    onEdit={() => onEditScene(scene.id)}
  />
))}
```

- [ ] **Step 2: Add auto-save after each message in ChatInteraction**

In `src/components/ChatInteraction.tsx`, add `saveCurrentSession` to the destructured store values, and call it after both `addMessage('user', text)` and `addMessage('assistant', agentResponse)`:

Find this line:
```typescript
const {
  systemPrompt,
  selectedTools,
  ...
  addApiRequest,
  addApiResponse
} = useAppStore();
```

Add `saveCurrentSession` to the destructuring.

Then, after the line `addMessage('user', text);`, add:
```typescript
      // Auto-save session after user message
      saveCurrentSession();
```

And after the line `addMessage('assistant', agentResponse);`, add:
```typescript
      // Auto-save session after assistant response
      saveCurrentSession();
```

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/components/SceneCards.tsx src/components/ChatInteraction.tsx && git commit -m "fix(RQ-011): scene card hover visibility, auto-save session on message"
```

---

### Task 13: Build Verification and Cleanup

**Files:**
- Possibly fix any remaining TypeScript errors

- [ ] **Step 1: Run full TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1`

Expected: Zero errors. If any remain, fix them.

- [ ] **Step 2: Run production build**

Run: `cd context-lab && npm run build 2>&1`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Start dev server and visually verify**

Run: `cd context-lab && npm run dev`

Manual checks:
1. Sidebar shows scene cards + session list (no strategy/size/tools/prompt sections)
2. Clicking a scene card switches the active scene
3. Clicking edit icon on a scene card opens SceneEditModal
4. Clicking "+ 新建场景" opens SceneEditModal in create mode
5. Clicking ⚙ in header opens SettingsModal with strategy + size
6. Tool selector in input bar opens a dropdown
7. Creating a new chat works from sidebar
8. Switching between sessions preserves messages
9. Deleting a session removes it from the list

- [ ] **Step 4: Final commit**

```bash
cd context-lab && git add -A && git commit -m "chore(RQ-011): build verification and cleanup"
```

---

## Self-Review Checklist

### Spec Coverage
- ✅ Sidebar scene cards (icon, name, tool count, strategy, edit icon) → Task 6
- ✅ Sidebar session list (name, relative time, delete, switch) → Task 7
- ✅ Collapsible sections → Tasks 6, 7
- ✅ "+ 新建场景" card → Task 6
- ✅ "+ 新建对话" button → Task 7
- ✅ Settings modal (strategy + context size) → Task 4
- ✅ Scene edit modal (name + prompt + tools) → Task 5
- ✅ Tool selector in input bar → Task 8
- ✅ Header settings button → Task 11
- ✅ Session persistence → Tasks 2, 3
- ✅ Auto-save on messages → Task 12
- ✅ Sidebar width 260px → Task 11

### Placeholder Scan
- No TBD/TODO found
- All code steps contain full implementations
- No "implement later" or "fill in details"

### Type Consistency
- `SceneConfig.id` is `string` throughout (widened from union type)
- `Session.id` is `string` consistently
- `Session.messages` uses `{ role, content, timestamp: string }` for serialization
- Store's `conversationHistory` uses `Date` for timestamp, converted to/from `string` in session service

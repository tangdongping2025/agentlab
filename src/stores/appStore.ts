import { create } from 'zustand';
import type { Session, SceneConfig, ContextStrategy, StrategyEffect, FileAttachment } from '../types/index';
import { sessionService } from '../services/sessionService';
import { truncateResult, MAX_TOOL_RESULT_SIZE } from '../utils/truncator';

type SceneType = string;

export interface UserInputDetails {
  type: 'user-input';
  text: string;
  tokenCount: number;
  conversationTurns: number;
}

export interface ApiRequestDetails {
  type: 'api-request';
  url: string;
  model: string;
  contextBreakdown: { section: string; tokenCount: number; percentage: number }[];
  requestBody?: string;
}

export interface ApiResponseDetails {
  type: 'api-response';
  statusCode: number;
  duration: number;
  tokenUsage: { input: number; output: number };
  responseType: 'tool_call' | 'final_response' | 'error';
  responseBody?: string;
}

export interface ToolCallDetails {
  type: 'tool-call';
  toolName: string;
  toolDescription: string;
  parameters: Record<string, any>;
  reasoning: string;
  result?: any;
  resultSummary?: string;
}

export interface AgentResponseDetails {
  type: 'agent-response';
  text: string;
  tokenUsage: { input: number; output: number };
  toolsUsed: string[];
  apiCallCount: number;
}

export interface StrategyEffectStepDetails {
  type: 'strategy-effect';
  strategy: ContextStrategy;
  strategyLabel: string;
  beforeCount: number;
  afterCount: number;
  beforeTokens: number;
  afterTokens: number;
  savingsPercent: number;
  removedCount: number;
  summaryContent?: string;
  degraded?: boolean;
  degradeReason?: string;
  summaryDuration?: number;
  summarySourceCount?: number;
  summarySourceTokens?: number;
  removedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails | StrategyEffectStepDetails;

export interface TimelineStep {
  id: string;
  type: 'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response' | 'strategy-effect';
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;
  expanded: boolean;
  apiInteractionId?: string;
  toolCallName?: string;
  duration?: number;
  tokenUsage?: { input: number; output: number };
  details?: StepDetails;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenUsage?: { input: number; output: number };
  apiCallCount?: number;
  toolsUsed?: string[];
  timelineStepIndex?: number;
  files?: FileAttachment[];
  isFileOnly?: boolean;
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
    systemPrompt: '你是一个专业的投资研究助手，帮助用户分析股票、市场和投资机会。可以使用雪球搜索和行情工具。',
    tools: ['xueqiu-search', 'xueqiu-quote', 'xueqiu-market'],
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
  { id: 'xueqiu-quote', name: '💰 股票行情', description: '获取实时股票行情、涨跌幅、成交量等信息', icon: '💰' },
  { id: 'xueqiu-market', name: '🌐 大盘指数', description: '查询A股、美股、港股大盘指数行情', icon: '🌐' },
];

const INITIAL_TIMELINE_STEPS: TimelineStep[] = [];

function loadScenesFromStorage(): SceneConfig[] {
  const raw = localStorage.getItem('context-lab.scenes');
  if (!raw) return DEFAULT_SCENES;
  try {
    const custom: SceneConfig[] = JSON.parse(raw);
    // Sanitize tool references in custom scenes
    const validIds = new Set(AVAILABLE_TOOLS.map(t => t.id));
    const sanitized = custom.map(s => ({
      ...s,
      tools: s.tools.filter(tid => validIds.has(tid)),
    }));
    return [...DEFAULT_SCENES, ...sanitized];
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
  strategyEffect: StrategyEffect | null;
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
  setStrategyEffect: (effect: StrategyEffect | null) => void;

  // Conversation
  addMessage: (role: 'user' | 'assistant', content: string, files?: FileAttachment[], isFileOnly?: boolean) => void;
  clearHistory: () => void;

  // API
  addApiRequest: (url: string, headers: Record<string, string>, body: string) => string;
  addApiResponse: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => void;

  // Step details
  toggleStepExpanded: (stepId: string) => void;
  setStepDetails: (stepId: string, details: StepDetails) => void;
  clearStepDetails: (stepId: string) => void;
  recordToolInteraction: (stepId: string, toolName: string, toolDesc: string, params: any, callCtx: any, output: any, reasoning: string) => void;
  addTimelineStep: (step: TimelineStep) => void;
  updateTimelineStepData: (stepId: string, data: Partial<TimelineStep>) => void;
  completeTimelineStep: (stepId: string, data?: Partial<TimelineStep>) => void;
  collapseAllSteps: () => void;

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

  timelineSteps: [],
  currentStepIndex: -1,
  strategyEffect: null,
  lastUserInput: '',

  // === Scene actions ===
  setScene: (sceneId: string) => {
    const scene = get().scenes.find(s => s.id === sceneId);
    if (!scene) return;
    // Filter out tool IDs that no longer exist in availableTools
    const validTools = scene.tools.filter(tid =>
      get().availableTools.some(t => t.id === tid)
    );
    set({
      currentScene: sceneId,
      systemPrompt: scene.systemPrompt,
      selectedTools: validTools,
    });
    get().saveUserConfig();
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
        get().saveUserConfig();
      }
    }
  },

  // === Strategy & size ===
  setStrategy: (strategy) => {
    set({ contextStrategy: strategy });
    get().saveUserConfig();
  },
  setContextSize: (size) => {
    set({ contextSize: size });
    get().saveUserConfig();
  },

  // === Prompt & tools ===
  setSystemPrompt: (prompt) => {
    set({ systemPrompt: prompt });
    get().saveUserConfig();
  },

  toggleTool: (toolId) => {
    set(state => ({
      selectedTools: state.selectedTools.includes(toolId)
        ? state.selectedTools.filter(id => id !== toolId)
        : [...state.selectedTools, toolId]
    }));
    get().saveUserConfig();
  },

  selectAllTools: () => {
    set(state => ({ selectedTools: state.availableTools.map(t => t.id) }));
    get().saveUserConfig();
  },

  clearAllTools: () => {
    set({ selectedTools: [] });
    get().saveUserConfig();
  },

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
        files: m.files,
        isFileOnly: m.isFileOnly,
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
    try {
      const messages = state.conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
        files: m.files?.map(f =>
          f.content && f.content.startsWith('data:')
            ? { ...f, content: undefined, type: 'image_ref' as const }
            : f
        ),
        isFileOnly: m.isFileOnly,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));
      sessionService.update(state.currentSessionId, {
        sceneId: state.currentScene,
        systemPrompt: state.systemPrompt,
        selectedTools: state.selectedTools,
        contextStrategy: state.contextStrategy,
        contextSize: state.contextSize,
        messages,
      });
    } catch (e) {
      console.error('Failed to save session, saving metadata only:', e);
      sessionService.update(state.currentSessionId, {
        sceneId: state.currentScene,
        systemPrompt: state.systemPrompt,
        selectedTools: state.selectedTools,
        contextStrategy: state.contextStrategy,
        contextSize: state.contextSize,
        messages: [],
      });
    }
    set({ sessions: sessionService.getAll() });
  },

  // === Timeline ===
  resetTimeline: () => set({
    timelineSteps: [],
    currentStepIndex: -1,
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
  setStrategyEffect: (effect) => set({ strategyEffect: effect }),

  // === Conversation ===
  addMessage: (role, content, files?, isFileOnly?) => set(state => ({
    conversationHistory: [...state.conversationHistory, { role, content, timestamp: new Date(), files, isFileOnly }]
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
      inter.id === id ? { ...inter, response: { status, headers, body: truncateResult(body, MAX_TOOL_RESULT_SIZE), duration } } : inter
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

  recordToolInteraction: (stepId, toolName, toolDesc, params, callCtx, output, reasoning) => {
    const details: ToolCallDetails = {
      type: 'tool-call',
      toolName,
      toolDescription: toolDesc,
      parameters: params,
      reasoning,
      result: output,
      resultSummary: typeof output === 'string' ? output.slice(0, 200) : JSON.stringify(output).slice(0, 200),
    };
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details, toolCallName: toolName, expandable: true } : step
      )
    }));
  },

  addTimelineStep: (step) => set(state => ({
    timelineSteps: [...state.timelineSteps, step],
  })),

  updateTimelineStepData: (stepId, data) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, ...data } : step
    ),
  })),

  completeTimelineStep: (stepId, data?) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, active: false, completed: true, ...data } : step
    ),
  })),

  collapseAllSteps: () => set(state => ({
    timelineSteps: state.timelineSteps.map(step => ({ ...step, expanded: false })),
  })),

  // === Sidebar ===
  toggleSidebar: () => {
    set(state => ({ sidebarOpen: !state.sidebarOpen }));
    get().saveUserConfig();
  },

  // === Timeline replay ===
  setTimelineReplayIndex: (index) => set({ timelineReplayIndex: index }),
  toggleTimelinePlaying: () => set(state => ({ isTimelinePlaying: !state.isTimelinePlaying })),
  setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),
  toggleLearningNotes: () => set(state => ({ showLearningNotes: !state.showLearningNotes })),
  addLearningNote: (note) => set(state => ({ learningNotes: [...state.learningNotes, note] })),
  clearLearningNotes: () => set({ learningNotes: [] }),

  // === Config persistence ===
  saveUserConfig: () => {
    const state = get();
    try {
      localStorage.setItem('context-lab.config', JSON.stringify({
        currentScene: state.currentScene,
        contextStrategy: state.contextStrategy,
        systemPrompt: state.systemPrompt,
        selectedTools: state.selectedTools,
        contextSize: state.contextSize,
        currentSessionId: state.currentSessionId,
        sidebarOpen: state.sidebarOpen,
      }));
    } catch { /* localStorage full or unavailable — silently skip */ }
  },

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

      // Restore last active session — merge into single set to avoid double render
      if (config.currentSessionId) {
        const session = sessionService.getById(config.currentSessionId);
        if (session) {
          restore.currentSessionId = config.currentSessionId;
          restore.currentScene = session.sceneId;
          restore.systemPrompt = session.systemPrompt;
          restore.selectedTools = [...session.selectedTools];
          restore.contextStrategy = session.contextStrategy;
          restore.contextSize = session.contextSize;
          restore.conversationHistory = session.messages.map(m => ({
            role: m.role,
            content: m.content,
            files: m.files,
            isFileOnly: m.isFileOnly,
            timestamp: new Date(m.timestamp),
          }));
        }
        // else: session was deleted — don't set stale currentSessionId
      }

      set(restore);
    } catch { /* ignore corrupt data */ }
  },

  resetPromptForScene: (sceneId: SceneType) => {
    const scene = get().scenes.find(s => s.id === sceneId);
    if (scene) set({ systemPrompt: scene.systemPrompt });
  },
}));

import { create } from 'zustand';
import type { Session, SceneConfig, ContextStrategy, StrategyEffect, FileAttachment } from '../types/index';
import { sessionService } from '../services/sessionService';
import { agentService } from '../services/agentService';
import { truncateResult, MAX_TOOL_RESULT_SIZE, MAX_API_REQUEST_BODY_SIZE } from '../utils/truncator';

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

export interface ThinkingStepDetails {
  type: 'thinking';
  thinkingContent: string;
  thinkingTokens: number;
  duration: number;
}

export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails | StrategyEffectStepDetails | ThinkingStepDetails;

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
    name: '投资助手',
    icon: '📈',
    systemPrompt: '你是一个专业的投资助手，帮助用户搜索和分析股票、市场、财经新闻等信息。\n\n【强制规则】\n1. 你不知道当前日期，你的训练数据已过时。任何涉及"今天"、"最新"、"当前"、"近期"等时间相关的问题，必须先调用搜索工具查询，绝对不能凭记忆回答。\n2. 搜索返回结果后，你必须严格基于搜索结果中的信息来回答，不得用自己的训练数据替换或补充搜索结果中的事实信息。如果搜索结果与你的记忆冲突，以搜索结果为准。\n3. 如果搜索工具不可用，请明确告知用户你无法获取实时信息。\n\n【搜索技巧】查询实时信息时，使用具体的关键词（如"2026年5月19日 农历"而非"今天日期"），并设置freshness为day或week、max_results为3-5获取更精准的结果。',
    tools: ['anysearch'],
    isPreset: true,
  },
  {
    id: 'research',
    name: '研究分析',
    icon: '🔬',
    systemPrompt: '你是一个研究分析助手，帮助用户搜索信息、查询资料、提取网页内容。\n\n【强制规则】\n1. 你不知道当前日期，你的训练数据已过时。任何涉及"今天"、"最新"、"当前"、"近期"等时间相关的问题，必须先调用搜索工具查询，绝对不能凭记忆回答。\n2. 搜索返回结果后，你必须严格基于搜索结果中的信息来回答，不得用自己的训练数据替换或补充搜索结果中的事实信息。如果搜索结果与你的记忆冲突，以搜索结果为准。\n3. 如果搜索工具不可用，请明确告知用户你无法获取实时信息。\n\n【搜索技巧】查询实时日期/新闻时，使用具体的关键词（如"2026年5月19日 农历"而非"今天日期"），并设置freshness为day或week获取最新结果。',
    tools: ['anysearch', 'anysearch-extract'],
    isPreset: true,
  },
  {
    id: 'dialog',
    name: '日常对话',
    icon: '💬',
    systemPrompt: '你是一个对话助手，帮助用户分析对话内容、情感和主题。',
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
  { id: 'anysearch', name: '🔍 联网搜索', description: '搜索网页、新闻、代码、论文、金融等23个垂直领域', icon: '🔍' },
  { id: 'anysearch-extract', name: '📄 网页提取', description: '提取指定URL网页的全文内容', icon: '📄' },
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

  // API config
  apiKey: string;
  apiBaseUrl: string;
  apiModel: string;

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
  streamingMessageId: string | null;

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
  setApiKey: (key: string) => void;
  setApiBaseUrl: (url: string) => void;
  setApiModel: (model: string) => void;

  // Prompt & tools
  setSystemPrompt: (prompt: string) => void;
  toggleTool: (toolId: string) => void;
  selectAllTools: () => void;
  clearAllTools: () => void;

  // Temperature
  temperature: number;
  setTemperature: (t: number) => void;

  thinkingEnabled: boolean;
  thinkingBudget: number;
  toggleThinking: () => void;
  setThinkingBudget: (budget: number) => void;

  // Session
  createSession: (name?: string) => Session;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  deleteAllSessions: () => void;
  saveCurrentSession: () => void;
  loadSessions: () => Promise<void>;

  // Timeline
  resetTimeline: () => void;
  updateTimelineStep: (stepId: string, description: string, active?: boolean, completed?: boolean) => void;
  nextTimelineStep: () => void;
  setLastUserInput: (input: string) => void;
  setStrategyEffect: (effect: StrategyEffect | null) => void;

  // Conversation
  addMessage: (role: 'user' | 'assistant', content: string, files?: FileAttachment[], isFileOnly?: boolean) => string;
  updateStreamingMessage: (text: string) => void;
  clearStreamingMessage: () => void;
  setLastAssistantMessage: (text: string) => void;
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
  apiKey: import.meta.env.VITE_CLAUDE_API_KEY || '',
  apiBaseUrl: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
  apiModel: import.meta.env.VITE_CLAUDE_MODEL || 'claude-sonnet-4-6',
  availableTools: AVAILABLE_TOOLS,

  sessions: [],
  currentSessionId: null,

  showDetails: false,
  isLoading: false,
  sidebarOpen: true,

  conversationHistory: [],
  apiInteractions: [],
  streamingMessageId: null as string | null,

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

  setApiKey: (key) => {
    set({ apiKey: key });
    get().saveUserConfig();
  },
  setApiBaseUrl: (url) => {
    set({ apiBaseUrl: url });
    get().saveUserConfig();
  },
  setApiModel: (model) => {
    set({ apiModel: model });
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

  temperature: 0.7,

  setTemperature: (t) => {
    set({ temperature: t });
    get().saveUserConfig();
  },

  thinkingEnabled: false,
  thinkingBudget: 10000,

  toggleThinking: () => {
    set(state => ({ thinkingEnabled: !state.thinkingEnabled }));
    get().saveUserConfig();
  },

  setThinkingBudget: (budget) => {
    set({ thinkingBudget: budget });
    get().saveUserConfig();
  },

  // === Session actions ===
  loadSessions: async () => {
    try {
      const sessions = await sessionService.getAll();
      set({ sessions });
    } catch (e) {
      console.error('loadSessions failed (backend down?):', e);
      set({ sessions: [] });
    }
  },

  createSession: (name?: string) => {
    const state = get();
    if (state.currentSessionId) {
      state.saveCurrentSession();
    }
    const scene = state.scenes.find(s => s.id === state.currentScene);
    const sessionName = name || `${scene?.icon || '✏️'} ${scene?.name || '新对话'}`;
    const now = new Date().toISOString();
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id,
      name: sessionName,
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    // 乐观：先入内存，再异步落库
    set({
      currentSessionId: id,
      sessions: [session, ...state.sessions],
      conversationHistory: [],
      apiInteractions: [],
    });
    sessionService.create({
      id: session.id,  // 让 DB 用前端生成的 id，保证后续 PUT 匹配
      name: session.name,
      sceneId: session.sceneId,
      systemPrompt: session.systemPrompt,
      selectedTools: session.selectedTools,
      contextStrategy: session.contextStrategy,
      contextSize: session.contextSize,
    }).catch(e => console.error('createSession DB write failed:', e));
    state.resetTimeline();
    return session;
  },

  switchSession: (sessionId) => {
    const state = get();
    if (state.currentSessionId) {
      state.saveCurrentSession();
    }
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;
    // sessions 已含完整 messages（list 端点返回 SessionOut），直接用内存
    set({
      currentSessionId: sessionId,
      currentScene: session.sceneId,
      systemPrompt: session.systemPrompt,
      selectedTools: [...session.selectedTools],
      contextStrategy: session.contextStrategy,
      contextSize: session.contextSize,
      conversationHistory: (session.messages || []).map(m => ({
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
    const state = get();
    sessionService.delete(sessionId).catch(e => console.error('deleteSession failed:', e));
    const sessions = state.sessions.filter(s => s.id !== sessionId);
    if (state.currentSessionId === sessionId) {
      set({ currentSessionId: null, sessions, conversationHistory: [], apiInteractions: [] });
      state.resetTimeline();
    } else {
      set({ sessions });
    }
  },

  deleteAllSessions: () => {
    sessionService.deleteAll().catch(e => console.error('deleteAllSessions failed:', e));
    agentService.clearHistory();
    set({ currentSessionId: null, sessions: [], conversationHistory: [], apiInteractions: [] });
    get().resetTimeline();
  },

  saveCurrentSession: () => {
    const state = get();
    if (!state.currentSessionId) return;
    // 发送完整消息（含 tokenUsage/thinkingContent/files），后端算 total_tokens
    const messages = state.conversationHistory.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      tokenUsage: (m as any).tokenUsage,
      toolsUsed: (m as any).toolsUsed,
      thinkingContent: (m as any).thinkingContent,
      thinkingTokens: (m as any).thinkingTokens,
      files: m.files?.map(f =>
        f.content && f.content.startsWith('data:')
          ? { ...f, content: undefined, type: 'image_ref' as const }
          : f
      ),
      isFileOnly: m.isFileOnly,
    }));
    sessionService.update(state.currentSessionId, {
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
      messages,
    }).catch(e => console.error('saveCurrentSession failed:', e));
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
  addMessage: (role, content, files?, isFileOnly?) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set(state => ({
      conversationHistory: [...state.conversationHistory, { role, content, timestamp: new Date(), files, isFileOnly, id }],
      streamingMessageId: role === 'assistant' ? id : null,
    }));
    return id;
  },

  updateStreamingMessage: (text) => set(state => {
    if (!state.streamingMessageId) return state;
    const history = [...state.conversationHistory];
    const idx = history.findIndex((m: any) => (m as any).id === state.streamingMessageId);
    if (idx === -1) return state;
    history[idx] = { ...history[idx], content: (history[idx].content || '') + text };
    return { conversationHistory: history };
  }),

  clearStreamingMessage: () => set({ streamingMessageId: null }),

  setLastAssistantMessage: (text) => set(state => {
    const history = [...state.conversationHistory];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        history[i] = { ...history[i], content: text };
        return { conversationHistory: history };
      }
    }
    return state;
  }),

  clearHistory: () => set({ conversationHistory: [] }),

  // === API ===
  addApiRequest: (url, headers, body) => {
    const id = `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const truncatedBody = body.length > MAX_API_REQUEST_BODY_SIZE ? truncateResult(body, MAX_API_REQUEST_BODY_SIZE) : body;
    set(state => ({
      apiInteractions: [...state.apiInteractions, { id, timestamp: new Date(), request: { url, headers, body: truncatedBody }, response: null }]
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
        thinkingEnabled: state.thinkingEnabled,
        thinkingBudget: state.thinkingBudget,
        temperature: state.temperature,
        apiKey: state.apiKey,
        apiBaseUrl: state.apiBaseUrl,
        apiModel: state.apiModel,
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
      // For preset scenes, always use the latest systemPrompt from DEFAULT_SCENES
      if (config.currentScene) {
        const presetScene = DEFAULT_SCENES.find(s => s.id === config.currentScene);
        if (presetScene) {
          restore.systemPrompt = presetScene.systemPrompt;
        } else if (config.systemPrompt) {
          restore.systemPrompt = config.systemPrompt;
        }
      } else if (config.systemPrompt) {
        restore.systemPrompt = config.systemPrompt;
      }
      if (config.selectedTools) restore.selectedTools = config.selectedTools.filter(
        (tid: string) => AVAILABLE_TOOLS.some(t => t.id === tid)
      );
      if (config.contextSize) restore.contextSize = config.contextSize;
      if (typeof config.sidebarOpen === 'boolean') restore.sidebarOpen = config.sidebarOpen;
      if (typeof config.thinkingEnabled === 'boolean') restore.thinkingEnabled = config.thinkingEnabled;
      if (config.thinkingBudget) restore.thinkingBudget = config.thinkingBudget;
      if (typeof config.temperature === 'number') restore.temperature = config.temperature;
      // API 配置优先从 .env 取（.env 变了就不从 localStorage 恢复旧值）
      if (config.apiKey && !import.meta.env.VITE_CLAUDE_API_KEY) restore.apiKey = config.apiKey;
      if (config.apiBaseUrl && !import.meta.env.VITE_CLAUDE_BASE_URL) restore.apiBaseUrl = config.apiBaseUrl;
      if (config.apiModel && !import.meta.env.VITE_CLAUDE_MODEL) restore.apiModel = config.apiModel;

      // 不恢复上次会话，每次打开都是新建对话（欢迎页）
      // if (config.currentSessionId) {
      //   const session = sessionService.getById(config.currentSessionId);
      //   if (session) {
      //     restore.currentSessionId = config.currentSessionId;
      //     restore.currentScene = session.sceneId;
      //     const presetScene = DEFAULT_SCENES.find(s => s.id === session.sceneId);
      //     restore.systemPrompt = presetScene ? presetScene.systemPrompt : session.systemPrompt;
      //     restore.selectedTools = [...session.selectedTools].filter(
      //       tid => AVAILABLE_TOOLS.some(t => t.id === tid)
      //     );
      //     restore.contextStrategy = session.contextStrategy;
      //     restore.contextSize = session.contextSize;
      //     restore.conversationHistory = session.messages.map(m => ({
      //       role: m.role,
      //       content: m.content,
      //       files: m.files,
      //       isFileOnly: m.isFileOnly,
      //       timestamp: new Date(m.timestamp),
      //     }));
      //   }
      // }

      set(restore);
    } catch { /* ignore corrupt data */ }
  },

  resetPromptForScene: (sceneId: SceneType) => {
    const scene = get().scenes.find(s => s.id === sceneId);
    if (scene) set({ systemPrompt: scene.systemPrompt });
  },
}));

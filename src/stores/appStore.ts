// src/stores/appStore.ts
import { create } from 'zustand';

// 直接定义类型，避免导入问题
type SceneType = 'restaurant' | 'research' | 'dialog' | 'custom';
type ContextStrategy = 'sliding' | 'full' | 'summary' | 'none';

interface TimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;  // 新增
  expanded: boolean;    // 新增
  details?: {          // 新增
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
  toolInfo: {
    name: string;
    description: string;
    parameters: any;
  };
  callContext: {
    systemPrompt: string;
    userQuery: string;
    conversationHistory: string[];
  };
  toolOutput: any;
  reorganizedContext: string;
  toolUseReasoning: string;
}

interface ApiInteraction {
  id: string;
  timestamp: Date;
  request: {
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    duration: number;
  } | null;
}

interface AppState {
  // 场景与策略
  currentScene: SceneType;
  contextStrategy: ContextStrategy;

  // 系统提示词
  systemPrompt: string;

  // 工具配置
  selectedTools: string[];
  availableTools: Array<{ id: string; name: string; description: string; icon: string }>;

  // 上下文窗口
  contextSize: number;

  // UI状态
  showDetails: boolean;
  isLoading: boolean;

  // 对话过程时间线
  timelineSteps: TimelineStep[];
  currentStepIndex: number;
  lastUserInput: string;

  // 对话历史
  conversationHistory: Message[];

  // API交互记录
  apiInteractions: ApiInteraction[];

  // 状态设置方法
  setScene: (scene: SceneType) => void;
  setSystemPrompt: (prompt: string) => void;
  toggleTool: (toolId: string) => void;
  setStrategy: (strategy: ContextStrategy) => void;
  setContextSize: (size: number) => void;

  // 时间线控制方法
  resetTimeline: () => void;
  updateTimelineStep: (stepId: string, description: string, active?: boolean, completed?: boolean) => void;
  nextTimelineStep: () => void;
  setLastUserInput: (input: string) => void;

  // 对话历史管理
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  clearHistory: () => void;

  // API交互记录管理
  addApiRequest: (url: string, headers: Record<string, string>, body: string) => string;
  addApiResponse: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => void;

  // 工具方法
  saveUserConfig: () => void;
  loadUserConfig: () => void;
  resetPromptForScene: (scene: SceneType) => void;
  loadPromptForScene: (scene: SceneType) => string;
  loadToolsForScene: (scene: SceneType) => string[];

  // 工具管理
  selectAllTools: () => void;
  clearAllTools: () => void;

  // 步骤展开/收起
  toggleStepExpanded: (stepId: string) => void;
  // 设置步骤详情
  setStepDetails: (stepId: string, details: any) => void;
  // 清除步骤详情
  clearStepDetails: (stepId: string) => void;
  // 记录工具调用详细信息
  recordToolInteraction: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentScene: 'restaurant',
  contextStrategy: 'sliding',
  systemPrompt: "你是一个专业的餐厅预订助手...",
  selectedTools: ['xueqiu-search', 'xueqiu-quote'],
  contextSize: 32768,
  showDetails: false,
  isLoading: false,

  // 可用工具列表（只包含实际配置的 MCP 工具）
  availableTools: [
    { id: 'xueqiu-search', name: '📈 雪球搜索', description: '在雪球上搜索股票、基金、投资信息', icon: '📈' },
    { id: 'xueqiu-quote', name: '💰 股票行情', description: '获取实时股票行情、涨跌幅、成交量信息', icon: '💰' },
    { id: 'xueqiu-news', name: '📰 投资资讯', description: '获取最新财经新闻、公司公告、研报信息', icon: '📰' },
    { id: 'tradingview-chart', name: '📊 图表分析', description: '查看TradingView图表进行技术分析', icon: '📊' },
    { id: 'akshare-data', name: '🔢 数据获取', description: '使用AkShare获取各种金融市场数据', icon: '🔢' },
    { id: 'akshare-indicator', name: '📉 指标计算', description: '计算各种技术指标、财务指标', icon: '📉' }
  ],

  // 对话历史
  conversationHistory: [],

  // API交互记录
  apiInteractions: [],

  // 时间线状态
  timelineSteps: [
    {
      id: 'user-input',
      icon: '💬',
      title: '用户输入',
      description: '等待用户输入...',
      active: true,
      completed: false,
      expandable: false,
      expanded: false
    },
    {
      id: 'context-pack',
      icon: '🧠',
      title: '上下文打包',
      description: '准备打包上下文...',
      active: false,
      completed: false,
      expandable: false,
      expanded: false
    },
    {
      id: 'tool-call',
      icon: '🔧',
      title: '工具调用',
      description: '准备调用工具...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'result-pack',
      icon: '📦',
      title: '结果打包',
      description: '准备打包结果...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'api-reorganize',
      icon: '📄',
      title: '重新组织上下文报文',
      description: '准备重新组织上下文...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'agent-response',
      icon: '🤖',
      title: '智能体响应',
      description: '等待大模型响应...',
      active: false,
      completed: false,
      expandable: false,
      expanded: false
    }
  ],
  currentStepIndex: 0,
  lastUserInput: '',

  setScene: (scene: SceneType) => {
    const { loadPromptForScene, loadToolsForScene } = get();
    set({
      currentScene: scene,
      systemPrompt: loadPromptForScene(scene),
      selectedTools: loadToolsForScene(scene)
    });
  },

  setSystemPrompt: (prompt: string) => {
    set({ systemPrompt: prompt });
  },

  toggleTool: (toolId: string) => set((state) => ({
    selectedTools: state.selectedTools.includes(toolId)
      ? state.selectedTools.filter(id => id !== toolId)
      : [...state.selectedTools, toolId]
  })),

  setStrategy: (strategy: ContextStrategy) => {
    set({ contextStrategy: strategy });
  },

  setContextSize: (size: number) => {
    set({ contextSize: size });
  },

  saveUserConfig: () => {
    const state = get();
    const config = {
      currentScene: state.currentScene,
      contextStrategy: state.contextStrategy,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextSize: state.contextSize
    };
    localStorage.setItem('context-lab.config', JSON.stringify(config));
  },

  loadUserConfig: () => {
    const saved = localStorage.getItem('context-lab.config');
    if (saved) {
      const config = JSON.parse(saved);
      set(config);
    }
  },

  // 场景数据方法
  loadPromptForScene: (scene: SceneType) => {
    const prompts: Record<SceneType, string> = {
      restaurant: "你是一个专业的餐厅预订助手，帮助用户查询和预订餐厅。可以使用搜索和时间工具。",
      research: "你是一个专业的投资研究助手，帮助用户分析股票、市场和投资机会。可以使用雪球搜索和AkShare数据工具。",
      dialog: "你是一个对话分析助手，帮助用户分析对话内容、情感和主题。",
      custom: ""
    };
    return prompts[scene] || "";
  },

  loadToolsForScene: (scene: SceneType) => {
    const toolSets: Record<SceneType, string[]> = {
      restaurant: ["xueqiu-search", "xueqiu-quote"], // 模拟使用投资工具
      research: ["xueqiu-search", "akshare-data"], // 投资研究场景
      dialog: [],
      custom: []
    };
    return toolSets[scene] || [];
  },

  // 时间线控制方法
  resetTimeline: () => {
    set({
      timelineSteps: [
        {
          id: 'user-input',
          icon: '💬',
          title: '用户输入',
          description: '等待用户输入...',
          active: true,
          completed: false,
          expandable: false,
          expanded: false
        },
        {
          id: 'context-pack',
          icon: '🧠',
          title: '上下文打包',
          description: '准备打包上下文...',
          active: false,
          completed: false,
          expandable: false,
          expanded: false
        },
        {
          id: 'tool-call',
          icon: '🔧',
          title: '工具调用',
          description: '准备调用工具...',
          active: false,
          completed: false,
          expandable: true,
          expanded: false
        },
        {
          id: 'result-pack',
          icon: '📦',
          title: '结果打包',
          description: '准备打包结果...',
          active: false,
          completed: false,
          expandable: true,
          expanded: false
        },
        {
          id: 'api-reorganize',
          icon: '📄',
          title: '重新组织上下文报文',
          description: '准备重新组织上下文...',
          active: false,
          completed: false,
          expandable: true,
          expanded: false
        },
        {
          id: 'agent-response',
          icon: '🤖',
          title: '智能体响应',
          description: '等待大模型响应...',
          active: false,
          completed: false,
          expandable: false,
          expanded: false
        }
      ],
      currentStepIndex: 0,
      lastUserInput: ''
    });
  },

  updateTimelineStep: (stepId: string, description: string, active?: boolean, completed?: boolean) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, description, active: active ?? step.active, completed: completed ?? step.completed } : step
      )
    }));
  },

  nextTimelineStep: () => {
    set(state => {
      if (state.currentStepIndex < state.timelineSteps.length - 1) {
        const newIndex = state.currentStepIndex + 1;
        return {
          timelineSteps: state.timelineSteps.map((step, index) => ({
            ...step,
            active: index === newIndex,
            completed: index < newIndex
          })),
          currentStepIndex: newIndex
        };
      }
      return state;
    });
  },

  setLastUserInput: (input: string) => {
    set({ lastUserInput: input });
  },

  // 对话历史管理
  addMessage: (role: 'user' | 'assistant', content: string) => {
    set(state => ({
      conversationHistory: [
        ...state.conversationHistory,
        { role, content, timestamp: new Date() }
      ]
    }));
  },

  clearHistory: () => {
    set({ conversationHistory: [] });
  },

  // 工具管理
  selectAllTools: () => {
    set(state => ({
      selectedTools: state.availableTools.map(tool => tool.id)
    }));
  },

  clearAllTools: () => {
    set(state => ({
      selectedTools: []
    }));
  },

  // 步骤展开/收起
  toggleStepExpanded: (stepId: string) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, expanded: !step.expanded } : step
      )
    }));
  },

  // 设置步骤详情
  setStepDetails: (stepId: string, details: any) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details } : step
      )
    }));
  },

  // 清除步骤详情
  clearStepDetails: (stepId: string) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details: undefined } : step
      )
    }));
  },

  // 记录工具调用详细信息
  recordToolInteraction: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => {
    const details: ToolInteractionDetails = {
      type: 'tool',
      toolInfo: {
        name: toolName,
        description: toolDescription,
        parameters: parameters
      },
      callContext: callContext,
      toolOutput: toolOutput,
      reorganizedContext: reorganizedContext,
      toolUseReasoning: reasoning
    };

    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details } : step
      )
    }));
  },

  // API交互记录管理
  addApiRequest: (url: string, headers: Record<string, string>, body: string) => {
    const id = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set(state => ({
      apiInteractions: [
        ...state.apiInteractions,
        {
          id,
          timestamp: new Date(),
          request: { url, headers, body },
          response: null
        }
      ]
    }));
    return id;
  },

  addApiResponse: (id: string, status: number, headers: Record<string, string>, body: string, duration: number) => {
    set(state => ({
      apiInteractions: state.apiInteractions.map(interaction =>
        interaction.id === id
          ? { ...interaction, response: { status, headers, body, duration } }
          : interaction
      )
    }));
  },

  resetPromptForScene: (scene: SceneType) => {
    const defaultPrompt = get().loadPromptForScene(scene);
    set({ systemPrompt: defaultPrompt });
  }
}));

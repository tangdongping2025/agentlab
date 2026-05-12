// src/stores/appStore.ts
import { create } from 'zustand';
import { SceneType, ContextStrategy } from '../types';

interface AppState {
  // 场景与策略
  currentScene: SceneType;
  contextStrategy: ContextStrategy;

  // 系统提示词
  systemPrompt: string;

  // 工具配置
  selectedTools: string[];

  // 上下文窗口
  contextSize: number;

  // UI状态
  showDetails: boolean;
  isLoading: boolean;

  // 状态设置方法
  setScene: (scene: SceneType) => void;
  setSystemPrompt: (prompt: string) => void;
  toggleTool: (toolId: string) => void;
  setStrategy: (strategy: ContextStrategy) => void;
  setContextSize: (size: number) => void;

  // 工具方法
  saveUserConfig: () => void;
  loadUserConfig: () => void;
  resetPromptForScene: (scene: SceneType) => void;
  loadPromptForScene: (scene: SceneType) => string;
  loadToolsForScene: (scene: SceneType) => string[];
}

export const useAppStore = create<AppState>((set, get) => ({
  currentScene: 'restaurant',
  contextStrategy: 'sliding',
  systemPrompt: "你是一个专业的餐厅预订助手...",
  selectedTools: ['search', 'time'],
  contextSize: 32768,
  showDetails: false,
  isLoading: false,

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
      restaurant: "你是一个专业的餐厅预订助手...",
      research: "你是一个研究论文助手...",
      dialog: "你是一个对话分析助手...",
      custom: ""
    };
    return prompts[scene] || "";
  },

  loadToolsForScene: (scene: SceneType) => {
    const toolSets: Record<SceneType, string[]> = {
      restaurant: ["search", "time"],
      research: ["search", "calculator"],
      dialog: [],
      custom: []
    };
    return toolSets[scene] || [];
  },

  resetPromptForScene: (scene: SceneType) => {
    const defaultPrompt = get().loadPromptForScene(scene);
    set({ systemPrompt: defaultPrompt });
  }
}));

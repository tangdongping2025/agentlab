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
}

export const useAppStore = create<AppState>((set, get) => ({
  currentScene: 'restaurant',
  contextStrategy: 'sliding',
  systemPrompt: '',
  selectedTools: ['search', 'time'],
  contextSize: 32768,
  showDetails: false,
  isLoading: false,

  setScene: (scene: SceneType) => {
    set({ currentScene: scene });
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
  }
}));

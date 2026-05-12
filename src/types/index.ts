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
  systemPrompt: string;
  tools: string[];
}

export interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  total: number;
}

export type ContextStrategy = 'sliding' | 'full' | 'summary' | 'none';

export type SceneType = 'restaurant' | 'research' | 'dialog' | 'custom';

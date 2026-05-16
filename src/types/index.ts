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

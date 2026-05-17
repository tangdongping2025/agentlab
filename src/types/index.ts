// src/types/index.ts
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  url: string;
  content: string;
  encoding?: string; // 新增：编码信息
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
  isFileOnly?: boolean; // 新增：是否是单独文件消息
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

export interface StrategyEffect {
  strategy: ContextStrategy;
  triggered: boolean;
  beforeMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  afterMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  removedMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  summaryContent?: string;
  beforeTokenCount: number;
  afterTokenCount: number;
  degraded?: boolean;
  degradeReason?: string;
  summaryDuration?: number;      // 摘要生成耗时(ms)
  summarySourceCount?: number;   // 被摘要的消息数
  summarySourceTokens?: number;  // 被摘要的消息 token 数
}

export type SceneType = string; // 'restaurant' | 'research' | 'dialog' | 'custom' | custom UUID

export interface Session {
  id: string;
  name: string;
  sceneId: string;
  systemPrompt: string;
  selectedTools: string[];
  contextStrategy: ContextStrategy;
  contextSize: number;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

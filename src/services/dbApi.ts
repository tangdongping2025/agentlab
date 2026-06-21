import type { Session } from '../types/index';

const BASE = '/api/db';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`dbApi ${options.method || 'GET'} ${path} -> ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export interface SessionListItem {
  id: string;
  name?: string;
  sceneId?: string;
  agentId?: string;
  preview: string;
  totalTokens: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QueryParams {
  q?: string;
  scene?: string;
  agent?: string;
  start?: string;
  end?: string;
  min_token?: number;
  max_token?: number;
  page?: number;
  size?: number;
}

export interface QueryResult {
  items: SessionListItem[];
  total: number;
  page: number;
  size: number;
}

export type InsightKind = 'habit' | 'knowledge';
export type InsightStatus = 'accepted' | 'ignored';

export interface PersistedInsightItem {
  id: string;
  kind: InsightKind;
  title: string;
  description: string;
  sourceSessionIds: string[];
  status: InsightStatus;
  enabledForPrompt: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateInsightItemInput {
  kind: InsightKind;
  title: string;
  description: string;
  sourceSessionIds: string[];
  status: InsightStatus;
}

export interface WorkspaceSettings {
  environment: 'windows' | 'container';
  rootDir: string;
  cwd: string;
  cwdHistory: string[];
}

export interface SaveWorkspaceSettingsInput {
  cwd: string;
  cwdHistory: string[];
}

export interface ExportDocxResult {
  mdPath: string;
  docxPath: string;
  downloadUrl: string;
}

export interface SessionMessageItem {
  seq: number;
  role: 'user' | 'assistant' | string;
  content: string;
  timestamp?: string;
  tokenUsage?: { input?: number; output?: number };
}

export interface MessageWindowResult {
  messages: SessionMessageItem[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  oldestSeq: number | null;
  newestSeq: number | null;
  total: number;
}

export interface MessageIndexItem {
  messageSeq: number;
  role: 'user' | 'assistant';
  title: string;
  preview: string;
  timestamp?: string;
}

export interface MessageIndexResult {
  items: MessageIndexItem[];
}

export const dbApi = {
  health: () => req<{ status: string }>('/health'),
  listSessions: () => req<Session[]>('/sessions'),
  getSession: (id: string) => req<Session>(`/sessions/${id}`),
  getSessionMessages: (id: string, params: { beforeSeq?: number; aroundSeq?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) qs.set(key, String(value));
    });
    const query = qs.toString();
    return req<MessageWindowResult>(`/sessions/${id}/messages${query ? `?${query}` : ''}`);
  },
  appendSessionMessages: (
    id: string,
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      tokenUsage?: { input?: number; output?: number };
    }>
  ) => req<MessageWindowResult>(`/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ messages }) }),
  getSessionMessageIndex: (id: string) => req<MessageIndexResult>(`/sessions/${id}/message-index`),
  createSession: (data: Record<string, unknown>) =>
    req<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id: string, data: Record<string, unknown>) =>
    req<Session>(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSession: (id: string) => req<{ deleted: string }>(`/sessions/${id}`, { method: 'DELETE' }),
  deleteAllSessions: () => req<null>('/sessions', { method: 'DELETE' }),
  querySessions: (params: QueryParams) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
    ).toString();
    return req<QueryResult>(`/sessions/query?${qs}`);
  },
  migrate: (sessions: Session[]) =>
    req<{ imported: number; skipped: number }>('/migrate', { method: 'POST', body: JSON.stringify({ sessions }) }),
  listInsights: () => req<{ items: PersistedInsightItem[] }>('/insights'),
  createInsight: (payload: CreateInsightItemInput) =>
    req<PersistedInsightItem>('/insights', { method: 'POST', body: JSON.stringify(payload) }),
  updateInsight: (id: string, payload: { enabledForPrompt?: boolean }) =>
    req<PersistedInsightItem>(`/insights/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteInsight: (id: string) => req<{ ok: boolean }>(`/insights/${id}`, { method: 'DELETE' }),
  // files 端点挂在 /api/db/files 下(复用 /api/db proxy:dev vite + prod nginx 都已转发)
  fetchRootDir: () => req<{ root_dir: string }>('/files/root'),
  fetchWorkspaceSettings: () => req<WorkspaceSettings>('/files/workspace-settings'),
  saveWorkspaceSettings: (payload: SaveWorkspaceSettingsInput) =>
    req<WorkspaceSettings>('/files/workspace-settings', { method: 'PUT', body: JSON.stringify(payload) }),
  exportDocx: (payload: { cwd: string; markdown: string }) =>
    req<ExportDocxResult>('/files/export-docx', { method: 'POST', body: JSON.stringify(payload) }),
  listFiles: (dir: string) =>
    req<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>(`/files?dir=${encodeURIComponent(dir)}`),
  readFile: (path: string) =>
    req<{ name: string; size: number; content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
  // download 返回 URL(浏览器 a[href download] 直接拉文件流,不走 req 的 JSON 解析)
  downloadFile: (path: string) =>
    `${BASE}/files/download?path=${encodeURIComponent(path)}`,
};

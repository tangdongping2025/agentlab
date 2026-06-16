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

export const dbApi = {
  health: () => req<{ status: string }>('/health'),
  listSessions: () => req<Session[]>('/sessions'),
  getSession: (id: string) => req<Session>(`/sessions/${id}`),
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
  // files 端点挂在 /api/db/files 下(复用 /api/db proxy:dev vite + prod nginx 都已转发)
  fetchRootDir: () => req<{ root_dir: string }>('/files/root'),
  listFiles: (dir: string) =>
    req<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>(`/files?dir=${encodeURIComponent(dir)}`),
  readFile: (path: string) =>
    req<{ name: string; size: number; content: string }>(`/files/read?path=${encodeURIComponent(path)}`),
  // download 返回 URL(浏览器 a[href download] 直接拉文件流,不走 req 的 JSON 解析)
  downloadFile: (path: string) =>
    `${BASE}/files/download?path=${encodeURIComponent(path)}`,
};

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
  // files 端点在 /api/files(独立于 /api/db),用独立 fetch 不走 dbApi.req 的 /api/db BASE
  listFiles: async (dir: string) => {
    const res = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`);
    if (!res.ok) throw new Error(`listFiles failed: ${res.status}`);
    return res.json() as Promise<Array<{ name: string; mtime: number; size: number; is_dir: boolean }>>;
  },
};

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

export interface WatchlistItem {
  id: number;
  ts_code: string;
  name: string;
  note?: string | null;
  add_time?: string | null;
}

export interface WatchlistQuoteItem extends WatchlistItem {
  close?: number | null;
  pct_chg?: number | null;
  pe?: number | null;
  pb?: number | null;
  total_mv?: number | null;
}

export interface CandidateItem {
  id: number; rank: number; ts_code: string; name: string; industry?: string;
  score: number; pe_rank: number; roe_rank: number; momentum_rank: number;
  promoted: boolean;
}
export interface CandidateSnapshot {
  id: number; run_at?: string; as_of_date?: string;
  strategy_name: string; strategy_label?: string; count: number; params?: Record<string, unknown>;
}
export interface CandidateStrategies {
  strategies: { name: string; label: string }[];
  presets: Record<string, Record<string, unknown>>;
}
export interface BacktestPoint { date: string; strategy: number; benchmark: number; }
export interface BacktestResult {
  equity: BacktestPoint[];
  drawdown: { date: string; value: number }[];
  metrics: {
    ann_return: number | null; bench_ann_return: number | null; excess: number | null;
    sharpe: number | null; max_drawdown: number | null; calmar: number | null; win_rate: number | null;
  };
  ic?: { date: string; ic: number }[];
  icir?: number | null;
  ic_win_rate?: number | null;
  as_of?: string; params?: Record<string, unknown>; caveats: string[];
  backtest_id?: number;
}

export type BacktestVerdict = '靠谱' | '谨慎' | '不靠谱' | null;
export interface BacktestHistoryItem {
  id: number; created_at?: string; strategy: string; strategy_label?: string;
  start_date?: string; end_date?: string;
  ann_return?: number | null; excess?: number | null; max_drawdown?: number | null;
  ai_verdict?: BacktestVerdict;
}
export interface BacktestAnalyzeResult {
  verdict: string; comment: string; analyzed_at?: string;
}
export interface BacktestDetail extends BacktestHistoryItem {
  params?: Record<string, unknown>; metrics?: Record<string, unknown>;
  equity_first?: number | null; equity_last?: number | null;
  benchmark_last?: number | null; points_count?: number;
  ai_comment?: string | null; ai_analyzed_at?: string | null;
}

export interface KlinePoint {
  date: string;            // YYYYMMDD
  close: number;
  ma5: number | null; ma10: number | null; ma20: number | null;
  ma60: number | null;
}
export interface KlineBenchmarkPoint { date: string; value: number | null }
export interface KlineBenchmark { name: string; code: string; points: KlineBenchmarkPoint[] }
export interface KlineResult {
  ts_code: string;
  freq: 'daily' | 'weekly' | 'monthly';
  source: 'local' | 'tushare';
  points: KlinePoint[];
  benchmark?: KlineBenchmark | null;
}

export interface Drawdown {
  value: number; peak_date: string; peak_price: number;
  trough_date: string; trough_price: number; days: number;
  recover_days: number | null; recover_date: string | null; recovered: boolean;
  high_date?: string; high_price?: number;
}

export interface RiskWindow {
  n_days: number; start: string; end: string;
  ann_ret: number; rf: number; excess: number;
  ann_vol: number; downside_vol: number | null;
  sharpe: number | null; sortino: number | null;
}

export interface StockDetail {
  basic: { name: string; industry: string; market: string; list_date: string };
  as_of_date?: string;
  fina_end_date?: string;
  quotes: { close: number | null; pe_ttm: number | null; pb: number | null; total_mv: number | null; dv_ttm: number | null };
  score: {
    total: number; verdict: string;
    dim_scores: Record<string, number>;
    dim_labels: Record<string, string>;
    dim_reasons: Record<string, string>;
  };
  growth: { rev_cagr_3y: number | null; np_cagr_3y: number | null; np_yoy: number | null };
  profit: { roe: number | null; gross_margin: number | null; net_margin: number | null; cash_ratio: number | null };
  value: { pe_now: number | null; pe_pct: number | null; peg: number | null };
  trend: { ret_1w?: number | null; ret_1m?: number | null; ret_3m?: number | null;
           ret_6m?: number | null; ret_1y: number | null; ret_3y?: number | null; above_ma60: boolean };
  safety: {
    debt_ratio: number | null; current_ratio: number | null; max_dd: number | null;
    max_dd_detail?: Drawdown | null;
    drawdowns?: Drawdown[];
    risk_windows?: {
      y1: RiskWindow | null; y3: RiskWindow | null; all: RiskWindow | null;
    };
    calmar?: number | null;
    ann_ret_all?: number | null;
    var_detail?: { value: number; cvar: number | null; n_days: number; tail_n: number; start: string; end: string } | null;
  };
  buffett?: BuffettCheck;
}

export interface BuffettCheck {
  conclusion: {
    verdict: string;
    one_liner: string;
    counts: { green: number; yellow: number; red: number; gray: number };
  };
  eight_questions: { n: number; dimension: string; light: 'green' | 'yellow' | 'red' | 'gray'; explain: string }[];
  moat: { signal: string; type: string; strength: string; trend: string };
  financials: { metric: string; value: number | null; light: string; explain: string }[];
  valuation: { pe: number | null; pe_pct: number | null; explain: string; margin_of_safety: string };
  risks: string[];
  summary: string;
  industry_matched: string;
  as_of_date?: string;
  fina_end_date?: string;
}

export interface SessionMessageInput {
  role: 'user' | 'assistant' | string;
  content: string;
  timestamp?: string;
  tokenUsage?: Record<string, unknown>;
  toolsUsed?: unknown[];
  timelineStepIndex?: number;
  files?: unknown[];
  isFileOnly?: boolean;
  thinkingContent?: string;
  thinkingTokens?: number;
}

export interface SessionMessageItem extends SessionMessageInput {
  seq: number;
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

export interface FetchStatus {
  stock_daily: number; fundamental_pit: number; index_constituent: number; stock_basic: number;
  last_anchor_date: string | null; last_updated_at: string | null;
}
export interface FetchProgress {
  state: 'idle' | 'running' | 'done' | 'failed';
  done: number; total: number; current_code: string; fail: number;
  started_at: string | null; finished_at: string | null; error: string | null;
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
  appendSessionMessages: (id: string, messages: SessionMessageInput[]) =>
    req<MessageWindowResult>(`/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify({ messages }) }),
  deleteSessionMessagesFromSeq: (id: string, fromSeq: number) =>
    req<{ deleted: number }>(`/sessions/${id}/messages?fromSeq=${fromSeq}`, { method: 'DELETE' }),
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
  // 自选股(invest agent P1)
  listWatchlist: () => req<WatchlistItem[]>('/watchlist'),
  listWatchlistQuotes: (refresh?: boolean) =>
    req<WatchlistQuoteItem[]>(`/watchlist/quotes${refresh ? '?refresh=true' : ''}`),
  pinWatchlist: (ts_code: string, name: string, note?: string) =>
    req<WatchlistItem>('/watchlist', { method: 'POST', body: JSON.stringify({ ts_code, name, note }) }),
  unpinWatchlist: (ts_code: string) =>
    req<{ deleted: string }>(`/watchlist/${encodeURIComponent(ts_code)}`, { method: 'DELETE' }),
  getStockDetail: (ts_code: string) =>
    req<StockDetail>(`/watchlist/stock-detail/${encodeURIComponent(ts_code)}`),
  aiDeepdive: (ts_code: string, dimension: 'moat_type' | 'management_integrity', force = false) =>
    req<{ dimension: string; text: string | null; cached: boolean; cached_at?: string }>(
      `/watchlist/stock-detail/${encodeURIComponent(ts_code)}/ai-deepdive`,
      { method: 'POST', body: JSON.stringify({ dimension, force }) }
    ),
  getKline: (ts_code: string, freq: 'daily' | 'weekly' | 'monthly', limit = 120) =>
    req<KlineResult>(`/watchlist/stock-detail/${encodeURIComponent(ts_code)}/kline?freq=${freq}&limit=${limit}`),
  // 候选池(invest agent P2)
  listCandidateStrategies: () => req<CandidateStrategies>('/candidates/strategies'),
  listCandidateSnapshots: () => req<CandidateSnapshot[]>('/candidates/snapshots'),
  listCandidates: (snapshotId?: number) =>
    req<{ snapshot_id: number | null; items: CandidateItem[] }>(
      `/candidates${snapshotId ? `?snapshot_id=${snapshotId}` : ''}`),
  runCandidates: (payload: { strategy: string; label?: string; params?: Record<string, unknown> }) =>
    req<{ snapshot_id: number; count: number; as_of_date?: string }>(
      '/candidates/run', { method: 'POST', body: JSON.stringify(payload) }),
  runBacktest: (payload: { strategy: string; label?: string; params?: Record<string, unknown>;
                           cadence?: string; start?: string; end?: string; cost?: number;
                           weighting?: 'equal' | 'min_var' | 'risk_parity' }) =>
    req<BacktestResult>('/candidates/backtest', { method: 'POST', body: JSON.stringify(payload) }),
  analyzeBacktest: (id: number) =>
    req<BacktestAnalyzeResult>(`/candidates/backtest/${id}/analyze`, { method: 'POST' }),
  listBacktestHistory: () => req<BacktestHistoryItem[]>('/candidates/backtest/history'),
  getBacktestDetail: (id: number) => req<BacktestDetail>(`/candidates/backtest/${id}`),
  deleteBacktest: (id: number) => req<{ deleted: number }>(`/candidates/backtest/${id}`, { method: 'DELETE' }),
  promoteCandidate: (snapshotId: number, tsCode: string) =>
    req<{ promoted: string; already_in_watchlist: boolean }>(
      `/candidates/${snapshotId}/promote/${encodeURIComponent(tsCode)}`, { method: 'POST' }),
  // 数据管理(invest agent P3)
  getFetchStatus: () => req<FetchStatus>('/fetch/status'),
  triggerFetch: (force_full = false) =>
    req<{ job_id: string; state: string }>('/fetch/trigger', { method: 'POST', body: JSON.stringify({ force_full }) }),
  getFetchProgress: () => req<FetchProgress>('/fetch/progress'),
};

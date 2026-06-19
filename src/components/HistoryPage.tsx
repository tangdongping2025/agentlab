import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type SessionListItem, type QueryParams, type PersistedInsightItem, type InsightKind } from '../services/dbApi';
import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

type DetailSession = { id: string; agentId?: string | null; messages?: any[]; name?: string; preview?: string; updatedAt?: string } & Record<string, unknown>;
type InsightSource = { id: string; name: string; agentId?: string; preview?: string; updatedAt?: string };
type InsightItem = { title: string; description: string; sources: InsightSource[] };
type Insights = { habits: InsightItem[]; topics: InsightItem[] };

interface Props {
  onBack: () => void;
  onResumeSession?: (session: DetailSession) => void;
}

const WARM = {
  shell: '#F5F1EB',
  card: '#FFFDF9',
  selected: '#F7F2FF',
  border: '#D6CFC4',
  subtleBorder: '#E6DED2',
  blue: '#2563EB',
  user: '#EFF6FF',
};

const warmCardStyle: React.CSSProperties = {
  background: WARM.card,
  border: `1px solid ${WARM.border}`,
  borderRadius: '16px',
  boxShadow: '0 10px 24px rgba(80, 64, 48, 0.06)',
};

const smallButtonStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '13px',
  background: WARM.card,
  border: `1px solid ${WARM.border}`,
  borderRadius: '10px',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const pillButtonStyle: React.CSSProperties = {
  padding: '4px 9px',
  fontSize: '12px',
  background: 'rgba(37, 99, 235, 0.08)',
  border: '1px solid rgba(37, 99, 235, 0.18)',
  borderRadius: '999px',
  color: WARM.blue,
  cursor: 'pointer',
};

const AGENT_COLORS = ['#5b9cf5', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee'];
function agentColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

const HABIT_RULES = [
  { title: '偏好先设计和计划', description: '多次提到设计、规格或计划，适合先明确方案再实现。', words: ['设计', '规格', '计划'] },
  { title: '重视验证和验收', description: '多次提到验证或验收，说明完成判断需要可检查证据。', words: ['验证', '验收', '测试'] },
  { title: '倾向精简界面噪音', description: '多次要求去掉、隐藏或弱化界面元素，偏好聚焦主题。', words: ['不要', '去掉', '隐藏', '弱化'] },
  { title: '关注上下文恢复', description: '多次讨论恢复、继续或历史上下文，说明可恢复性很重要。', words: ['恢复', '继续', '历史'] },
];

const TOPIC_STOPWORDS = new Set(['这个', '那个', '当前', '可以', '一个', '一些', '实际', '用户', '使用者', '会话', '功能', '页面', '我们', '是否', '通过']);

function sessionText(session: DetailSession) {
  const messages = (session.messages || [])
    .filter(m => m.role === 'user')
    .map(m => m.content || '')
    .join(' ');
  return `${session.name || ''} ${session.preview || ''} ${messages}`;
}

function sourceFromSession(session: DetailSession): InsightSource {
  return {
    id: session.id,
    name: session.name || session.id,
    agentId: session.agentId || undefined,
    preview: session.preview,
    updatedAt: session.updatedAt,
  };
}

function buildInsights(sessions: DetailSession[]): Insights {
  const habits = HABIT_RULES.map(rule => {
    const sources = sessions.filter(session => rule.words.some(word => sessionText(session).includes(word))).map(sourceFromSession);
    return sources.length ? { title: rule.title, description: rule.description, sources } : null;
  }).filter((item): item is InsightItem => Boolean(item));

  const topicMap = new Map<string, InsightSource[]>();
  sessions.forEach(session => {
    const text = sessionText(session);
    const tokens = Array.from(text.matchAll(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9-]{2,}/gu)).map(m => m[0]);
    Array.from(new Set(tokens)).forEach(token => {
      if (TOPIC_STOPWORDS.has(token)) return;
      const sources = topicMap.get(token) || [];
      sources.push(sourceFromSession(session));
      topicMap.set(token, sources);
    });
  });

  const topics = Array.from(topicMap.entries())
    .filter(([, sources]) => sources.length >= 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 6)
    .map(([topic, sources]) => ({
      title: topic,
      description: `在 ${sources.length} 个历史会话中出现，可作为后续知识库素材候选。`,
      sources,
    }));

  return { habits, topics };
}

function InsightSection({ title, items, onOpenSource, onAccept, onIgnore }: { title: string; items: InsightItem[]; onOpenSource: (source: InsightSource) => void; onAccept?: (item: InsightItem, kind: InsightKind) => void; onIgnore?: (item: InsightItem) => void }) {
  return (
    <section style={{ ...warmCardStyle, padding: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '15px' }}>{title}</h3>
      {items.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>暂无候选洞察</div>}
      {items.map(item => (
        <div key={item.title} style={{ marginBottom: '12px', padding: '12px', border: `1px solid ${WARM.subtleBorder}`, borderRadius: '14px', background: '#FFFFFF' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>{item.title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>{item.description}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
            {item.sources.map(source => (
              <button key={`${item.title}-${source.id}`} onClick={() => onOpenSource(source)} style={pillButtonStyle}>
                {source.name}
              </button>
            ))}
          </div>
          {onAccept && onIgnore && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              <button onClick={() => onAccept(item, 'habit')} style={pillButtonStyle}>采纳为习惯</button>
              <button onClick={() => onAccept(item, 'knowledge')} style={pillButtonStyle}>采纳为知识素材</button>
              <button onClick={() => onIgnore(item)} style={{ ...pillButtonStyle, color: 'var(--text-tertiary)', background: 'transparent', borderColor: WARM.border }}>忽略</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export default function HistoryPage({ onBack, onResumeSession }: Props) {
  const agents = useAgentRuntimeStore(s => s.agents);
  const [mode, setMode] = useState<'recovery' | 'insights' | 'library'>('recovery');
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SessionListItem | null>(null);
  const [detail, setDetail] = useState<DetailSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightAnalyzed, setInsightAnalyzed] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [insights, setInsights] = useState<Insights>({ habits: [], topics: [] });
  const [persistedInsights, setPersistedInsights] = useState<PersistedInsightItem[]>([]);
  const size = 20;

  const runQuery = useCallback(async () => {
    setLoading(true);
    const params: QueryParams = { page, size };
    if (q) params.q = q;
    if (agent) params.agent = agent;
    if (start) params.start = start;
    if (end) params.end = end;
    try {
      const res = await dbApi.querySessions(params);
      const visible = agent ? res.items : res.items.filter(i => i.agentId);
      setItems(visible);
      setTotal(res.total);
    } catch (e) {
      console.error('query failed', e);
    } finally {
      setLoading(false);
    }
  }, [q, agent, start, end, page]);

  useEffect(() => { runQuery(); }, [runQuery]);
  useEffect(() => {
    if (mode === 'library') loadPersistedInsights();
  }, [mode]);

  const openDetail = async (item: SessionListItem) => {
    setSelected(item);
    setDetail(null);
    try {
      const full = await dbApi.getSession(item.id) as DetailSession;
      setDetail({ ...full, messages: full.messages || [] });
    } catch (e) {
      console.error('load detail failed', e);
    }
  };

  const insightKey = (title: string, sourceIds: string[]) => `${title}::${[...sourceIds].sort().join(',')}`;

  const loadPersistedInsights = async () => {
    const res = await dbApi.listInsights();
    setPersistedInsights(res.items);
    return res.items;
  };

  const filterIgnoredInsights = (candidateInsights: Insights, saved: PersistedInsightItem[]): Insights => {
    const ignored = new Set(saved.filter(item => item.status === 'ignored').map(item => insightKey(item.title, item.sourceSessionIds)));
    const visible = (items: InsightItem[]) => items.filter(item => !ignored.has(insightKey(item.title, item.sources.map(source => source.id))));
    return { habits: visible(candidateInsights.habits), topics: visible(candidateInsights.topics) };
  };

  const loadInsights = async () => {
    setInsightLoading(true);
    setInsightError('');
    try {
      const saved = await loadPersistedInsights();
      const res = await dbApi.querySessions({ page: 1, size: 20 });
      const agentSessions = res.items.filter(item => item.agentId);
      const fullSessions = await Promise.all(agentSessions.map(async item => {
        const full = await dbApi.getSession(item.id) as DetailSession;
        return { ...full, name: full.name || item.name, preview: item.preview, updatedAt: full.updatedAt || item.updatedAt };
      }));
      setInsights(filterIgnoredInsights(buildInsights(fullSessions), saved));
      setInsightAnalyzed(true);
    } catch (e) {
      console.error('load insights failed', e);
      setInsights({ habits: [], topics: [] });
      setInsightError('历史洞察分析失败，请检查后端服务或稍后重试。');
      setInsightAnalyzed(true);
    } finally {
      setInsightLoading(false);
    }
  };

  const acceptInsight = async (item: InsightItem, kind: InsightKind) => {
    await dbApi.createInsight({
      kind,
      title: item.title,
      description: item.description,
      sourceSessionIds: item.sources.map(source => source.id),
      status: 'accepted',
    });
    await loadPersistedInsights();
  };

  const ignoreInsight = async (item: InsightItem) => {
    await dbApi.createInsight({
      kind: 'habit',
      title: item.title,
      description: item.description,
      sourceSessionIds: item.sources.map(source => source.id),
      status: 'ignored',
    });
    const key = insightKey(item.title, item.sources.map(source => source.id));
    setInsights(current => ({
      habits: current.habits.filter(candidate => insightKey(candidate.title, candidate.sources.map(source => source.id)) !== key),
      topics: current.topics.filter(candidate => insightKey(candidate.title, candidate.sources.map(source => source.id)) !== key),
    }));
    await loadPersistedInsights();
  };

  const updatePersistedInsightPrompt = async (id: string, enabledForPrompt: boolean) => {
    await dbApi.updateInsight(id, { enabledForPrompt });
    await loadPersistedInsights();
  };

  const deletePersistedInsight = async (id: string) => {
    await dbApi.deleteInsight(id);
    await loadPersistedInsights();
  };

  const openInsightSource = (source: InsightSource) => {
    setMode('recovery');
    openDetail({ id: source.id, name: source.name, agentId: source.agentId, preview: source.preview || '', totalTokens: 0, updatedAt: source.updatedAt });
  };

  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: '13px', background: '#FFFFFF',
    border: `1px solid ${WARM.border}`, borderRadius: '10px', color: 'var(--text-primary)',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    ...smallButtonStyle,
    borderRadius: '999px',
    background: active ? WARM.blue : WARM.card,
    borderColor: active ? WARM.blue : WARM.border,
    color: active ? '#FFFFFF' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 500,
  });

  const textValue = (value: unknown) => (typeof value === 'string' || typeof value === 'number') ? String(value) : '';
  const agentName = (id?: string | null) => id ? agents.find(a => a.id === id)?.name || id : '未知';
  const shortSessionId = (id: string) => id.length > 8 ? `${id.slice(0, 8)}…` : id;

  return (
    <div data-testid="history-page-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '18px', background: WARM.shell }}>
      {/* 顶栏 */}
      <div style={{ ...warmCardStyle, display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px', padding: '14px 16px' }}>
        <button onClick={onBack} style={smallButtonStyle}>← 返回对话</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>历史会话</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginTop: '4px' }}>找回上下文并继续工作</div>
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>共 {total} 条</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button onClick={() => setMode('recovery')} style={tabStyle(mode === 'recovery')}>会话恢复</button>
        <button onClick={() => setMode('insights')} style={tabStyle(mode === 'insights')}>历史洞察</button>
        <button onClick={() => setMode('library')} style={tabStyle(mode === 'library')}>沉淀库</button>
      </div>

      {mode === 'recovery' && <>
      {/* 筛选条 */}
      <div data-testid="history-filter-card" style={{ ...warmCardStyle, display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', padding: '12px' }}>
        <input style={{ ...inputStyle, minWidth: '220px' }} placeholder="🔍 搜索关键词" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <select style={inputStyle} value={agent} onChange={e => { setAgent(e.target.value); setPage(1); }}>
          <option value="">全部 agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" style={inputStyle} value={start} onChange={e => { setStart(e.target.value); setPage(1); }} />
        <input type="date" style={inputStyle} value={end} onChange={e => { setEnd(e.target.value); setPage(1); }} />
        <button style={{ ...smallButtonStyle, background: WARM.blue, borderColor: WARM.blue, color: '#FFFFFF' }} onClick={() => runQuery()}>查询</button>
      </div>

      {/* 主体：左列表 + 右详情 */}
      <div style={{ flex: 1, display: 'flex', gap: '16px', overflow: 'hidden' }}>
        <div data-testid="history-session-list-pane" style={{ ...warmCardStyle, flex: '0 0 360px', overflowY: 'auto', padding: '12px' }}>
          {loading && <div style={{ padding: '16px', color: 'var(--text-tertiary)' }}>加载中…</div>}
          {!loading && items.length === 0 && <div style={{ padding: '16px', color: 'var(--text-tertiary)' }}>无匹配会话</div>}
          {items.map(item => {
            const selectedItem = selected?.id === item.id;
            return (
            <div data-testid={`history-session-card-${item.id}`} key={item.id} onClick={() => openDetail(item)} style={{
              padding: '14px 16px', cursor: 'pointer', marginBottom: '10px', borderRadius: '14px',
              border: selectedItem ? `1px solid ${WARM.blue}` : `1px solid ${WARM.subtleBorder}`,
              background: selectedItem ? WARM.selected : WARM.card,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name || '未命名'}</span>
                  {item.agentId && (
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 999,
                      color: agentColor(item.agentId),
                      border: `1px solid ${agentColor(item.agentId)}40`,
                      background: `${agentColor(item.agentId)}14`,
                      flexShrink: 0,
                    }}>
                      {agents.find(a => a.id === item.agentId)?.name || item.agentId}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmt(item.updatedAt)}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.55 }}>
                {item.preview || '暂无预览'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
                更新于 {fmt(item.updatedAt) || '未知'}
              </div>
            </div>
          );})}
          {/* 分页 */}
          {total > size && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '12px' }}>
              <button style={inputStyle} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span style={{ alignSelf: 'center', fontSize: '13px' }}>{page} / {Math.ceil(total / size)}</span>
              <button style={inputStyle} disabled={page * size >= total} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}
        </div>

        {/* 详情面板 */}
        <div data-testid="history-detail-pane" style={{ ...warmCardStyle, flex: '1.4 1 0%', overflowY: 'auto', padding: '20px' }}>
          {!selected && <div style={{ color: 'var(--text-tertiary)' }}>选择左侧会话查看详情</div>}
          {selected && !detail && <div style={{ color: 'var(--text-tertiary)' }}>加载中…</div>}
          {selected && detail && (
            <div style={{ marginBottom: '16px', padding: '14px', border: `1px solid ${WARM.subtleBorder}`, borderRadius: '14px', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>会话信息</div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{textValue(detail.name) || selected.name || '未命名'}</div>
                </div>
                {detail.agentId && onResumeSession && (
                  <button onClick={() => onResumeSession(detail)} style={{ ...smallButtonStyle, background: WARM.blue, borderColor: WARM.blue, color: '#FFFFFF' }}>
                    继续这个上下文
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                <div>Agent：{agentName(detail.agentId)}</div>
                <div>更新：{fmt(textValue(detail.updatedAt) || selected.updatedAt) || '未知'}</div>
                <div>Session：{shortSessionId(detail.id)}</div>
              </div>
            </div>
          )}
          {selected && detail && detail.messages.map((m, i) => {
            const isUser = m.role === 'user';
            return (
            <div data-testid={`history-message-${isUser ? 'user' : 'assistant'}-${i}`} key={i} style={{ marginBottom: '16px', padding: '18px 20px', border: `1px solid ${isUser ? 'rgba(37, 99, 235, 0.2)' : WARM.subtleBorder}`, borderRadius: '18px', background: isUser ? WARM.user : WARM.card }}>
              <div style={{ fontSize: '13px', color: isUser ? WARM.blue : '#4B5563', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <span>{isUser ? '👤 用户' : '🤖 助手'}</span>
                {m.timestamp && <span style={{ color: '#6B7280', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{fmt(m.timestamp)}</span>}
              </div>
              <div data-testid={`history-message-body-${i}`} style={{ fontSize: '16px', whiteSpace: 'pre-wrap', color: '#1F2937', lineHeight: 1.85, maxWidth: '860px' }}>{m.content}</div>
            </div>
          );})}
        </div>
      </div>
      </>}

      {mode === 'insights' && (
        <div style={{ ...warmCardStyle, flex: 1, overflowY: 'auto', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>从历史 agent 会话中提炼候选洞察，结果需要人工采纳或忽略。</div>
            <button onClick={loadInsights} disabled={insightLoading} style={{ ...smallButtonStyle, background: WARM.blue, borderColor: WARM.blue, color: '#FFFFFF' }}>
              {insights.habits.length || insights.topics.length ? '重新分析' : '分析历史会话'}
            </button>
          </div>
          {insightLoading && <div style={{ color: 'var(--text-tertiary)' }}>正在分析历史会话…</div>}
          {!insightLoading && insightError && <div style={{ color: 'var(--accent-red)', fontSize: '13px' }}>{insightError}</div>}
          {!insightLoading && !insightError && insights.habits.length === 0 && insights.topics.length === 0 && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
              {insightAnalyzed ? '未分析到候选洞察' : '点击“分析历史会话”后生成使用习惯和关注主题候选。'}
            </div>
          )}
          {!insightLoading && (insights.habits.length > 0 || insights.topics.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <InsightSection title="使用习惯候选" items={insights.habits} onOpenSource={openInsightSource} onAccept={acceptInsight} onIgnore={ignoreInsight} />
              <InsightSection title="关注主题候选" items={insights.topics} onOpenSource={openInsightSource} onAccept={acceptInsight} onIgnore={ignoreInsight} />
            </div>
          )}
        </div>
      )}

      {mode === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            {(['habit', 'knowledge'] as InsightKind[]).map(kind => (
              <section key={kind} style={{ ...warmCardStyle, padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '15px' }}>{kind === 'habit' ? '用户习惯库' : '知识素材池'}</h3>
                {persistedInsights.filter(item => item.kind === kind && item.status === 'accepted').length === 0 && (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>暂无沉淀内容</div>
                )}
                {persistedInsights.filter(item => item.kind === kind && item.status === 'accepted').map(item => (
                  <div key={item.id} style={{ marginBottom: '12px', padding: '12px', border: `1px solid ${WARM.subtleBorder}`, borderRadius: '14px', background: '#FFFFFF' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>{item.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>{item.description}</div>
                    {kind === 'habit' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input type="checkbox" checked={item.enabledForPrompt} onChange={e => updatePersistedInsightPrompt(item.id, e.target.checked)} />
                          用于智能体提示词
                        </label>
                        {item.enabledForPrompt && <span style={{ color: WARM.blue }}>已生效</span>}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                      {item.sourceSessionIds.map(sourceId => (
                        <button key={`${item.id}-${sourceId}`} onClick={() => openInsightSource({ id: sourceId, name: sourceId })} style={pillButtonStyle}>
                          {sourceId}
                        </button>
                      ))}
                      <button onClick={() => deletePersistedInsight(item.id)} style={{ ...pillButtonStyle, color: 'var(--text-tertiary)', background: 'transparent', borderColor: WARM.border }}>删除</button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

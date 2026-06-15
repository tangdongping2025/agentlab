import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type SessionListItem, type QueryParams } from '../services/dbApi';
import { useAppStore } from '../stores/appStore';
import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

interface Props {
  onBack: () => void;
}

const AGENT_COLORS = ['#5b9cf5', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#22d3ee'];
function agentColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

export default function HistoryPage({ onBack }: Props) {
  const scenes = useAppStore(s => s.scenes);
  const agents = useAgentRuntimeStore(s => s.agents);
  const [q, setQ] = useState('');
  const [scene, setScene] = useState('');
  const [agent, setAgent] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [minToken, setMinToken] = useState('');
  const [maxToken, setMaxToken] = useState('');
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SessionListItem | null>(null);
  const [detail, setDetail] = useState<{ messages: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const size = 20;

  const runQuery = useCallback(async () => {
    setLoading(true);
    const params: QueryParams = { page, size };
    if (q) params.q = q;
    if (scene) params.scene = scene;
    if (agent) params.agent = agent;
    if (start) params.start = start;
    if (end) params.end = end;
    if (minToken) params.min_token = Number(minToken);
    if (maxToken) params.max_token = Number(maxToken);
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
  }, [q, scene, agent, start, end, minToken, maxToken, page]);

  useEffect(() => { runQuery(); }, [runQuery]);

  const openDetail = async (item: SessionListItem) => {
    setSelected(item);
    setDetail(null);
    try {
      const full = await dbApi.getSession(item.id);
      setDetail({ messages: full.messages || [] });
    } catch (e) {
      console.error('load detail failed', e);
    }
  };

  const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: '13px', background: 'var(--bg-surface)',
    border: '1px solid var(--border-default)', borderRadius: '5px', color: 'var(--text-primary)',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <button onClick={onBack} style={inputStyle}>← 返回对话</button>
        <span style={{ fontSize: '16px', fontWeight: 700 }}>📚 历史会话</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>共 {total} 条</span>
      </div>

      {/* 筛选条 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <input style={inputStyle} placeholder="🔍 搜索关键词" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <select style={inputStyle} value={scene} onChange={e => { setScene(e.target.value); setPage(1); }}>
          <option value="">全部场景</option>
          {scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select style={inputStyle} value={agent} onChange={e => { setAgent(e.target.value); setPage(1); }}>
          <option value="">全部 agent</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" style={inputStyle} value={start} onChange={e => { setStart(e.target.value); setPage(1); }} />
        <input type="date" style={inputStyle} value={end} onChange={e => { setEnd(e.target.value); setPage(1); }} />
        <input style={{ ...inputStyle, width: '90px' }} type="number" placeholder="min token" value={minToken} onChange={e => { setMinToken(e.target.value); setPage(1); }} />
        <input style={{ ...inputStyle, width: '90px' }} type="number" placeholder="max token" value={maxToken} onChange={e => { setMaxToken(e.target.value); setPage(1); }} />
        <button style={inputStyle} onClick={() => runQuery()}>查询</button>
      </div>

      {/* 主体：左列表 + 右详情 */}
      <div style={{ flex: 1, display: 'flex', gap: '16px', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
          {loading && <div style={{ padding: '16px', color: 'var(--text-tertiary)' }}>加载中…</div>}
          {!loading && items.length === 0 && <div style={{ padding: '16px', color: 'var(--text-tertiary)' }}>无匹配会话</div>}
          {items.map(item => (
            <div key={item.id} onClick={() => openDetail(item)} style={{
              padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
              background: selected?.id === item.id ? 'rgba(91,156,245,0.08)' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{item.name || '未命名'}</span>
                  {item.agentId && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      color: agentColor(item.agentId),
                      border: `1px solid ${agentColor(item.agentId)}40`,
                      background: `${agentColor(item.agentId)}14`,
                    }}>
                      {agents.find(a => a.id === item.agentId)?.name || item.agentId}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{fmt(item.updatedAt)}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {item.preview} · {item.totalTokens} tokens
              </div>
            </div>
          ))}
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
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px' }}>
          {!selected && <div style={{ color: 'var(--text-tertiary)' }}>选择左侧会话查看详情</div>}
          {selected && !detail && <div style={{ color: 'var(--text-tertiary)' }}>加载中…</div>}
          {selected && detail && detail.messages.map((m, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: m.role === 'user' ? 'var(--accent-blue)' : 'var(--text-tertiary)', marginBottom: '4px' }}>
                {m.role === 'user' ? '👤 用户' : '🤖 助手'}
              </div>
              <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

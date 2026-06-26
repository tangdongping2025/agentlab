import React, { useEffect, useState } from 'react';
import { dbApi, type WatchlistItem } from '../../services/dbApi';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b6155' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#1A1A1A' };

const WatchlistPanel: React.FC = () => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await dbApi.listWatchlist());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 16, color: '#888' }}>加载中…</div>;
  if (error) return (
    <div style={{ padding: 16 }}>
      <div style={{ color: 'var(--accent-red, #d9534f)', marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: '6px 14px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
    </div>
  );
  if (items.length === 0) {
    return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>还没有自选股。在对话中关注一只股票,AI 会主动推荐加入。</div>;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }} data-testid="watchlist-panel">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#F0E7DA' }}>
            <th style={th}>代码</th>
            <th style={th}>名称</th>
            <th style={th}>备注</th>
            <th style={th}>加入时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.ts_code} style={{ borderBottom: '1px solid #E5DCC9' }}>
              <td style={td}>{it.ts_code}</td>
              <td style={td}>{it.name}</td>
              <td style={td}>{it.note || '—'}</td>
              <td style={td}>{it.add_time || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WatchlistPanel;

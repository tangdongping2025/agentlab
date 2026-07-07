import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type WatchlistQuoteItem } from '../../services/dbApi';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b6155', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#1A1A1A', whiteSpace: 'nowrap' };

function fmtMV(v?: number | null): string {
  if (v == null) return '—';
  return (v / 10000).toFixed(1) + ' 亿';
}
function fmtNum(v?: number | null, digits = 2): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}
function pctColor(v?: number | null): string {
  if (v == null || v === 0) return '#888';
  if (v > 0) return '#d9534f';
  return '#5cb85c';
}

const WatchlistPanel: React.FC = () => {
  const [items, setItems] = useState<WatchlistQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setItems(await dbApi.listWatchlistQuotes(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      await dbApi.pinWatchlist(trimmed);
      setCode('');
      await load(true);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (ts_code: string) => {
    try {
      await dbApi.unpinWatchlist(ts_code);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="watchlist-panel">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          data-testid="watchlist-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入股票代码，如 600519"
          disabled={adding}
          style={{
            flex: 1, padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6,
            fontSize: 13, outline: 'none', background: '#fff',
          }}
        />
        <button
          data-testid="watchlist-add-btn"
          onClick={handleAdd}
          disabled={!code.trim() || adding}
          style={{
            padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 13,
            cursor: (!code.trim() || adding) ? 'not-allowed' : 'pointer',
            background: (!code.trim() || adding) ? '#E5DCC9' : '#2b6cb0',
            color: '#fff', whiteSpace: 'nowrap',
          }}
        >
          {adding ? '添加中…' : '📈 添加'}
        </button>
        <button
          onClick={() => load(true)}
          data-testid="watchlist-refresh-btn"
          style={{ padding: '4px 12px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
        >
          🔄
        </button>
      </div>
      {addError && (
        <div style={{ color: 'var(--accent-red, #d9534f)', fontSize: 12 }}>{addError}</div>
      )}
      {loading ? (
        <div style={{ padding: 16, color: '#888' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: 16 }}>
          <div style={{ color: 'var(--accent-red, #d9534f)', marginBottom: 8 }}>{error}</div>
          <button onClick={() => load()} style={{ padding: '6px 14px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>还没有自选股。输入股票代码添加，或在对话中让 AI 推荐。</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#F0E7DA' }}>
              <th style={th}>代码</th>
              <th style={th}>名称</th>
              <th style={{ ...th, textAlign: 'right' }}>现价</th>
              <th style={{ ...th, textAlign: 'right' }}>涨跌幅%</th>
              <th style={{ ...th, textAlign: 'right' }}>PE</th>
              <th style={{ ...th, textAlign: 'right' }}>PB</th>
              <th style={{ ...th, textAlign: 'right' }}>总市值</th>
              <th style={{ ...th, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const note = it.note ? `备注:${it.note}\n` : '';
              const addTime = it.add_time ? `加入:${it.add_time}` : '';
              return (
                <tr key={it.ts_code} title={`${note}${addTime}`} style={{ borderBottom: '1px solid #E5DCC9' }}>
                  <td style={td}>{it.ts_code}</td>
                  <td style={td}>{it.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.close)}</td>
                  <td style={{ ...td, textAlign: 'right', color: pctColor(it.pct_chg) }}>
                    {it.pct_chg == null ? '—' : (it.pct_chg > 0 ? '+' : '') + fmtNum(it.pct_chg)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.pe)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.pb)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtMV(it.total_mv)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      data-testid={`watchlist-delete-${it.ts_code}`}
                      onClick={() => handleDelete(it.ts_code)}
                      title="删除"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0 }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default WatchlistPanel;

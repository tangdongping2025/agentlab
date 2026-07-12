import React, { useEffect, useState, useRef } from 'react';
import { dbApi, type FetchStatus, type FetchProgress } from '../../services/dbApi';

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#6b6155', fontSize: 12 };
const td: React.CSSProperties = { padding: '8px 10px', color: '#1A1A1A', fontSize: 12 };
const TABLES: { key: 'stock_daily' | 'fundamental_pit' | 'index_constituent' | 'stock_basic'; cn: string; desc: string }[] = [
  { key: 'stock_daily', cn: '日线行情', desc: 'close/复权因子/PE/总市值(每股每日)' },
  { key: 'fundamental_pit', cn: '财务 PIT', desc: 'ROE/毛利率/负债率(按披露日对齐)' },
  { key: 'index_constituent', cn: '指数成分', desc: '沪深300 成分股 + 权重(历史快照)' },
  { key: 'stock_basic', cn: '基础信息', desc: '名称/行业/上市日/市场(本地持久化,免查 tushare)' },
];

const DataManagementPanel: React.FC = () => {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadStatus = async () => {
    try { setStatus(await dbApi.getFetchStatus()); }
    catch { setError('状态加载失败'); }
  };
  const stopPolling = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startPolling = () => {
    stopPolling();
    timerRef.current = window.setInterval(async () => {
      try {
        const p = await dbApi.getFetchProgress(); setProgress(p);
        if (p.state === 'done') { stopPolling(); loadStatus(); setNotice('✓ 抓取完成'); }
        else if (p.state === 'failed') { stopPolling(); loadStatus(); setNotice(null); }
        else setNotice(`⏳ 后台抓取进行中:${p.done}/${p.total}(${p.total ? Math.round(p.done / p.total * 100) : 0}%)`);
      } catch { /* 忽略轮询瞬时错误 */ }
    }, 2000);
  };
  useEffect(() => {
    loadStatus();
    dbApi.getFetchProgress().then(p => {
      setProgress(p);
      if (p.state === 'running') {
        setNotice(`⏳ 检测到后台抓取进行中:${p.done}/${p.total},无需重复触发`);
        startPolling();
      }
    }).catch(() => {});
    return () => stopPolling();
  }, []);

  const trigger = async (force_full: boolean) => {
    setError(null); setNotice(null);
    try {
      setProgress({ state: 'running', done: 0, total: 0, current_code: '', fail: 0, started_at: null, finished_at: null, error: null });
      await dbApi.triggerFetch(force_full);
      setNotice('⏳ 已触发抓取,进行中...');
      startPolling();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '触发失败';
      if (msg.includes('409')) {
        const p = await dbApi.getFetchProgress().catch(() => null);
        if (p && p.state === 'running') {
          setProgress(p);
          setNotice(`⏳ 已有抓取任务在跑:${p.done}/${p.total}(${p.total ? Math.round(p.done / p.total * 100) : 0}%),等待完成即可,无需重复触发`);
          startPolling();
          return;
        }
      }
      setError(msg); setProgress(null);
    }
  };

  const mode = status?.last_anchor_date ? '增量' : '全量';
  const pct = progress && progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  const running = progress?.state === 'running';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="data-mgmt-panel">
      {/* 数据状态表格 */}
      <div style={{ background: '#EFE7DA', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>数据状态</span>
          {status?.last_updated_at && <span style={{ fontWeight: 400, color: '#8a8178', fontSize: 12 }}>更新于 {status.last_updated_at.slice(0, 19).replace('T', ' ')}</span>}
          {status?.last_anchor_date && <span style={{ fontWeight: 400, color: '#8a8178', fontSize: 12 }}>锚点 {status.last_anchor_date}</span>}
        </div>
        {status ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
            <thead><tr style={{ background: '#F0E7DA' }}>
              <th style={th}>表名</th><th style={th}>中文</th><th style={{ ...th, textAlign: 'right' }}>行数</th><th style={th}>作用</th>
            </tr></thead>
            <tbody>
              {TABLES.map(t => (
                <tr key={t.key} style={{ borderBottom: '1px solid #E5DCC9' }}>
                  <td style={td}><code style={{ background: '#ECE4D6', padding: '1px 5px', borderRadius: 3 }}>{t.key}</code></td>
                  <td style={{ ...td, fontWeight: 600 }}>{t.cn}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#2b6cb0' }}>{Number(status[t.key]).toLocaleString()}</td>
                  <td style={{ ...td, color: '#8a8178' }}>{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <span style={{ color: '#888' }}>加载中…</span>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button data-testid="fetch-trigger-btn" onClick={() => trigger(false)} disabled={running}
          style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: running ? '#8aa8c9' : '#2b6cb0', color: '#fff', cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '抓取中…' : `📡 抓取数据(${mode})`}
        </button>
        <button data-testid="fetch-force-full-btn" onClick={() => trigger(true)} disabled={running}
          style={{ padding: '8px 16px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', cursor: running ? 'not-allowed' : 'pointer' }}>
          🔧 强制全量修复
        </button>
      </div>

      {notice && <div style={{ color: '#2b6cb0', fontSize: 12, background: '#EAF1F8', padding: '6px 10px', borderRadius: 6 }}>{notice}</div>}
      {error && <div style={{ color: '#d9534f', fontSize: 12 }}>{error}</div>}

      {progress && progress.state !== 'idle' && (
        <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>状态:<b>{progress.state}</b> · {progress.done}/{progress.total}({pct}%) · 当前 {progress.current_code} · 失败 {progress.fail}</div>
          <div style={{ height: 8, background: '#E5DCC9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#2b6cb0', transition: 'width 0.5s' }} />
          </div>
          {progress.state === 'done' && <div style={{ color: '#5cb85c', marginTop: 8 }}>✓ 抓取完成</div>}
          {progress.state === 'failed' && <div style={{ color: '#d9534f', marginTop: 8 }}>✗ {progress.error}</div>}
        </div>
      )}
    </div>
  );
};
export default DataManagementPanel;

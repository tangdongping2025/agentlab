import React, { useEffect, useState, useRef } from 'react';
import { dbApi, type FetchStatus, type FetchProgress } from '../../services/dbApi';

const DataManagementPanel: React.FC = () => {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadStatus = async () => {
    try { setStatus(await dbApi.getFetchStatus()); }
    catch { setError('状态加载失败'); }
  };
  useEffect(() => { loadStatus(); }, []);

  const stopPolling = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startPolling = () => {
    stopPolling();
    timerRef.current = window.setInterval(async () => {
      try {
        const p = await dbApi.getFetchProgress(); setProgress(p);
        if (p.state === 'done' || p.state === 'failed') { stopPolling(); loadStatus(); }
      } catch { /* 忽略轮询瞬时错误 */ }
    }, 2000);
  };
  useEffect(() => () => stopPolling(), []);

  const trigger = async (force_full: boolean) => {
    setError(null);
    setProgress({ state: 'running', done: 0, total: 0, current_code: '', fail: 0, started_at: null, finished_at: null, error: null });
    try { await dbApi.triggerFetch(force_full); startPolling(); }
    catch (e) { setError(e instanceof Error ? e.message : '触发失败'); setProgress(null); }
  };

  const mode = status?.last_anchor_date ? '增量' : '全量';
  const pct = progress && progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  const running = progress?.state === 'running';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="data-mgmt-panel">
      <div style={{ background: '#EFE7DA', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>数据状态</div>
        {status ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, color: '#6b6155' }}>
            <span>日线:<b>{status.stock_daily}</b> 行</span>
            <span>基本面:<b>{status.fundamental_pit}</b> 行</span>
            <span>成分:<b>{status.index_constituent}</b> 行</span>
            <span>锚点:<b>{status.last_anchor_date || '无(首次将全量)'}</b></span>
          </div>
        ) : <span>加载中…</span>}
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

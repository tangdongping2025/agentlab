import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, AreaChart, Area, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { dbApi, type BacktestResult } from '../../services/dbApi';

const PRESET_LABELS = ['多因子平衡', '价值+质量', '纯动量', '价值+动量', '自定义'] as const;
// ML 策略:label -> strategy 名(后端 ml_ridge/ml_lightgbm);选中时走 ML 分支(无 label)
const ML_STRATEGIES: Record<string, string> = { 'Ridge': 'ml_ridge', 'LightGBM': 'ml_lightgbm' };

const BacktestPanel: React.FC = () => {
  const [label, setLabel] = useState<string>('多因子平衡');
  const [cadence, setCadence] = useState<string>('monthly');
  const [weighting, setWeighting] = useState('equal');
  const [start, setStart] = useState('20200101');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isML = label in ML_STRATEGIES;

  const handleRun = useCallback(async () => {
    setRunning(true); setError(null);
    try {
      if (isML) {
        setResult(await dbApi.runBacktest({ strategy: ML_STRATEGIES[label], cadence, start, weighting }));
      } else {
        const payload: { strategy: string; cadence: string; start: string; label: string; weighting: string; params?: Record<string, number> } =
          { strategy: 'rank_composite', cadence, start, label, weighting };
        if (label === '自定义') payload.params = { w_pe: 30, w_roe: 30, w_mom: 40 };  // 自定义占位(可扩面板)
        setResult(await dbApi.runBacktest(payload));
      }
    } catch (e) { setError(e instanceof Error ? e.message : '回测失败'); }
    finally { setRunning(false); }
  }, [label, cadence, start, weighting, isML]);
  // 不自动跑——用户点【📊 回测】才触发(避免 mount 时无意义请求)

  const m = result?.metrics;
  const Tile = ({ k, v, color }: { k: string; v: string | number | null; color?: string }) => (
    <div style={{ flex: 1, minWidth: 90, background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#8a8178' }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || '#1A1A1A' }}>{v}</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="backtest-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6b6155' }}>策略</span>
        <select data-testid="backtest-strategy-select" value={label} onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #2b6cb0', borderRadius: 6, background: '#fff', fontSize: 13, fontWeight: 600, color: '#2b6cb0' }}>
          {PRESET_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          {Object.keys(ML_STRATEGIES).map(l => <option key={l} value={l}>{l} (ML)</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#6b6155' }}>频率</span>
        <select data-testid="backtest-cadence-select" value={cadence} onChange={(e) => setCadence(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
          <option value="monthly">月频</option><option value="quarterly">季频</option>
        </select>
        <span style={{ fontSize: 12, color: '#6b6155' }}>加权</span>
        <select data-testid="backtest-weighting-select" value={weighting} onChange={(e) => setWeighting(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
          <option value="equal">等权</option><option value="min_var">最小方差</option><option value="risk_parity">风险平价</option>
        </select>
        <span style={{ fontSize: 12, color: '#6b6155' }}>起</span>
        <input value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 80, padding: '6px 8px', border: '1px solid #D6CFC4', borderRadius: 6, fontSize: 13 }} />
        <button data-testid="backtest-run-btn" onClick={handleRun} disabled={running}
          style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: running ? '#8aa8c9' : '#2b6cb0', color: '#fff', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '回测中…' : '📊 回测'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--accent-red,#d9534f)', fontSize: 12 }}>{error}</div>}
      {result?.caveats?.map((c, i) => (
        <div key={i} style={{ color: '#b8860b', fontSize: 12, background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '4px 8px' }}>⚠️ {c}</div>
      ))}

      {m && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tile k="年化" v={m.ann_return != null ? (m.ann_return * 100).toFixed(1) + '%' : '—'} color="#d9534f" />
          <Tile k="基准" v={m.bench_ann_return != null ? (m.bench_ann_return * 100).toFixed(1) + '%' : '—'} color="#8a8178" />
          <Tile k="超额" v={m.excess != null ? (m.excess * 100).toFixed(1) + '%' : '—'} color="#2b6cb0" />
          <Tile k="Sharpe" v={m.sharpe ?? '—'} />
          <Tile k="最大回撤" v={m.max_drawdown != null ? (m.max_drawdown * 100).toFixed(1) + '%' : '—'} color="#5cb85c" />
          <Tile k="Calmar" v={m.calmar ?? '—'} />
          <Tile k="胜率" v={m.win_rate != null ? (m.win_rate * 100).toFixed(0) + '%' : '—'} />
        </div>
      )}

      {result && result.equity.length > 1 && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6155', marginBottom: 6 }}>净值曲线(基准=1.0)</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={result.equity}>
                <CartesianGrid stroke="#EFE7DA" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="strategy" stroke="#2b6cb0" strokeWidth={2} dot={false} name="策略" />
                <Line type="monotone" dataKey="benchmark" stroke="#b3aa9c" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="基准" />
                <Brush dataKey="date" height={20} stroke="#2b6cb0" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6155', marginBottom: 6 }}>水下回撤</div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={result.drawdown}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#d9534f" fill="rgba(217,83,79,0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {result && result.ic && result.ic.length > 1 && (
        <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6155', marginBottom: 6 }}>IC 时序</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={result.ic}>
              <CartesianGrid stroke="#EFE7DA" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="ic" fill="#2b6cb0" name="IC" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Tile k="ICIR" v={result.icir ?? '—'} />
            <Tile k="IC 胜率" v={result.ic_win_rate != null ? (result.ic_win_rate * 100).toFixed(0) + '%' : '—'} />
          </div>
        </div>
      )}
      {!result && !running && <div style={{ color: '#888', fontSize: 13 }}>选好策略点【📊 回测】。</div>}
    </div>
  );
};
export default BacktestPanel;

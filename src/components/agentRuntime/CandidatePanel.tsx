import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type CandidateItem, type CandidateSnapshot, type CandidateStrategies } from '../../services/dbApi';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#6b6155', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', color: '#1A1A1A', whiteSpace: 'nowrap' };

const PRESET_LABELS = ['多因子平衡', '价值+质量', '纯动量', '价值+动量', '自定义'] as const;
// ML 策略:label -> strategy 名(后端 ml_ridge/ml_lightgbm);选中时走 ML 分支(无 label/因子权重)
const ML_STRATEGIES: Record<string, string> = { 'Ridge': 'ml_ridge', 'LightGBM': 'ml_lightgbm' };

const CandidatePanel: React.FC = () => {
  const [strategies, setStrategies] = useState<CandidateStrategies | null>(null);
  const [snapshots, setSnapshots] = useState<CandidateSnapshot[]>([]);
  const [current, setCurrent] = useState<{ snapshot_id: number | null; items: CandidateItem[] }>({ snapshot_id: null, items: [] });
  const [label, setLabel] = useState<string>('多因子平衡');
  const [weights, setWeights] = useState({ w_pe: 30, w_roe: 30, w_mom: 40 });
  const [window, setWindow] = useState(252);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openStockTab = useAgentRuntimeStore(s => s.openStockTab);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, snaps, cur] = await Promise.all([
        dbApi.listCandidateStrategies(), dbApi.listCandidateSnapshots(), dbApi.listCandidates(),
      ]);
      setStrategies(s); setSnapshots(snaps); setCurrent(cur);
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const weightSum = weights.w_pe + weights.w_roe + weights.w_mom;
  const isCustom = label === '自定义';
  const isML = label in ML_STRATEGIES;

  const buildParams = () => isCustom
    ? { w_pe: weights.w_pe / 100, w_roe: weights.w_roe / 100, w_mom: weights.w_mom / 100, window }
    : undefined;

  const handleRun = async () => {
    setRunning(true); setError(null);
    try {
      if (isML) {
        await dbApi.runCandidates({ strategy: ML_STRATEGIES[label] });
      } else {
        await dbApi.runCandidates({ strategy: 'rank_composite', label, params: buildParams() });
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '跑策略失败'); }
    finally { setRunning(false); }
  };

  const handlePromote = async (it: CandidateItem) => {
    if (!current.snapshot_id) return;
    try { await dbApi.promoteCandidate(current.snapshot_id, it.ts_code); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : '晋升失败'); }
  };

  const handleSnapshotChange = async (sid: number) => {
    try { setCurrent(await dbApi.listCandidates(sid)); } catch (e) { setError('切换快照失败'); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="candidate-panel">
      {/* 顶栏 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6b6155' }}>策略</span>
        <select data-testid="candidate-strategy-select" value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #2b6cb0', borderRadius: 6, background: '#fff', fontSize: 13, fontWeight: 600, color: '#2b6cb0' }}>
          {PRESET_LABELS.map(l => <option key={l} value={l}>{l}{l !== '自定义' ? ` (${(strategies?.presets[l] as any)?.w_pe ? Math.round((strategies.presets[l] as any).w_pe * 100) : 30}/…)` : ''}</option>)}
          {Object.keys(ML_STRATEGIES).map(l => <option key={l} value={l}>{l} (ML)</option>)}
        </select>
        <button data-testid="candidate-run-btn" onClick={handleRun} disabled={running}
          style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: running ? '#8aa8c9' : '#2b6cb0', color: '#fff', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '跑策略中…' : '🚀 跑策略'}
        </button>
        <select data-testid="candidate-snapshot-select" value={current.snapshot_id ?? ''}
          onChange={(e) => handleSnapshotChange(Number(e.target.value))}
          style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
          <option value="">最新</option>
          {snapshots.map(s => <option key={s.id} value={s.id}>{s.run_at?.slice(0, 10)} · {s.strategy_label} · top{s.count}</option>)}
        </select>
      </div>

      {/* 参数面板(仅 rank-composite;ML 不用因子权重) */}
      {!isML && (
      <div style={{ background: '#EFE7DA', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#6b6155' }}>
          <span>因子权重</span>
          {(['w_pe', 'w_roe', 'w_mom'] as const).map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {k === 'w_pe' ? 'PE' : k === 'w_roe' ? 'ROE' : '动量'}
              <input type="number" value={weights[k]} disabled={!isCustom}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                style={{ width: 48, padding: '3px 6px', border: '1px solid #C9BFAE', borderRadius: 4 }} />%
            </label>
          ))}
          <span style={{ color: weightSum === 100 ? '#5cb85c' : '#d9534f' }}>合计 {weightSum}%</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: '#6b6155' }}>
          <span>动量窗</span>
          <select value={window} disabled={!isCustom} onChange={(e) => setWindow(Number(e.target.value))}
            style={{ padding: '3px 6px', border: '1px solid #C9BFAE', borderRadius: 4 }}>
            {[252, 120, 60, 20].map(w => <option key={w} value={w}>{w}d</option>)}
          </select>
          <span style={{ color: '#a89f93' }}>{isCustom ? '' : '（预设参数只读）'}</span>
        </div>
      </div>
      )}

      {error && <div style={{ color: 'var(--accent-red,#d9534f)', fontSize: 12 }}>{error}</div>}

      {!current.snapshot_id ? (
        <div style={{ color: '#888', fontSize: 13 }}>还没跑过策略。选好策略点【🚀 跑策略】生成候选池。</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead><tr style={{ background: '#F0E7DA' }}>
            <th style={th}>排名</th><th style={th}>代码</th><th style={th}>名称</th><th style={th}>行业</th>
            <th style={{ ...th, textAlign: 'right' }}>总分</th>
            {!isML && <th style={{ ...th, textAlign: 'right' }}>PE秩</th>}
            {!isML && <th style={{ ...th, textAlign: 'right' }}>ROE秩</th>}
            {!isML && <th style={{ ...th, textAlign: 'right' }}>动量秩</th>}
            <th style={{ ...th, textAlign: 'center' }}>操作</th>
          </tr></thead>
          <tbody>
            {current.items.map(it => (
              <tr key={it.ts_code} onClick={() => openStockTab(it.ts_code, it.name)}
                  style={{ borderBottom: '1px solid #E5DCC9', cursor: 'pointer' }}>
                <td style={td}>{it.rank}</td>
                <td style={td}>{it.ts_code}</td>
                <td style={td}>{it.name}</td>
                <td style={{ ...td, color: '#8a8178' }}>{it.industry || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#2b6cb0' }}>{it.score}</td>
                {!isML && <td style={{ ...td, textAlign: 'right' }}>{it.pe_rank}</td>}
                {!isML && <td style={{ ...td, textAlign: 'right' }}>{it.roe_rank}</td>}
                {!isML && <td style={{ ...td, textAlign: 'right' }}>{it.momentum_rank}</td>}
                <td style={{ ...td, textAlign: 'center' }}>
                  {it.promoted ? (
                    <span style={{ padding: '3px 10px', border: '1px solid #E5DCC9', borderRadius: 5, background: '#ECE4D6', color: '#8a8178', fontSize: 12 }}>已晋升</span>
                  ) : (
                    <button data-testid={`candidate-promote-${it.ts_code}`} onClick={(e) => { e.stopPropagation(); handlePromote(it); }}
                      style={{ padding: '3px 10px', border: '1px solid #D6CFC4', borderRadius: 5, background: '#fff', fontSize: 12, cursor: 'pointer' }}>晋升</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
export default CandidatePanel;

import React, { useEffect, useState } from 'react';
import { dbApi, type StockDetail } from '../../services/dbApi';

const SUB_TABS = ['总览', '成长', '盈利', '估值', '趋势', '安全'] as const;
type SubTab = typeof SUB_TABS[number];
const DIM_MAP: Record<Exclude<SubTab, '总览'>, keyof StockDetail> = {
  '成长': 'growth', '盈利': 'profit', '估值': 'value', '趋势': 'trend', '安全': 'safety',
};

function pct(v: number | null | undefined, digits = 1): string {
  return v == null ? 'N/A' : `${v.toFixed(digits)}%`;
}
function num(v: number | null | undefined, digits = 2): string {
  return v == null ? 'N/A' : v.toFixed(digits);
}
function fmtMV(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  return (v / 1e8).toFixed(1) + ' 亿';
}

const StockDetailPanel: React.FC<{ ts_code: string }> = ({ ts_code }) => {
  const [data, setData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<SubTab>('总览');

  const load = () => {
    setLoading(true); setError(null);
    dbApi.getStockDetail(ts_code)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [ts_code]);

  if (loading) return <div style={{ padding: 24, color: '#888' }} data-testid="stock-detail-panel">分析中(5-15 秒)…</div>;
  if (error) return (
    <div style={{ padding: 24 }} data-testid="stock-detail-panel">
      <div style={{ color: 'var(--accent-red, #d9534f)', marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: '6px 14px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
    </div>
  );
  if (!data) return null;

  const { basic, quotes, score } = data;
  const dims: { cn: string; key: Exclude<SubTab, '总览'> }[] = [
    { cn: '成长性', key: '成长' }, { cn: '盈利质量', key: '盈利' }, { cn: '估值', key: '估值' },
    { cn: '趋势', key: '趋势' }, { cn: '安全', key: '安全' },
  ];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="stock-detail-panel">
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{basic.name} <span style={{ color: '#888', fontSize: 13 }}>{ts_code}</span></div>
        <div style={{ fontSize: 12, color: '#6b6155', marginTop: 4 }}>
          {basic.industry} · 上市 {basic.list_date}
        </div>
        <div style={{ fontSize: 13, marginTop: 6, color: '#1A1A1A' }}>
          现价 {num(quotes.close)} · 市值 {fmtMV(quotes.total_mv)} · PE {num(quotes.pe_ttm)} · PB {num(quotes.pb)} · 股息率 {pct(quotes.dv_ttm)}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-blue, #2b6cb0)' }}>{score.total}</div>
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{score.verdict}</div>
          <div style={{ color: '#888' }}>总分 / 100</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D6CFC4' }}>
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSub(t)} style={{
            padding: '8px 14px', background: 'transparent', cursor: 'pointer',
            border: 'none', borderBottom: sub === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: sub === t ? 'var(--accent-blue)' : '#888', fontSize: 13, fontWeight: 500,
          }}>{t}</button>
        ))}
      </div>

      {sub === '总览' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {dims.map(d => (
            <div key={d.key} style={{ background: '#fff', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#888' }}>{score.dim_labels[d.cn]} {d.cn}</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{score.dim_scores[d.cn]}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{score.dim_reasons[d.cn]}</div>
            </div>
          ))}
        </div>
      ) : (
        <DimDetail sub={sub} data={data} />
      )}
    </div>
  );
};

const DimDetail: React.FC<{ sub: Exclude<SubTab, '总览'>; data: StockDetail }> = ({ sub, data }) => {
  const cn = sub === '成长' ? '成长性' : sub === '盈利' ? '盈利质量' : sub;
  const score = data.score;
  const key = DIM_MAP[sub];
  const d = data[key] as Record<string, number | null | boolean>;
  const rows: { label: string; val: string }[] = [];
  if (sub === '成长') {
    rows.push({ label: '营收 3 年 CAGR', val: pct(d.rev_cagr_3y as number | null) });
    rows.push({ label: '净利 3 年 CAGR', val: pct(d.np_cagr_3y as number | null) });
    rows.push({ label: '净利同比', val: pct(d.np_yoy as number | null) });
  } else if (sub === '盈利') {
    rows.push({ label: 'ROE', val: pct(d.roe as number | null) });
    rows.push({ label: '毛利率', val: pct(d.gross_margin as number | null) });
    rows.push({ label: '净利率', val: pct(d.net_margin as number | null) });
    rows.push({ label: '现金含量', val: num(d.cash_ratio as number | null) });
  } else if (sub === '估值') {
    rows.push({ label: 'PE-TTM', val: num(d.pe_now as number | null) });
    rows.push({ label: 'PE 分位', val: d.pe_pct == null ? 'N/A' : `${((d.pe_pct as number) * 100).toFixed(0)}%` });
    rows.push({ label: 'PEG', val: num(d.peg as number | null) });
  } else if (sub === '趋势') {
    rows.push({ label: '近 1 年涨幅', val: d.ret_1y == null ? 'N/A' : `${((d.ret_1y as number) * 100).toFixed(0)}%` });
    rows.push({ label: 'MA60', val: d.above_ma60 ? '站上' : '跌破' });
  } else if (sub === '安全') {
    rows.push({ label: '负债率', val: pct(d.debt_ratio as number | null) });
    rows.push({ label: '流动比率', val: num(d.current_ratio as number | null) });
    rows.push({ label: '历史最大回撤', val: d.max_dd == null ? 'N/A' : `${((d.max_dd as number) * 100).toFixed(0)}%` });
  }
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{score.dim_scores[cn]}</span>
        <span style={{ fontSize: 16 }}>{score.dim_labels[cn]}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{cn}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F0E7DA', fontSize: 13 }}>
          <span style={{ color: '#6b6155' }}>{r.label}</span>
          <span style={{ fontWeight: 500 }}>{r.val}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>理由:{score.dim_reasons[cn]}</div>
    </div>
  );
};

export default StockDetailPanel;

import React, { useEffect, useState } from 'react';
import { dbApi, type StockDetail } from '../../services/dbApi';

const SUB_TABS = ['总览', '成长', '盈利', '估值', '趋势', '安全', '🩺 巴菲特'] as const;
type SubTab = typeof SUB_TABS[number];
const DIM_MAP: Record<'成长' | '盈利' | '估值' | '趋势' | '安全', keyof StockDetail> = {
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
  const yi = v / 1e4;  // tushare total_mv 单位是万元 → 亿元
  if (yi >= 10000) return (yi / 10000).toFixed(2) + ' 万亿';
  return yi.toFixed(0) + ' 亿';
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
          {data.as_of_date && <span style={{ color: '#aaa', fontSize: 11 }}> · 截至 {data.as_of_date}</span>}
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
      ) : sub === '🩺 巴菲特' ? (
        <BuffettView data={data} ts_code={ts_code} />
      ) : (
        <DimDetail sub={sub} data={data} />
      )}
    </div>
  );
};

const DimDetail: React.FC<{ sub: '成长' | '盈利' | '估值' | '趋势' | '安全'; data: StockDetail }> = ({ sub, data }) => {
  const cn = sub === '成长' ? '成长性' : sub === '盈利' ? '盈利质量' : sub;
  const score = data.score;
  const key = DIM_MAP[sub];
  const d = data[key] as Record<string, number | null | boolean>;
  const rows: { label: string; val: string; note?: string }[] = [];
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
    rows.push({ label: '历史最大回撤', val: d.max_dd == null ? 'N/A' : `${((d.max_dd as number) * 100).toFixed(0)}%`, note: '峰值到谷底的最大跌幅,衡量最坏情况' });
    rows.push({ label: '夏普比率', val: num(d.sharpe as number | null), note: '单位波动的超额收益(无风险利率按2%算)。<1 一般,>1 好,>2 优秀' });
    rows.push({ label: '索提诺比率', val: num(d.sortino as number | null), note: '只算下跌波动的夏普(上涨不算风险)。>1 好,比夏普更公平' });
    rows.push({ label: '卡玛比率', val: num(d.calmar as number | null), note: '年化收益÷最大回撤。>1 好,>3 优秀' });
    rows.push({ label: 'VaR(95%,单日)', val: d.var_95 == null ? 'N/A' : `${((d.var_95 as number) * 100).toFixed(1)}%`, note: '单日有 95% 把握亏损不超此值(尾部风险底线)' });
    rows.push({ label: 'CVaR(95%,单日)', val: d.cvar_95 == null ? 'N/A' : `${((d.cvar_95 as number) * 100).toFixed(1)}%`, note: '最差 5% 交易日的平均亏损(比 VaR 更保守)' });
  }
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{score.dim_scores[cn]}</span>
        <span style={{ fontSize: 16 }}>{score.dim_labels[cn]}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{cn}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ padding: '6px 0', borderBottom: '1px solid #F0E7DA', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b6155' }}>{r.label}</span>
            <span style={{ fontWeight: 500 }}>{r.val}</span>
          </div>
          {r.note && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{r.note}</div>}
        </div>
      ))}
      <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>理由:{score.dim_reasons[cn]}</div>
    </div>
  );
};

const LIGHT_EMOJI: Record<string, string> = {
  green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪',
};

const DeepDiveRow: React.FC<{ ts_code: string; dimension: 'moat_type' | 'management_integrity' | 'industry_explore'; label: string; autoFetch?: boolean }> = ({ ts_code, dimension, label, autoFetch = false }) => {
  const [state, setState] = useState<{ text?: string | null; loading?: boolean; error?: string }>({ loading: true });

  // 挂载自动查库(force=false):有缓存直接显示,无则按 autoFetch 决定(自动调 LLM 或显示按钮)
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    dbApi.aiDeepdive(ts_code, dimension, false)
      .then(r => {
        if (cancelled) return;
        if (r.text) {
          setState({ text: r.text });
        } else if (autoFetch) {
          // autoFetch(generic 行业兜底): 查库无果 → 自动调 LLM
          dbApi.aiDeepdive(ts_code, dimension, true)
            .then(r2 => { if (!cancelled) setState({ text: r2.text }); })
            .catch(e => { if (!cancelled) setState({ error: e instanceof Error ? e.message : 'AI 探索失败' }); });
        } else {
          setState({ text: null });
        }
      })
      .catch(e => { if (!cancelled) setState({ error: e instanceof Error ? e.message : '加载失败' }); });
    return () => { cancelled = true; };
  }, [ts_code, dimension, autoFetch]);

  const run = async () => {
    setState({ loading: true });
    try {
      const r = await dbApi.aiDeepdive(ts_code, dimension, true);  // force=true 调 LLM
      setState({ text: r.text });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : 'AI 深挖失败' });
    }
  };

  return (
    <div style={{ marginTop: 6, marginLeft: 28, padding: 8, background: '#FFFDF9', borderRadius: 6, border: '1px solid #E5DCC9' }}>
      {state.loading && <span style={{ color: '#888', fontSize: 11 }}>查询中…</span>}
      {!state.loading && state.error && (
        <span style={{ fontSize: 11 }}>
          <span style={{ color: 'var(--accent-red, #d9534f)' }}>{state.error} </span>
          <button onClick={run} style={{ border: 'none', background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11 }}>重试</button>
        </span>
      )}
      {!state.loading && !state.error && !state.text && (
        <button
          onClick={run}
          data-testid={`ai-deepdive-${dimension}`}
          style={{ padding: '3px 10px', border: '1px solid var(--accent-blue, #2b6cb0)', background: '#fff', color: 'var(--accent-blue, #2b6cb0)', borderRadius: 12, cursor: 'pointer', fontSize: 11 }}
        >
          ⚡ AI 深挖{label}(10-30s,消耗 token)
        </button>
      )}
      {!state.loading && !state.error && state.text && (
        <div style={{ fontSize: 12, color: '#1A1A1A', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>🤖 AI 深挖:</span>{state.text}
          <button
            onClick={run}
            data-testid={`ai-redeepdive-${dimension}`}
            style={{ marginLeft: 8, padding: '1px 8px', border: '1px solid #D6CFC4', background: '#fff', color: '#6b6155', borderRadius: 10, cursor: 'pointer', fontSize: 10 }}
          >
            🔄 重新深挖
          </button>
        </div>
      )}
    </div>
  );
};

const BuffettView: React.FC<{ data: StockDetail; ts_code: string }> = ({ data, ts_code }) => {
  const b = data.buffett;
  if (!b) {
    return <div style={{ padding: 16, color: '#888' }}>暂无巴菲特体检数据(后端未启用 buffett 字段)</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 结论卡 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{b.conclusion.verdict}</span>
          <span style={{ fontSize: 12, color: '#888' }}>
            🟢{b.conclusion.counts.green} 🟡{b.conclusion.counts.yellow} 🔴{b.conclusion.counts.red} ⚪{b.conclusion.counts.gray}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#6b6155', marginTop: 4 }}>{b.conclusion.one_liner}</div>
        {(b.as_of_date || b.fina_end_date) && (
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
            ⏰ 数据时效：行情截至 {b.as_of_date || '?'}
            {b.fina_end_date && `｜财务截至 ${b.fina_end_date.slice(0, 4)} 年报(${b.fina_end_date})`}
          </div>
        )}
      </div>

      {/* 8 问体检表 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>巴菲特 8 问</div>
        {b.eight_questions.map(q => (
          <div key={q.n} style={{ padding: '5px 0', borderBottom: '1px solid #F0E7DA', fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ width: 20, textAlign: 'center' }}>{LIGHT_EMOJI[q.light] || '⚪'}</span>
              <span style={{ width: 110, color: '#6b6155', flexShrink: 0 }}>{q.dimension}</span>
              <span style={{ color: '#1A1A1A' }}>{q.explain}</span>
            </div>
            {q.n === 3 && <DeepDiveRow ts_code={ts_code} dimension="moat_type" label="护城河类型" />}
            {q.n === 7 && <DeepDiveRow ts_code={ts_code} dimension="management_integrity" label="管理层深层" />}
            {q.n === 1 && b.industry_matched === 'generic' && (
              <DeepDiveRow ts_code={ts_code} dimension="industry_explore" label="行业探索" autoFetch />
            )}
          </div>
        ))}
      </div>

      {/* 护城河信号 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🏰 护城河信号</div>
        <div style={{ fontSize: 12, color: '#1A1A1A' }}>{b.moat.signal}</div>
        <div style={{ fontSize: 12, color: '#6b6155', marginTop: 4 }}>强度:{b.moat.strength} | 类型:{b.moat.type}</div>
      </div>

      {/* 财务翻译 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>💰 财务体检(术语→人话)</div>
        {b.financials.map(f => (
          <div key={f.metric} style={{ padding: '5px 0', borderBottom: '1px solid #F0E7DA', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b6155' }}>{LIGHT_EMOJI[f.light] || '⚪'} {f.metric}</span>
              <span style={{ fontWeight: 500 }}>{f.value == null ? 'N/A' : typeof f.value === 'number' ? (f.value > 2 ? f.value.toFixed(1) : f.value.toFixed(2)) : f.value}</span>
            </div>
            <div style={{ color: '#888', marginTop: 2 }}>{f.explain}</div>
          </div>
        ))}
      </div>

      {/* 估值 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📊 估值</div>
        <div style={{ fontSize: 12, color: '#1A1A1A' }}>{b.valuation.explain}</div>
        <div style={{ fontSize: 12, color: '#6b6155', marginTop: 4 }}>安全边际:{b.valuation.margin_of_safety}</div>
      </div>

      {/* 风险 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>⚠️ 三大风险</div>
        {b.risks.map((r, i) => (
          <div key={i} style={{ fontSize: 12, color: '#1A1A1A', padding: '2px 0' }}>· {r}</div>
        ))}
      </div>

      {/* 总评 */}
      <div style={{ background: '#FFFDF9', borderRadius: 8, padding: 12, border: '1px solid #E5DCC9' }}>
        <div style={{ fontSize: 12, color: '#1A1A1A', fontStyle: 'italic' }}>{b.summary}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>⚠️ 规则体检参考,非投资建议。管理诚信/护城河类型等盲区需 AI 或人工深研</div>
      </div>
    </div>
  );
};

export default StockDetailPanel;

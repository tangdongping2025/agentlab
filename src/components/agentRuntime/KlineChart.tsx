import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dbApi, type KlineResult } from '../../services/dbApi';

const FREQS = [
  { key: 'daily', label: '日' },
  { key: 'weekly', label: '周' },
  { key: 'monthly', label: '月' },
] as const;
type Freq = typeof FREQS[number]['key'];

// dataviz skill 校准结果(validate_palette.js 通过,无 WARN):
// 最差相邻 CVD ΔE 19.6(≥12 目标),四色在白底均 ≥3:1。色盲安全。
const COLORS = { close: '#2a78d6', ma5: '#008300', ma10: '#4a3aa7', ma20: '#eb6834' };

const KlineChart: React.FC<{ ts_code: string }> = ({ ts_code }) => {
  const [freq, setFreq] = useState<Freq>('daily');
  const [data, setData] = useState<KlineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (f: Freq) => {
    setLoading(true); setError(null);
    dbApi.getKline(ts_code, f, 120)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(freq), [ts_code, freq]);

  const fmtDate = (d: string) => `${d.slice(4, 6)}-${d.slice(6, 8)}`;

  return (
    <div data-testid="kline-chart" style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {FREQS.map(f => (
          <button key={f.key} data-testid={`kline-freq-${f.key}`} onClick={() => setFreq(f.key)}
            style={{
              padding: '4px 12px', cursor: 'pointer', borderRadius: 6, fontSize: 12,
              border: `1px solid ${freq === f.key ? 'var(--accent-blue,#2b6cb0)' : '#D6CFC4'}`,
              background: freq === f.key ? 'var(--accent-blue,#2b6cb0)' : '#fff',
              color: freq === f.key ? '#fff' : '#6b6155',
            }}>{f.label}</button>
        ))}
        <span style={{ fontSize: 11, color: '#aaa', alignSelf: 'center' }}>收盘价折线 + MA5/10/20(前复权)</span>
      </div>
      {loading && <div style={{ color: '#888' }}>加载中…</div>}
      {error && (
        <div style={{ color: 'var(--accent-red,#d9534f)' }}>
          {error}
          <button onClick={() => load(freq)} style={{ marginLeft: 8, padding: '2px 10px',
            border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
        </div>
      )}
      {!loading && !error && data && data.points.length === 0 && (
        <div style={{ color: '#888' }}>暂无K线数据(该股未在已抓取范围,且 tushare 兜底失败)</div>
      )}
      {!loading && !error && data && data.points.length > 0 && (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#F0E7DA" />
              <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} minTickGap={24} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip labelFormatter={fmtDate} />
              <Line type="monotone" dataKey="close" name="收盘" stroke={COLORS.close} dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="ma5" name="MA5" stroke={COLORS.ma5} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma10" name="MA10" stroke={COLORS.ma10} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma20" name="MA20" stroke={COLORS.ma20} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default KlineChart;

export interface TokenAllocationData {
  input: number;
  output: number;
  contextSize: number;
}

interface Props {
  data: TokenAllocationData;
}

function TokenAllocation({ data }: Props) {
  const total = data.input + data.output;
  const rows = [
    { label: '输入', value: data.input, color: 'var(--accent-blue)' },
    { label: '输出', value: data.output, color: 'var(--accent-emerald)' },
    { label: '可用剩余', value: Math.max(0, data.contextSize - total), color: 'var(--accent-amber)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {rows.map(r => {
        const pct = data.contextSize > 0 ? (r.value / data.contextSize) * 100 : 0;
        const displayVal = r.value >= 1000 ? `${(r.value / 1000).toFixed(1)}K` : `${r.value}`;
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', width: '56px', flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: r.color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-tertiary)', width: '44px', textAlign: 'right', flexShrink: 0 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

export default TokenAllocation;

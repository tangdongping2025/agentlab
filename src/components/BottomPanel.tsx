import TokenAllocation from './TokenAllocation';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';

export default function BottomPanel() {
  return (
    <div style={{
      height: 'var(--bottom-panel-height)',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--bg-base)',
      display: 'flex',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-emerald)" label="Token 分配" />
        <TokenAllocation />
      </div>
      <div style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-violet)" label="策略对比" />
        <StrategyComparator />
      </div>
      <div style={{ flex: 1.2, padding: '14px 18px', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-blue)" label="交互过程" />
        <TimelineReplay />
      </div>
    </div>
  );
}

function VizTitle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      color: 'var(--text-tertiary)',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

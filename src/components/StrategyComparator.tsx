import React from 'react';
import { useAppStore } from '../stores/appStore';

const strategies = [
  { id: 'sliding' as const, name: '滑动窗口', savings: '-40%' },
  { id: 'full' as const, name: '完整记忆', savings: '基线' },
  { id: 'summary' as const, name: '摘要记忆', savings: '-60%' },
  { id: 'none' as const, name: '无记忆', savings: '-80%' },
];

const barWidths: Record<string, number> = {
  sliding: 40,
  full: 64,
  summary: 26,
  none: 12,
};

function StrategyComparator() {
  const { contextStrategy } = useAppStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
      {strategies.map(s => {
        const isActive = contextStrategy === s.id;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: `${barWidths[s.id]}px`, height: '4px',
              background: isActive ? 'var(--accent-violet)' : 'var(--text-tertiary)',
              borderRadius: '2px', flexShrink: 0,
            }} />
            <span style={{ color: isActive ? 'var(--accent-violet)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400 }}>
              {s.name}
            </span>
            <span style={{
              marginLeft: 'auto', fontFamily: 'var(--font-mono)',
              color: s.savings === '基线' ? 'var(--text-tertiary)' : 'var(--accent-emerald)',
            }}>
              {s.savings}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default StrategyComparator;

import React from 'react';
import { useAppStore } from '../stores/appStore';

const STRATEGY_LABELS: Record<string, string> = {
  sliding: '滑动窗口',
  full: '完整记忆',
  summary: '摘要记忆',
  none: '无记忆',
};

function StrategyEffectCard() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);

  if (!strategyEffect || !strategyEffect.triggered) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        {strategyEffect === null
          ? '发送消息后，策略效果将在此展示'
          : `当前策略: ${STRATEGY_LABELS[contextStrategy]} · 无消息被过滤`}
      </div>
    );
  }

  const savingsPercent = strategyEffect.beforeTokenCount > 0
    ? Math.round((1 - strategyEffect.afterTokenCount / strategyEffect.beforeTokenCount) * 100)
    : 0;

  return (
    <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
          {STRATEGY_LABELS[strategyEffect.strategy]}
        </span>
        {strategyEffect.degraded && (
          <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>降级</span>
        )}
      </div>

      {/* Before/After comparison */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略前</div>
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {strategyEffect.beforeMessages.length} 条 · {strategyEffect.beforeTokenCount}t
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-amber)', fontSize: '14px' }}>→</div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略后</div>
          <div style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
            {strategyEffect.afterMessages.length} 条 · {strategyEffect.afterTokenCount}t
          </div>
        </div>
      </div>

      {/* Savings */}
      <div style={{ marginTop: '6px', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        节省 {savingsPercent}%
      </div>
    </div>
  );
}

export default StrategyEffectCard;

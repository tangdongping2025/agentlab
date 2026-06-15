const STRATEGY_LABELS: Record<string, string> = {
  sliding: '滑动窗口',
  full: '完整记忆',
  summary: '摘要记忆',
  none: '无记忆',
};

export interface StrategyEffectData {
  triggered: boolean;
  strategy: string;
  beforeTokenCount: number;
  afterTokenCount: number;
  beforeMessages: Array<{ role: string; content: string }>;
  afterMessages: Array<{ role: string; content: string }>;
  degraded?: boolean;
  degradeReason?: string;
  summarySourceCount?: number | null;
  summarySourceTokens?: number | null;
  summaryDuration?: number | null;
}

interface Props {
  effect: StrategyEffectData | null;
  strategy: string;
}

function StrategyEffectCard({ effect, strategy }: Props) {
  if (!effect || !effect.triggered) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        {effect === null ? '发送消息后，策略效果将在此展示' : `当前策略: ${STRATEGY_LABELS[strategy] || strategy} · 无消息被过滤`}
      </div>
    );
  }
  const savingsPercent = effect.beforeTokenCount > 0
    ? Math.round((1 - effect.afterTokenCount / effect.beforeTokenCount) * 100) : 0;
  return (
    <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{STRATEGY_LABELS[effect.strategy] || effect.strategy}</span>
        {effect.degraded && <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>降级</span>}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略前</div>
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{effect.beforeMessages.length} 条 · {effect.beforeTokenCount}t</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-amber)', fontSize: '14px' }}>→</div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略后</div>
          <div style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>{effect.afterMessages.length} 条 · {effect.afterTokenCount}t</div>
        </div>
      </div>
      <div style={{ marginTop: '6px', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>节省 {savingsPercent}%</div>
      {effect.strategy === 'summary' && effect.summarySourceCount != null && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>对 {effect.summarySourceCount} 条消息生成摘要</div>
      )}
      {effect.degraded && effect.degradeReason && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--accent-red)' }}>{effect.degradeReason}</div>
      )}
    </div>
  );
}

export default StrategyEffectCard;

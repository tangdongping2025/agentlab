import React, { useState, useEffect } from 'react';
import TokenAllocation from './TokenAllocation';
import StrategyEffectCard from './StrategyEffectCard';
import TimelineReplay from './TimelineReplay';
import DetailModal from './DetailModal';
import { useAppStore } from '../stores/appStore';

export default function BottomPanel() {
  const [detailModal, setDetailModal] = useState<{ open: boolean; title: string; content: string }>({
    open: false, title: '', content: ''
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isStrategyMaximized, setIsStrategyMaximized] = useState(false);
  const [inlinePayload, setInlinePayload] = useState<{ title: string; content: string } | null>(null);

  // ESC closes maximize modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isStrategyMaximized) {
          setIsStrategyMaximized(false);
        } else if (isMaximized) {
          if (inlinePayload) {
            setInlinePayload(null);
          } else {
            setIsMaximized(false);
          }
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isMaximized, isStrategyMaximized, inlinePayload]);

  const handleViewFullPayload = (title: string, content: string) => {
    if (isMaximized) {
      setInlinePayload({ title, content });
    } else {
      setDetailModal({ open: true, title, content });
    }
  };

  // Pretty-print JSON if possible
  const formatContent = (raw: string): string => {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <>
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
        <div style={{ flex: 1.2, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{
            fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const,
            letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-amber)' }} />
            <span style={{ flex: 1 }}>策略生效</span>
            <button
              onClick={() => setIsStrategyMaximized(true)}
              title="最大化"
              style={{
                background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '3px',
                color: 'var(--text-tertiary)', cursor: 'pointer', padding: '1px 4px',
                fontSize: '12px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ⛶
            </button>
          </div>
          <StrategyEffectCard />
        </div>
        <div style={{ flex: 1.2, padding: '14px 18px', overflow: 'hidden' }}>
          <div style={{
            fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const,
            letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-blue)' }} />
            <span style={{ flex: 1 }}>交互过程</span>
            <button
              onClick={() => setIsMaximized(true)}
              title="最大化"
              style={{
                background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '3px',
                color: 'var(--text-tertiary)', cursor: 'pointer', padding: '1px 4px',
                fontSize: '12px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ⛶
            </button>
          </div>
          <TimelineReplay onViewFullPayload={handleViewFullPayload} />
        </div>

        <DetailModal
          isOpen={detailModal.open}
          onClose={() => setDetailModal({ open: false, title: '', content: '' })}
          title={detailModal.title}
          content={detailModal.content}
        />
      </div>

      {/* Fullscreen maximize modal */}
      {isMaximized && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsMaximized(false); }}
        >
          <div style={{
            background: 'var(--bg-base)', borderRadius: '8px',
            margin: '24px', flex: 1, display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border-default)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)' }} />
                交互过程
              </div>
              <button
                onClick={() => setIsMaximized(false)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-tertiary)',
                  cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px',
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '18px', overflowY: 'auto', position: 'relative' }}>
              {inlinePayload ? (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {inlinePayload.title}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => navigator.clipboard.writeText(inlinePayload.content)}
                        style={{
                          padding: '4px 10px', background: 'var(--accent-blue)', color: '#fff',
                          border: 'none', borderRadius: '4px', fontSize: '14px', cursor: 'pointer',
                        }}
                      >
                        复制
                      </button>
                      <button
                        onClick={() => setInlinePayload(null)}
                        style={{
                          padding: '4px 10px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                          border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14px', cursor: 'pointer',
                        }}
                      >
                        ← 返回
                      </button>
                    </div>
                  </div>
                  <pre style={{
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    fontFamily: 'var(--font-mono)', fontSize: '15px', lineHeight: 1.6,
                    color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)',
                    padding: '12px', borderRadius: '6px', margin: 0,
                  }}>
                    {formatContent(inlinePayload.content)}
                  </pre>
                </div>
              ) : (
                <TimelineReplay onViewFullPayload={handleViewFullPayload} autoExpandPayload={isMaximized} isMaximized={isMaximized} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Strategy maximize modal */}
      {isStrategyMaximized && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsStrategyMaximized(false); }}
        >
          <div style={{
            background: 'var(--bg-base)', borderRadius: '8px',
            margin: '24px', flex: 1, display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border-default)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}>
              <div style={{
                fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-amber)' }} />
                策略生效
              </div>
              <button
                onClick={() => setIsStrategyMaximized(false)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-tertiary)',
                  cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, padding: '18px', overflowY: 'auto' }}>
              <StrategyEffectMaximizedView />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VizTitle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const,
      letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

function StrategyEffectMaximizedView() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);
  const [showOriginal, setShowOriginal] = React.useState(false);

  const STRATEGY_LABELS: Record<string, string> = {
    sliding: '滑动窗口',
    full: '完整记忆',
    summary: '摘要记忆',
    none: '无记忆',
  };

  if (!strategyEffect || !strategyEffect.triggered) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px', fontSize: '15px' }}>
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
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-amber)' }}>
          ⚡ {STRATEGY_LABELS[strategyEffect.strategy]}
        </span>
        {strategyEffect.degraded && (
          <span style={{ fontSize: '12px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
            降级: {strategyEffect.degradeReason}
          </span>
        )}
        {strategyEffect.strategy === 'summary' && strategyEffect.summarySourceCount != null && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '12px' }}>
            对 {strategyEffect.summarySourceCount} 条消息（约 {strategyEffect.summarySourceTokens}t）生成摘要
            {strategyEffect.summaryDuration != null && (
              <span style={{ color: 'var(--accent-amber)', marginLeft: '6px' }}>{strategyEffect.summaryDuration}ms</span>
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Before */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            策略前（完整对话历史）
          </div>
          {strategyEffect.beforeMessages.map((msg, i) => (
            <div key={i} style={{
              padding: '4px 8px', marginBottom: '4px',
              borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
              background: msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
              borderRadius: '0 4px 4px 0',
            }}>
              <span style={{ fontSize: '10px', color: msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                {msg.role === 'user' ? '用户' : '助手'}
              </span>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
              </div>
            </div>
          ))}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            共 {strategyEffect.beforeMessages.length} 条消息 · {strategyEffect.beforeTokenCount} tokens
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '24px', color: 'var(--accent-amber)' }}>→</div>

        {/* After */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            策略后（发送给 API 的内容）
          </div>
          {strategyEffect.afterMessages.map((msg, i) => {
            const isSummary = msg.content.startsWith('[对话摘要]');
            const isRemoved = strategyEffect.removedMessages.some(
              rm => rm.role === msg.role && rm.content === msg.content
            );
            return (
              <div key={i} style={{
                padding: '4px 8px', marginBottom: '4px',
                borderLeft: `2px solid ${isSummary ? 'var(--accent-amber)' : isRemoved ? 'var(--text-tertiary)' : msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
                background: isSummary ? 'rgba(245,158,11,0.08)' : isRemoved ? 'rgba(71,85,105,0.08)' : msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
                borderRadius: '0 4px 4px 0',
                color: isRemoved ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                textDecoration: isRemoved ? 'line-through' : 'none',
              }}>
                <span style={{ fontSize: '10px', color: isSummary ? 'var(--accent-amber)' : isRemoved ? 'var(--text-tertiary)' : msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                  {isSummary ? '摘要' : msg.role === 'user' ? '用户' : '助手'}
                </span>
                <div style={{ fontSize: '13px', wordBreak: 'break-all' }}>
                  {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
                </div>
                  {isSummary && strategyEffect.removedMessages.length > 0 && (
                    <button
                      onClick={() => setShowOriginal(!showOriginal)}
                      style={{
                        background: 'none', border: '1px solid var(--accent-amber)', borderRadius: '3px',
                        color: 'var(--accent-amber)', fontSize: '11px', padding: '1px 6px',
                        cursor: 'pointer', marginTop: '4px',
                      }}
                    >
                      {showOriginal ? '收起原文' : '查看原文'}
                    </button>
                  )}
              </div>
            );
          })}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--accent-emerald)' }}>
            {strategyEffect.afterMessages.length} 条消息 · {strategyEffect.afterTokenCount} tokens · 节省 {savingsPercent}%
          </div>
        </div>
      </div>
      {showOriginal && strategyEffect.strategy === 'summary' && strategyEffect.removedMessages.length > 0 && (
        <div style={{
          marginTop: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px',
          borderLeft: '3px solid var(--accent-amber)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--accent-amber)', marginBottom: '10px', fontWeight: 600 }}>
            被摘要的原始消息（{strategyEffect.removedMessages.length} 条）
          </div>
          {strategyEffect.removedMessages.map((msg, i) => (
            <div key={i} style={{
              padding: '6px 10px', marginBottom: '4px',
              borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
              background: msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
              borderRadius: '0 4px 4px 0',
            }}>
              <span style={{ fontSize: '10px', color: msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                {msg.role === 'user' ? '用户' : '助手'}
              </span>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                {msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

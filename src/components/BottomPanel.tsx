import React, { useState, useEffect } from 'react';
import TokenAllocation from './TokenAllocation';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';
import DetailModal from './DetailModal';

export default function BottomPanel() {
  const [detailModal, setDetailModal] = useState<{ open: boolean; title: string; content: string }>({
    open: false, title: '', content: ''
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [inlinePayload, setInlinePayload] = useState<{ title: string; content: string } | null>(null);

  // ESC closes maximize modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMaximized) {
        if (inlinePayload) {
          setInlinePayload(null);
        } else {
          setIsMaximized(false);
        }
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isMaximized, inlinePayload]);

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
        <div style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <VizTitle color="var(--accent-violet)" label="策略对比" />
          <StrategyComparator />
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

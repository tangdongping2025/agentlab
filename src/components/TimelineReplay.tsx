import React, { useState } from 'react';
import StepDetailPanel from './StepDetailPanel';
import type { TimelineStep } from '../stores/appStore';

interface TimelineReplayProps {
  steps: TimelineStep[];
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
  isMaximized?: boolean;
}

function TimelineReplay({ steps, onViewFullPayload, autoExpandPayload, isMaximized }: TimelineReplayProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const handleStepClick = (stepId: string, expandable: boolean) => {
    if (!expandable) return;
    setExpandedStepId(prev => prev === stepId ? null : stepId);
  };

  if (steps.length === 0) {
    return (
      <div style={{ fontSize: isMaximized ? '15px' : '13px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        发送消息后将显示交互过程
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
        {steps.map((step, i) => {
          const isClickable = step.expandable && (step.completed || step.details);
          const isExpanded = expandedStepId === step.id;
          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => handleStepClick(step.id, !!isClickable)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', fontSize: isMaximized ? '14px' : '13px',
                  background: isExpanded ? 'rgba(91,156,245,0.12)' : step.active ? 'rgba(91,156,245,0.08)' : 'transparent',
                  color: step.completed ? 'var(--accent-emerald)' : step.active ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                  fontWeight: step.active || isExpanded ? 600 : 400, whiteSpace: 'nowrap',
                  border: 'none', cursor: isClickable ? 'pointer' : 'default', transition: 'all 0.15s',
                }}
              >
                {step.icon} {step.toolCallName || step.title}
              </button>
              {i < steps.length - 1 && (
                <span style={{ width: step.completed ? '12px' : '8px', height: '1px', background: step.completed ? 'var(--accent-emerald)' : 'var(--border-default)', flexShrink: 0, transition: 'all 0.3s' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {expandedStepId && (() => {
        const step = steps.find(s => s.id === expandedStepId);
        if (!step) return null;
        return (
          <div style={{ marginTop: '8px', border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', fontSize: isMaximized ? '15px' : '13px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{step.icon} {step.title}</span>
              <button onClick={() => setExpandedStepId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: isMaximized ? '18px' : '16px', lineHeight: 1 }}>×</button>
            </div>
            <StepDetailPanel step={step} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} isMaximized={isMaximized} />
          </div>
        );
      })()}
    </div>
  );
}

export default TimelineReplay;

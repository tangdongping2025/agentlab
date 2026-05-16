import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import StepDetailPanel from './StepDetailPanel';

interface TimelineReplayProps {
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
}

function TimelineReplay({ onViewFullPayload, autoExpandPayload }: TimelineReplayProps) {
  const { timelineSteps, toggleStepExpanded } = useAppStore();
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const handleStepClick = (stepId: string, expandable: boolean) => {
    if (!expandable) return;
    if (expandedStepId === stepId) {
      setExpandedStepId(null);
      toggleStepExpanded(stepId);
    } else {
      // Accordion: collapse current, expand new
      if (expandedStepId) {
        toggleStepExpanded(expandedStepId);
      }
      setExpandedStepId(stepId);
      toggleStepExpanded(stepId);
    }
  };

  const handleViewFullPayload = (title: string, content: string) => {
    if (onViewFullPayload) {
      onViewFullPayload(title, content);
    }
  };

  if (timelineSteps.length === 0) {
    return (
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        发送消息后将显示交互过程
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Step indicators row */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
        {timelineSteps.map((step, i) => {
          const isDone = step.completed;
          const isActive = step.active;
          const isExpanded = step.expanded;
          const isClickable = step.expandable && (step.completed || step.details);

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => handleStepClick(step.id, !!isClickable)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
                  background: isExpanded ? 'rgba(91,156,245,0.12)' : isActive ? 'rgba(91,156,245,0.08)' : 'transparent',
                  color: isDone ? 'var(--accent-emerald)' : isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                  fontWeight: isActive || isExpanded ? 600 : 400,
                  whiteSpace: 'nowrap',
                  border: 'none', cursor: isClickable ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                {step.icon} {step.toolCallName || step.title}
              </button>
              {i < timelineSteps.length - 1 && (
                <span style={{
                  width: isDone ? '12px' : '8px',
                  height: '1px',
                  background: isDone ? 'var(--accent-emerald)' : 'var(--border-default)',
                  flexShrink: 0,
                  transition: 'all 0.3s',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {expandedStepId && (() => {
        const step = timelineSteps.find(s => s.id === expandedStepId);
        if (!step || !step.expanded) return null;
        return (
          <div style={{
            marginTop: '8px',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            overflow: 'hidden',
            animation: 'detailSlideIn 0.2s ease-out',
          }}>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-surface)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{step.icon} {step.title}</span>
              <button
                onClick={() => handleStepClick(step.id, true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <StepDetailPanel step={step} onViewFullPayload={handleViewFullPayload} autoExpandPayload={autoExpandPayload} />
          </div>
        );
      })()}

      <style>{`
        @keyframes detailSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default TimelineReplay;

import React from 'react';
import { useAppStore } from '../stores/appStore';

const stepDefs = [
  { id: 'user-input', icon: '💬', label: '输入' },
  { id: 'context-pack', icon: '🧠', label: '打包' },
  { id: 'tool-call', icon: '🔧', label: '工具' },
  { id: 'result-pack', icon: '📦', label: '结果' },
  { id: 'api-reorganize', icon: '📄', label: '重组' },
  { id: 'agent-response', icon: '🤖', label: '响应' },
];

function TimelineReplay() {
  const { timelineSteps, currentStepIndex } = useAppStore();

  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
      {stepDefs.map((def, i) => {
        const step = timelineSteps.find(s => s.id === def.id);
        const isDone = step?.completed ?? false;
        const isActive = step?.active ?? false;
        return (
          <React.Fragment key={def.id}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
              background: isActive ? 'rgba(91,156,245,0.08)' : 'transparent',
              color: isDone ? 'var(--accent-emerald)' : isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)',
              fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap',
            }}>
              {def.icon} {def.label}
            </span>
            {i < stepDefs.length - 1 && (
              <span style={{ width: '8px', height: '1px', background: 'var(--border-default)', flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default TimelineReplay;

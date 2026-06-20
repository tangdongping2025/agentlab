import React, { useState } from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';
import ResizeHandle from './ResizeHandle';

const AgentRuntimeView: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(280);
  const [bottomHeight, setBottomHeight] = useState(160);

  return (
    <div data-testid="agent-runtime-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F1EB' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div data-testid="agent-runtime-left-rail" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
          <AgentLibrary width={leftWidth} />
        </div>
        <div data-testid="agent-runtime-left-resize" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
          <ResizeHandle direction="horizontal" onResize={d => setLeftWidth(w => Math.max(140, Math.min(400, w + d)))} />
        </div>
        <AgentWorkspace />
        <div data-testid="agent-runtime-right-resize" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
          <ResizeHandle direction="horizontal" onResize={d => setRightWidth(w => Math.max(200, Math.min(500, w - d)))} />
        </div>
        <div data-testid="agent-runtime-right-rail" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
          <AssistantSidebar width={rightWidth} />
        </div>
      </div>
      <div data-testid="agent-runtime-bottom-resize" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
        <ResizeHandle direction="vertical" onResize={d => setBottomHeight(h => Math.max(120, Math.min(600, h - d)))} />
      </div>
      <div data-testid="agent-runtime-bottom-panel" className="mobile-compact-hidden" style={{ display: 'flex', flexShrink: 0 }}>
        <ObservabilityBar expandedHeight={bottomHeight} />
      </div>
    </div>
  );
};

export default AgentRuntimeView;

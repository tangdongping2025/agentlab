import React, { useState } from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';
import ResizeHandle from './ResizeHandle';

const AgentRuntimeView: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(280);
  const [bottomHeight, setBottomHeight] = useState(240);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <AgentLibrary width={leftWidth} />
        <ResizeHandle direction="horizontal" onResize={d => setLeftWidth(w => Math.max(140, Math.min(400, w + d)))} />
        <AgentWorkspace />
        <ResizeHandle direction="horizontal" onResize={d => setRightWidth(w => Math.max(200, Math.min(500, w + d)))} />
        <AssistantSidebar width={rightWidth} />
      </div>
      <ResizeHandle direction="vertical" onResize={d => setBottomHeight(h => Math.max(120, Math.min(600, h - d)))} />
      <ObservabilityBar expandedHeight={bottomHeight} />
    </div>
  );
};

export default AgentRuntimeView;

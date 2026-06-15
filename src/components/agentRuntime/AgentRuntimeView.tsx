import React from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';

const AgentRuntimeView: React.FC = () => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AgentLibrary />
        <AgentWorkspace />
        <AssistantSidebar />
      </div>
      <ObservabilityBar />
    </div>
  );
};

export default AgentRuntimeView;

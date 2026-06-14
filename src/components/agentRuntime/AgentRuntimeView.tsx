import React from 'react';
import AgentLibrary from './AgentLibrary';
import AgentWorkspace from './AgentWorkspace';
import AssistantSidebar from './AssistantSidebar';

const AgentRuntimeView: React.FC = () => {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <AgentLibrary />
      <AgentWorkspace />
      <AssistantSidebar />
    </div>
  );
};

export default AgentRuntimeView;

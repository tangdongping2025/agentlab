import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import TabsWorkspace from './TabsWorkspace';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  if (agent?.workspace?.type === 'tabs') return <TabsWorkspace />;
  return <ChatWorkspace />;
};

export default AgentWorkspace;

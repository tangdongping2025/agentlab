import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import TabsWorkspace from './TabsWorkspace';
import IframeWorkspace from './IframeWorkspace';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  if (agent?.workspace?.type === 'tabs') return <TabsWorkspace />;
  if (agent?.workspace?.type === 'iframe') return <IframeWorkspace />;
  return <ChatWorkspace />;
};

export default AgentWorkspace;

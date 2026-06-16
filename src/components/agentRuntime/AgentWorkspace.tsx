import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';

const AgentWorkspace: React.FC = () => {
  const { agents, currentAgentId } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  // tabs 型由 Task 5 的 TabsWorkspace 处理;本 task 先全走 ChatWorkspace
  if (agent?.workspace?.type === 'tabs') return <ChatWorkspace />;
  return <ChatWorkspace />;
};

export default AgentWorkspace;

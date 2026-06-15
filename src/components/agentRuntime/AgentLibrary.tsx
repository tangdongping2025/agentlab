import React, { useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AgentLibrary: React.FC<{ width?: number }> = ({ width = 220 }) => {
  const { agents, currentAgentId, selectAgent, loadAgents, isLoadingAgents } = useAgentRuntimeStore();

  useEffect(() => {
    if (agents.length === 0) loadAgents();
  }, []);

  return (
    <div style={{ width, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>应用库</div>
      {isLoadingAgents && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>加载中...</div>}
      {agents.filter(a => a.id !== 'assistant').map(a => (
        <div
          key={a.id}
          onClick={() => selectAgent(a.id)}
          style={{
            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
            border: `1px solid ${currentAgentId === a.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
            background: currentAgentId === a.id ? 'rgba(91,156,245,0.1)' : 'var(--bg-base)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{a.description}</div>
          <span style={{ fontSize: 9, background: 'var(--bg-deep)', padding: '0 5px', borderRadius: 3, color: 'var(--text-tertiary)' }}>{a.workspace.type}</span>
        </div>
      ))}
    </div>
  );
};

export default AgentLibrary;

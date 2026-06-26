import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import FilesPanel from './FilesPanel';
import SkillPanel from './SkillPanel';
import McpPanel from './McpPanel';
import MemoryPanel from './MemoryPanel';
import WatchlistPanel from './WatchlistPanel';

const TabsWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceCwd } = useAgentRuntimeStore();
  const agent = agents.find(a => a.id === currentAgentId);
  const tabs = (agent?.workspace as any)?.tabs || ['对话'];
  const [active, setActive] = useState(tabs[0]);

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
      <div data-testid="agent-runtime-tabbar" className="mobile-compact-hidden" style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D6CFC4', padding: '0 16px', background: '#F5F1EB', overflowX: 'auto', minWidth: 0 }}>
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            style={{
              padding: '10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: active === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: active === t ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, flexShrink: 0,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {active === '对话' && <ChatWorkspace />}
        {active === '文件' && <FilesPanel />}
        {active === 'Skill' && <SkillPanel cwd={workspaceCwd} />}
        {active === 'MCP' && <McpPanel />}
        {active === '记忆' && <MemoryPanel cwd={workspaceCwd} />}
        {active === '自选股' && <WatchlistPanel />}
      </div>
    </div>
  );
};

export default TabsWorkspace;

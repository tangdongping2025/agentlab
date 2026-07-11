import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import FilesPanel from './FilesPanel';
import SkillPanel from './SkillPanel';
import McpPanel from './McpPanel';
import MemoryPanel from './MemoryPanel';
import WatchlistPanel from './WatchlistPanel';
import CandidatePanel from './CandidatePanel';
import BacktestPanel from './BacktestPanel';
import StockDetailPanel from './StockDetailPanel';

const TabsWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceCwd } = useAgentRuntimeStore();
  const stockTabs = useAgentRuntimeStore(s => s.stockTabs);
  const activeStockTab = useAgentRuntimeStore(s => s.activeStockTab);
  const closeStockTab = useAgentRuntimeStore(s => s.closeStockTab);
  const agent = agents.find(a => a.id === currentAgentId);
  const staticTabs = (agent?.workspace as any)?.tabs || ['对话'];
  const [staticActive, setStaticActive] = useState(staticTabs[0]);

  // active 优先级:activeStockTab(股票 tab)> staticActive(静态 tab)
  const activeStock = activeStockTab && stockTabs.find(s => s.ts_code === activeStockTab) ? activeStockTab : null;
  const activeStatic = activeStock ? null : staticActive;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
      <div data-testid="agent-runtime-tabbar" className="mobile-compact-hidden" style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D6CFC4', padding: '0 16px', background: '#F5F1EB', overflowX: 'auto', minWidth: 0 }}>
        {staticTabs.map(t => (
          <button
            key={t}
            onClick={() => { useAgentRuntimeStore.setState({ activeStockTab: null }); setStaticActive(t); }}
            style={{
              padding: '10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: activeStatic === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeStatic === t ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, flexShrink: 0,
            }}
          >
            {t}
          </button>
        ))}
        {stockTabs.map(s => (
          <button
            key={s.ts_code}
            onClick={() => useAgentRuntimeStore.setState({ activeStockTab: s.ts_code })}
            style={{
              padding: '10px 12px 10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: activeStock === s.ts_code ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeStock === s.ts_code ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {s.name}
            <span
              data-testid={`stock-tab-close-${s.ts_code}`}
              onClick={(e) => { e.stopPropagation(); closeStockTab(s.ts_code); }}
              style={{ cursor: 'pointer', color: '#aaa', paddingLeft: 2 }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {activeStatic === '对话' && <ChatWorkspace />}
        {activeStatic === '文件' && <FilesPanel />}
        {activeStatic === 'Skill' && <SkillPanel cwd={workspaceCwd} />}
        {activeStatic === 'MCP' && <McpPanel />}
        {activeStatic === '记忆' && <MemoryPanel cwd={workspaceCwd} />}
        {activeStatic === '自选股' && <WatchlistPanel />}
        {activeStatic === '候选池' && <CandidatePanel />}
        {activeStatic === '回测' && <BacktestPanel />}
        {activeStock && <StockDetailPanel ts_code={activeStock} />}
      </div>
    </div>
  );
};

export default TabsWorkspace;

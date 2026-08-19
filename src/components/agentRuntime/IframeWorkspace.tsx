import React from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const linkStyle: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8, zIndex: 1,
  padding: '4px 10px', borderRadius: 999, fontSize: 12,
  background: 'rgba(37,99,235,0.9)', color: '#fff', textDecoration: 'none',
};

/**
 * dsh(DeepSeek Harness)载体工作区:全屏 iframe 载入独立部署的 dsh web。
 * url 缺省时提示未配置(后端 env DSH_IFRAME_URL)。
 */
const IframeWorkspace: React.FC = () => {
  const agent = useAgentRuntimeStore(s => s.agents.find(a => a.id === s.currentAgentId));
  const url = agent?.workspace?.type === 'iframe' ? agent.workspace.url : undefined;

  if (!url) {
    return (
      <div data-testid="dsh-unconfigured" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary, #888)', fontSize: 13 }}>
        dsh 载入地址未配置(后端 env DSH_IFRAME_URL)
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0 }}>
      <iframe
        data-testid="dsh-iframe"
        src={url}
        title="DeepSeek Harness"
        style={{ flex: 1, width: '100%', border: 'none' }}
        allow="clipboard-read; clipboard-write"
      />
      <a data-testid="dsh-open-external" href={url} target="_blank" rel="noreferrer" style={linkStyle}>
        新窗口打开
      </a>
    </div>
  );
};

export default IframeWorkspace;

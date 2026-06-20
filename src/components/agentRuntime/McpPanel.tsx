import React from 'react';
import { diagnoseMcpSettings, getMcpSettings, type McpDiagnosticResponse, type McpSettingsResponse } from '../../services/agentRuntimeApi';

const cardStyle: React.CSSProperties = {
  border: '1px solid #D6CFC4',
  borderRadius: 14,
  background: '#FFFDF9',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const tagStyle: React.CSSProperties = {
  border: '1px solid #D6CFC4',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11,
  color: '#6B625A',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #2563EB',
  borderRadius: 999,
  background: '#2563EB',
  color: '#fff',
  padding: '7px 12px',
  cursor: 'pointer',
  fontSize: 12,
};

const McpPanel: React.FC = () => {
  const [settings, setSettings] = React.useState<McpSettingsResponse | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<McpDiagnosticResponse | null>(null);
  const [error, setError] = React.useState('');
  const [diagnosing, setDiagnosing] = React.useState(false);

  const refreshDiagnostics = async () => {
    setDiagnosing(true);
    try {
      setDiagnostics(await diagnoseMcpSettings());
      setError('');
    } catch {
      setError('MCP 诊断失败');
    } finally {
      setDiagnosing(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    setError('');
    Promise.all([getMcpSettings(), diagnoseMcpSettings()])
      .then(([settingsData, diagnosticsData]) => {
        if (!cancelled) {
          setSettings(settingsData);
          setDiagnostics(diagnosticsData);
        }
      })
      .catch(() => {
        if (!cancelled) setError('MCP 加载失败');
      });
    return () => { cancelled = true; };
  }, []);

  const diagnosticById = new Map((diagnostics?.servers || []).map(server => [server.id, server]));
  const lobsterSupport = settings?.agents.find(agent => agent.id === 'claude-sdk');

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#F5F1EB', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: '#4A4A4A', fontSize: 13 }}>
          这里展示龙虾 Agent 当前可用的 MCP server 和运行诊断状态。
        </div>
        <button type="button" onClick={refreshDiagnostics} disabled={diagnosing} style={{ ...buttonStyle, opacity: diagnosing ? 0.6 : 1 }}>
          刷新诊断
        </button>
      </div>
      {lobsterSupport && !lobsterSupport.supportsMcp && (
        <div style={{ marginBottom: 12, color: '#B91C1C', fontSize: 13 }}>{lobsterSupport.unsupportedReason}</div>
      )}
      {error && <div style={{ marginBottom: 12, color: '#B91C1C', fontSize: 13 }}>{error}</div>}
      {!settings && !error && <div style={{ color: '#8A8177', fontSize: 13 }}>加载中...</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {settings?.servers.map(server => {
          const diagnostic = diagnosticById.get(server.id);
          const assignedToLobster = server.agentIds.includes('claude-sdk');
          return (
            <div key={server.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ color: '#1A1A1A' }}>{server.name}</strong>
                    <span style={tagStyle}>{server.enabled ? '已启用' : '未启用'}</span>
                    <span style={tagStyle}>{assignedToLobster ? '已分配给龙虾' : '未分配给龙虾'}</span>
                    <span style={tagStyle}>{server.secretConfigured ? 'Secret 已配置' : 'Secret 未配置'}</span>
                  </div>
                  <div style={{ color: '#4A4A4A', fontSize: 13 }}>launchMode: {server.launchMode}</div>
                </div>
                <div style={{ color: '#8A8177', fontSize: 11 }}>{server.id}</div>
              </div>
              <div style={{ color: '#8A8177', fontSize: 12, overflowWrap: 'anywhere' }}>secretEnv: {server.secretEnv}</div>
              {diagnostic && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, color: '#4A4A4A', fontSize: 12 }}>
                  <div>platform: {diagnostic.platform}</div>
                  <div>node: {diagnostic.nodeAvailable ? '可用' : '不可用'}</div>
                  <div>npm: {diagnostic.npmAvailable ? '可用' : '不可用'}</div>
                  <div>npx: {diagnostic.npxAvailable ? '可用' : '不可用'}</div>
                  <div style={{ overflowWrap: 'anywhere' }}>bundledEntry: {diagnostic.bundledEntryExists ? '存在' : '不存在'}</div>
                  <div>selectedCommand: {diagnostic.selectedCommand || '无'}</div>
                </div>
              )}
              {diagnostic?.selectedArgs.length ? (
                <pre style={{ margin: 0, padding: 10, borderRadius: 10, background: '#F5F1EB', color: '#1A1A1A', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  selectedArgs: {diagnostic.selectedArgs.join(' ')}
                </pre>
              ) : null}
              {diagnostic?.error && <div style={{ color: '#B91C1C', fontSize: 13 }}>{diagnostic.error}</div>}
            </div>
          );
        })}
        {settings && settings.servers.length === 0 && <div style={{ color: '#8A8177', fontSize: 13 }}>未配置 MCP server。</div>}
      </div>
    </div>
  );
};

export default McpPanel;

import React from 'react';
import { useAppStore } from '../stores/appStore';
import { dbApi } from '../services/dbApi';
import { getMcpSettings, saveMcpSettings, diagnoseMcpSettings, type McpSettingsResponse, type McpDiagnosticResponse, type McpLaunchMode } from '../services/agentRuntimeApi';
import type { ContextStrategy } from '../types/index';

const strategies: Array<{ id: ContextStrategy; name: string; savings: string }> = [
  { id: 'sliding', name: '滑动窗口', savings: '节省 40%' },
  { id: 'full', name: '完整记忆', savings: '基线' },
  { id: 'summary', name: '摘要记忆', savings: '节省 60%' },
  { id: 'none', name: '无记忆', savings: '节省 80%' },
];

const sizePresets = [
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 32768, label: '32K' },
  { value: 131072, label: '128K' },
  { value: 1048576, label: '1M' },
];

const temperaturePresets = [
  { value: 0, label: '精确', desc: '确定性输出' },
  { value: 0.3, label: '低', desc: '较少变化' },
  { value: 0.7, label: '平衡', desc: '适中创意' },
  { value: 1, label: '创意', desc: '最大多样性' },
];

const tabs = [
  { id: 'system', label: '系统信息', icon: 'i' },
  { id: 'mcp', label: 'MCP', icon: 'MCP' },
] as const;
type TabId = typeof tabs[number]['id'];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { contextStrategy, setStrategy, contextSize, setContextSize, temperature, setTemperature, apiKey, setApiKey, apiBaseUrl, setApiBaseUrl, apiModel, setApiModel } = useAppStore();
  const [activeTab, setActiveTab] = React.useState<TabId>('system');
  const [localKey, setLocalKey] = React.useState(apiKey);
  const [localUrl, setLocalUrl] = React.useState(apiBaseUrl);
  const [localModel, setLocalModel] = React.useState(apiModel);
  const [rootDir, setRootDir] = React.useState('');
  const [rootDirError, setRootDirError] = React.useState('');
  const [memoryVersion, setMemoryVersion] = React.useState(0);
  const [mcpSettings, setMcpSettings] = React.useState<McpSettingsResponse | null>(null);
  const [mcpDraft, setMcpDraft] = React.useState<McpSettingsResponse | null>(null);
  const [mcpError, setMcpError] = React.useState('');
  const [mcpSaved, setMcpSaved] = React.useState(false);
  const [mcpDiagnostic, setMcpDiagnostic] = React.useState<McpDiagnosticResponse | null>(null);

  React.useEffect(() => {
    setLocalKey(apiKey);
    setLocalUrl(apiBaseUrl);
    setLocalModel(apiModel);
  }, [apiKey, apiBaseUrl, apiModel]);

  React.useEffect(() => {
    if (!isOpen) return;
    dbApi.fetchRootDir()
      .then(r => {
        setRootDir(r.root_dir);
        setRootDirError('');
      })
      .catch(err => {
        setRootDir('');
        setRootDirError(err instanceof Error ? err.message : '加载失败');
      });
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    getMcpSettings()
      .then(data => {
        setMcpSettings(data);
        setMcpDraft(cloneMcpSettings(data));
        setMcpError('');
        setMcpSaved(false);
      })
      .catch(err => setMcpError(err instanceof Error ? err.message : '加载 MCP 设置失败'));
  }, [isOpen]);

  const cwdKey = rootDir ? `agentlab.cwd:${rootDir}` : '';
  const cwdHistoryKey = rootDir ? `agentlab.cwdHistory:${rootDir}` : '';
  const cwdMemory = React.useMemo(() => cwdKey ? localStorage.getItem(cwdKey) : null, [cwdKey, memoryVersion]);
  const cwdHistoryMemory = React.useMemo(() => cwdHistoryKey ? localStorage.getItem(cwdHistoryKey) : null, [cwdHistoryKey, memoryVersion]);

  const updateMcpServer = (serverId: string, patch: Partial<{ enabled: boolean; agentIds: string[]; launchMode: McpLaunchMode }>) => {
    if (!mcpDraft) return;
    setMcpDraft({
      ...mcpDraft,
      servers: mcpDraft.servers.map(server => server.id === serverId ? { ...server, ...patch } : server),
    });
    setMcpSaved(false);
  };

  const saveMcp = async () => {
    if (!mcpDraft) return;
    const payload = {
      servers: Object.fromEntries(mcpDraft.servers.map(server => [server.id, {
        enabled: server.enabled,
        agentIds: server.agentIds,
        launchMode: server.launchMode,
      }]))
    };
    try {
      const data = await saveMcpSettings(payload);
      setMcpSettings(data);
      setMcpDraft(cloneMcpSettings(data));
      setMcpError('');
      setMcpSaved(true);
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : '保存 MCP 设置失败');
    }
  };

  const runMcpDiagnose = async () => {
    try {
      const data = await diagnoseMcpSettings();
      setMcpDiagnostic(data);
      setMcpError('');
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : '诊断 MCP 设置失败');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '620px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex',
          maxHeight: '80vh',
        }}
      >
        {/* Left: Tabs */}
        <div style={{
          width: '120px', flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          padding: '16px 0',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '0 16px 12px', fontSize: '17px', fontWeight: 600,
            borderBottom: '1px solid var(--border-subtle)', marginBottom: '8px',
          }}>
            ⚙ 设置
          </div>
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex', alignItems: 'center', gap: '8px',
                color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                background: activeTab === tab.id ? 'rgba(91,156,245,0.06)' : 'transparent',
                borderLeft: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div
            onClick={onClose}
            style={{
              padding: '10px 16px', cursor: 'pointer', fontSize: '13px',
              color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            ✕ 关闭
          </div>
        </div>

        {/* Right: Content */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {activeTab === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <SectionTitle>当前环境</SectionTitle>
              <InfoRow label="前端地址" value={window.location.origin} />
              <InfoRow label="Agent Runtime API" value="/api/agents" />
              <InfoRow label="后端 rootDir" value={rootDir || (rootDirError ? `加载失败：${rootDirError}` : '加载中...')} />

              <SectionTitle>工作目录记忆</SectionTitle>
              <InfoRow label="cwd key" value={cwdKey || '等待 rootDir'} />
              <InfoRow label="cwd 当前值" value={cwdMemory || '未记录'} />
              <InfoRow label="history key" value={cwdHistoryKey || '等待 rootDir'} />
              <InfoRow label="history 状态" value={cwdHistoryMemory ? '已记录' : '未记录'} />
              <button
                disabled={!rootDir}
                onClick={() => {
                  if (!rootDir) return;
                  localStorage.removeItem(`agentlab.cwd:${rootDir}`);
                  localStorage.removeItem(`agentlab.cwdHistory:${rootDir}`);
                  setMemoryVersion(v => v + 1);
                }}
                style={buttonStyle}
              >
                清除当前 rootDir 的工作目录记忆
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                只清理浏览器 localStorage 中当前 rootDir 的 cwd/cwdHistory，不影响 MySQL 会话。
              </div>
            </div>
          )}

          {activeTab === 'mcp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={noticeStyle}>MCP 是平台级全局设置；Claude SDK Agent 走原生 MCP 注入，项目助手和研究助手通过 MCP Tool Adapter 接入，非 LLM tool-use 智能体会显示为暂不支持。</div>
              {mcpError && <div style={errorStyle}>{mcpError}</div>}
              {!mcpDraft && !mcpError && <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>加载中...</div>}
              {mcpDraft?.servers.map(server => {
                const diagnostic = mcpDiagnostic?.servers.find(s => s.id === server.id);
                const supportedAgents = mcpDraft.agents.filter(agent => agent.supportsMcp);
                const unsupportedAgents = mcpDraft.agents.filter(agent => !agent.supportsMcp);
                return (
                  <div key={server.id} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <SectionTitle>{server.name}</SectionTitle>
                    <label style={checkboxRowStyle}>
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={e => updateMcpServer(server.id, { enabled: e.target.checked })}
                      />
                      <span>启用 {server.id}</span>
                    </label>
                    <InfoRow label="密钥变量" value={server.secretEnv} />
                    <InfoRow label="密钥状态" value={server.secretConfigured ? '已配置' : '未配置'} />
                    <div>
                      <SectionTitle>启动模式</SectionTitle>
                      <select
                        value={server.launchMode}
                        onChange={e => updateMcpServer(server.id, { launchMode: e.target.value as McpLaunchMode })}
                        style={selectStyle}
                      >
                        <option value="auto">auto</option>
                        <option value="npx">npx</option>
                        <option value="bundled">bundled</option>
                      </select>
                    </div>
                    <div>
                      <SectionTitle>关联支持 MCP 的智能体</SectionTitle>
                      {supportedAgents.map(agent => (
                        <label key={agent.id} style={checkboxRowStyle}>
                          <input
                            type="checkbox"
                            checked={server.agentIds.includes(agent.id)}
                            onChange={e => {
                              const agentIds = e.target.checked
                                ? [...server.agentIds, agent.id].filter((id, idx, arr) => arr.indexOf(id) === idx)
                                : server.agentIds.filter(id => id !== agent.id);
                              updateMcpServer(server.id, { agentIds });
                            }}
                          />
                          <span>{agent.name} ({agent.id})</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <SectionTitle>暂不支持 MCP 的智能体</SectionTitle>
                      {unsupportedAgents.map(agent => (
                        <InfoRow key={agent.id} label={agent.name} value={agent.unsupportedReason} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveMcp} style={buttonStyle}>保存 MCP 设置</button>
                      <button onClick={runMcpDiagnose} style={buttonStyle}>运行诊断</button>
                      {mcpSaved && <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--accent-emerald)' }}>已保存</span>}
                    </div>
                    {diagnostic && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <SectionTitle>诊断结果</SectionTitle>
                        <InfoRow label="platform" value={diagnostic.platform} />
                        <InfoRow label="node" value={diagnostic.nodeAvailable ? '可用' : '不可用'} />
                        <InfoRow label="npm" value={diagnostic.npmAvailable ? '可用' : '不可用'} />
                        <InfoRow label="npx" value={diagnostic.npxAvailable ? '可用' : '不可用'} />
                        <InfoRow label="bundled" value={diagnostic.bundledEntryExists ? diagnostic.bundledEntry : '未找到预装入口'} />
                        <InfoRow label="command" value={diagnostic.selectedCommand || '未选择'} />
                        <InfoRow label="args" value={diagnostic.selectedArgs.join(' ')} />
                        <InfoRow label="error" value={diagnostic.error || '无'} />
                      </div>
                    )}
                  </div>
                );
              })}
              {mcpSettings && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>配置文件只保存 enabled / agentIds / launchMode，不保存任何 API Key。</div>}
            </div>
          )}

          {activeTab === 'context' && (
            <>
              <div style={noticeStyle}>这些设置仅影响旧版 Chat 实验页，不影响当前 Agent Runtime 智能体工作区。</div>
              <SectionTitle>上下文策略</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                {strategies.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setStrategy(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
                      border: `1px solid ${contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--border-subtle)'}`,
                      background: contextStrategy === s.id ? 'rgba(167,139,250,0.06)' : 'var(--bg-surface)',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500 }}>
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-tertiary)',
                      }} />
                      <span style={{ color: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-secondary)' }}>
                        {s.name}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '12px',
                      color: s.savings === '基线' ? 'var(--text-tertiary)' : 'var(--accent-emerald)',
                    }}>
                      {s.savings}
                    </span>
                  </div>
                ))}
              </div>

              <SectionTitle>上下文窗口大小</SectionTitle>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {sizePresets.map(p => (
                  <div
                    key={p.value}
                    onClick={() => setContextSize(p.value)}
                    style={{
                      flex: 1, padding: '10px 0', textAlign: 'center',
                      background: contextSize === p.value ? 'rgba(91,156,245,0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${contextSize === p.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600,
                      color: contextSize === p.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>tokens</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '20px' }}>
                当前主要用于旧版 Chat 的显示/保存，不是 Agent Runtime 的真实模型窗口。
              </div>

              <SectionTitle>温度参数</SectionTitle>
              <div style={{ display: 'flex', gap: '6px' }}>
                {temperaturePresets.map(p => (
                  <div
                    key={p.value}
                    onClick={() => setTemperature(p.value)}
                    style={{
                      flex: 1, padding: '10px 0', textAlign: 'center',
                      background: temperature === p.value ? 'rgba(245,158,11,0.08)' : 'var(--bg-surface)',
                      border: `1px solid ${temperature === p.value ? '#f59e0b' : 'var(--border-subtle)'}`,
                      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600,
                      color: temperature === p.value ? '#f59e0b' : 'var(--text-secondary)',
                    }}>
                      {p.value}
                    </div>
                    <div style={{
                      fontSize: '12px', color: temperature === p.value ? '#f59e0b' : 'var(--text-tertiary)',
                      marginTop: '2px',
                    }}>
                      {p.desc}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'api' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={noticeStyle}>这些 API 设置仅影响旧版 Chat 实验页；Agent Runtime 使用后端环境变量配置。</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  id="settings-file-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        try {
                          const config = JSON.parse(event.target?.result as string);
                          const env = config.env || {};
                          let modelName = 'claude-3-5-sonnet-20240620';
                          if (config.model === 'opus') modelName = 'claude-3-opus-20240229';
                          else if (config.model === 'haiku') modelName = 'claude-3-haiku-20240307';
                          else if (config.model?.includes('sonnet')) modelName = 'claude-3-5-sonnet-20240620';

                          const apiKey = env.ANTHROPIC_AUTH_TOKEN || '';
                          const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

                          setLocalKey(apiKey);
                          setLocalUrl(baseUrl);
                          setLocalModel(modelName);
                          setApiKey(apiKey);
                          setApiBaseUrl(baseUrl);
                          setApiModel(modelName);
                        } catch (err) {
                          alert('解析 settings.json 失败: ' + (err as Error).message);
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <label
                  htmlFor="settings-file-upload"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(91,156,245,0.1)',
                    border: '1px solid rgba(91,156,245,0.3)',
                    borderRadius: '8px',
                    color: 'var(--accent-blue)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(91,156,245,0.18)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,156,245,0.45)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(91,156,245,0.1)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(91,156,245,0.3)';
                  }}
                >
                  📁 选择 settings.json
                </label>
                <button
                  onClick={() => {
                    const envKey = import.meta.env.VITE_CLAUDE_API_KEY || '';
                    const envUrl = import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com';
                    const envModel = import.meta.env.VITE_CLAUDE_MODEL || 'claude-sonnet-4-6';
                    setLocalKey(envKey);
                    setLocalUrl(envUrl);
                    setLocalModel(envModel);
                    setApiKey(envKey);
                    setApiBaseUrl(envUrl);
                    setApiModel(envModel);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  📥 从环境变量读取
                </button>
              </div>
              <div>
                <SectionTitle>API Key</SectionTitle>
                <input
                  type="password"
                  value={localKey}
                  onChange={e => setLocalKey(e.target.value)}
                  onBlur={() => setApiKey(localKey)}
                  placeholder="输入 API Key"
                  style={inputStyle}
                />
              </div>
              <div>
                <SectionTitle>Base URL</SectionTitle>
                <input
                  type="text"
                  value={localUrl}
                  onChange={e => setLocalUrl(e.target.value)}
                  onBlur={() => setApiBaseUrl(localUrl)}
                  placeholder="https://api.anthropic.com"
                  style={inputStyle}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>
                  dev 环境真实代理目标由启动时 VITE_CLAUDE_BASE_URL / Vite proxy 决定；运行时修改这里不一定改变代理目标。
                </div>
              </div>
              <div>
                <SectionTitle>模型</SectionTitle>
                <input
                  type="text"
                  value={localModel}
                  onChange={e => setLocalModel(e.target.value)}
                  onBlur={() => setApiModel(localModel)}
                  placeholder="claude-3-5-sonnet-20240620"
                  style={inputStyle}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  常用: claude-3-5-sonnet-20240620, claude-3-opus-20240229, claude-3-haiku-20240307
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
    }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13 }}>
      <div style={{ width: 110, flexShrink: 0, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

const noticeStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'rgba(245,158,11,0.08)',
  border: '1px solid rgba(245,158,11,0.22)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  cursor: 'pointer',
};

function cloneMcpSettings(settings: McpSettingsResponse): McpSettingsResponse {
  return {
    servers: settings.servers.map(server => ({ ...server, agentIds: [...server.agentIds] })),
    agents: settings.agents.map(agent => ({ ...agent })),
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: '6px', color: 'var(--text-primary)',
  fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: 'var(--text-secondary)',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.22)',
  color: 'var(--accent-red)',
  fontSize: '12px',
  lineHeight: 1.5,
};

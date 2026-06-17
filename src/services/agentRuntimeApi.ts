// 调后端 /api/agents + 订阅 SSE 流

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  workspace: { type: 'chat' | 'tabs'; tabs?: string[] };
  capabilities: string[];
}

export interface AgentEvent {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'token_usage' | 'action' | 'error' | 'done';
  data: Record<string, any>;
}

export type McpLaunchMode = 'auto' | 'npx' | 'bundled';

export interface McpAgentSupport {
  id: string;
  name: string;
  supportsMcp: boolean;
  unsupportedReason: string;
}

export interface McpServerSettings {
  id: string;
  name: string;
  enabled: boolean;
  agentIds: string[];
  launchMode: McpLaunchMode;
  secretEnv: string;
  secretConfigured: boolean;
  supportedAgentIds: string[];
  unsupportedReason: string;
}

export interface McpSettingsResponse {
  servers: McpServerSettings[];
  agents: McpAgentSupport[];
}

export interface McpDiagnosticServer {
  id: string;
  enabled: boolean;
  agentIds: string[];
  launchMode: McpLaunchMode;
  secretEnv: string;
  secretConfigured: boolean;
  platform: string;
  nodeAvailable: boolean;
  npmAvailable: boolean;
  npxAvailable: boolean;
  bundledEntry: string;
  bundledEntryExists: boolean;
  selectedCommand: string;
  selectedArgs: string[];
  error: string;
}

export interface McpDiagnosticResponse {
  servers: McpDiagnosticServer[];
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: string;
  truncated: boolean;
  enabled: boolean;
  agentIds: string[];
}

export interface SkillAgentSupport {
  id: string;
  name: string;
  supportsSkill: boolean;
  unsupportedReason: string;
}

export interface SkillSettingsResponse {
  skills: SkillInfo[];
  agents: SkillAgentSupport[];
}

export interface GlobalPromptAgentSupport {
  id: string;
  name: string;
  supportsGlobalPrompt: boolean;
  unsupportedReason: string;
}

export interface GlobalPromptSettingsResponse {
  enabled: boolean;
  prompt: string;
  agents: GlobalPromptAgentSupport[];
}

const BASE = '/api/agents';

export async function listAgents(): Promise<AgentInfo[]> {
  const resp = await fetch(BASE);
  if (!resp.ok) throw new Error(`listAgents failed: ${resp.status}`);
  return resp.json();
}

export async function getAgent(id: string): Promise<AgentInfo> {
  const resp = await fetch(`${BASE}/${id}`);
  if (!resp.ok) throw new Error(`getAgent failed: ${resp.status}`);
  return resp.json();
}

export async function getMcpSettings(): Promise<McpSettingsResponse> {
  const resp = await fetch('/api/settings/mcp');
  if (!resp.ok) throw new Error(`getMcpSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveMcpSettings(payload: { servers: Record<string, { enabled: boolean; agentIds: string[]; launchMode: McpLaunchMode }> }): Promise<McpSettingsResponse> {
  const resp = await fetch('/api/settings/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveMcpSettings failed: ${resp.status}`);
  return resp.json();
}

export async function diagnoseMcpSettings(): Promise<McpDiagnosticResponse> {
  const resp = await fetch('/api/settings/mcp/diagnose', { method: 'POST' });
  if (!resp.ok) throw new Error(`diagnoseMcpSettings failed: ${resp.status}`);
  return resp.json();
}

export async function getSkillSettings(): Promise<SkillSettingsResponse> {
  const resp = await fetch('/api/settings/skills');
  if (!resp.ok) throw new Error(`getSkillSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveSkillSettings(payload: { skills: Record<string, { enabled: boolean; agentIds: string[] }> }): Promise<SkillSettingsResponse> {
  const resp = await fetch('/api/settings/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveSkillSettings failed: ${resp.status}`);
  return resp.json();
}

export async function getGlobalPromptSettings(): Promise<GlobalPromptSettingsResponse> {
  const resp = await fetch('/api/settings/global-prompt');
  if (!resp.ok) throw new Error(`getGlobalPromptSettings failed: ${resp.status}`);
  return resp.json();
}

export async function saveGlobalPromptSettings(payload: { enabled: boolean; prompt: string }): Promise<GlobalPromptSettingsResponse> {
  const resp = await fetch('/api/settings/global-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`saveGlobalPromptSettings failed: ${resp.status}`);
  return resp.json();
}

/**
 * 运行 agent,订阅 SSE 事件。用 fetch + ReadableStream 解析(EventSource 不支持 POST)。
 * onEvent 每个事件回调;onDone 流结束回调;onError 错误回调。
 * signal 可选,用于客户端主动中断(透传给 fetch + reader)。中断时静默退出,不调任何回调,
 * 由调用方(store)负责收尾。
 */
export async function runAgent(
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  cwd: string | null,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/${agentId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, cwd }),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    onError(e?.message || 'fetch failed');
    return;
  }
  if (!resp.ok) {
    onError(`HTTP ${resp.status}`);
    return;
  }
  if (!resp.body) {
    onError('no response body');
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) { try { await reader.cancel(); } catch { /* noop */ } return; }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const json = line.slice(6);
        try {
          const event: AgentEvent = JSON.parse(json);
          onEvent(event);
          if (event.type === 'done') { onDone(); return; }
          if (event.type === 'error') { onError(event.data.error || 'error'); return; }
        } catch { /* skip malformed */ }
      }
    }
    onDone();
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal?.aborted) return;
    onError(e?.message || 'stream error');
  }
}

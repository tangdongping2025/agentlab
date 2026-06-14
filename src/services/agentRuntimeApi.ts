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

/**
 * 运行 agent,订阅 SSE 事件。用 fetch + ReadableStream 解析(EventSource 不支持 POST)。
 * onEvent 每个事件回调;onDone 流结束回调;onError 错误回调。
 */
export async function runAgent(
  agentId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onEvent: (event: AgentEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const resp = await fetch(`${BASE}/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
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
    onError(e?.message || 'stream error');
  }
}

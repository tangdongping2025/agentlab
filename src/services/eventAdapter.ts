import type { AgentEvent } from './agentRuntimeApi';

// 把 SSE 事件累计成显示用的消息 + 事件流(v1 简化格式)

export interface DisplayEvent {
  type: AgentEvent['type'];
  label: string;       // 显示文本
  detail?: string;     // 详情
  ts: number;
}

/** 从 AgentEvent 生成 DisplayEvent(用于事件流面板) */
export function toDisplayEvent(ev: AgentEvent): DisplayEvent | null {
  switch (ev.type) {
    case 'text': return null;  // text 累计到消息,不单独显示
    case 'thinking': return { type: 'thinking', label: '思考', detail: ev.data.content || '', ts: Date.now() };
    case 'tool_call': return { type: 'tool_call', label: `调用工具: ${ev.data.name || ''}`, detail: JSON.stringify(ev.data.params || {}), ts: Date.now() };
    case 'tool_result': return { type: 'tool_result', label: '工具结果', detail: String(ev.data.result || '').slice(0, 200), ts: Date.now() };
    case 'token_usage': return { type: 'token_usage', label: `Token: in ${ev.data.input_tokens} / out ${ev.data.output_tokens}`, ts: Date.now() };
    case 'error': return { type: 'error', label: `错误: ${ev.data.error || ''}`, ts: Date.now() };
    default: return null;
  }
}

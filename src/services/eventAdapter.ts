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
    case 'action': {
      const d = ev.data;
      if (d._action === 'switch_agent') {
        return { type: 'action', label: `切换到 agent: ${d.agent_id || ''}`, ts: Date.now() };
      }
      if (d.action === 'strategy_effect') {
        const saving = (d.before_tokens ?? 0) - (d.after_tokens ?? 0);
        return {
          type: 'action',
          label: `策略 ${d.strategy}: ${d.before_count}→${d.after_count} 条, ${d.before_tokens}→${d.after_tokens} tokens(省 ${saving})`,
          detail: d.summary ? `摘要: ${String(d.summary).slice(0, 150)}` : undefined,
          ts: Date.now(),
        };
      }
      return { type: 'action', label: `动作: ${d.action || d._action || ''}`, ts: Date.now() };
    }
    default: return null;
  }
}

export interface ObsStep {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result';
  label: string;
  detail?: string;
}

export interface ObsTokenUsage {
  input: number;
  output: number;
}

export interface ObsStrategyEffect {
  strategy: string;
  triggered: boolean;
  before_count: number;
  after_count: number;
  beforeTokenCount: number;
  afterTokenCount: number;
  beforeMessages: Array<{ role: string; content: string }>;
  afterMessages: Array<{ role: string; content: string }>;
  summary?: string | null;
  summarySourceCount?: number | null;
}

export interface ObservabilityData {
  steps: ObsStep[];
  tokenUsage: ObsTokenUsage;
  strategyEffect: ObsStrategyEffect | null;
}

/** 把一次 agent run 的所有 SSE 事件聚合成结构化的可观察性数据(steps + token + 策略效果) */
export function aggregateObservability(events: AgentEvent[]): ObservabilityData {
  const steps: ObsStep[] = [];
  let input = 0, output = 0;
  let strategyEffect: ObsStrategyEffect | null = null;
  let textCount = 0, toolIdx = 0;

  for (const ev of events) {
    if (ev.type === 'text') {
      textCount++;
      steps.push({ id: `text-${textCount}`, type: 'text', label: '生成文本', detail: String(ev.data.text || '').slice(0, 120) });
    } else if (ev.type === 'tool_call') {
      toolIdx++;
      steps.push({ id: `tool-${toolIdx}`, type: 'tool_call', label: `调用工具: ${ev.data.name || ''}`, detail: JSON.stringify(ev.data.params || {}) });
    } else if (ev.type === 'tool_result') {
      steps.push({ id: `result-${toolIdx}`, type: 'tool_result', label: `工具结果: ${ev.data.name || ''}`, detail: String(ev.data.result || '').slice(0, 200) });
    } else if (ev.type === 'token_usage') {
      input = ev.data.input_tokens ?? 0;
      output = ev.data.output_tokens ?? 0;
    } else if (ev.type === 'action' && ev.data.action === 'strategy_effect') {
      const d = ev.data;
      strategyEffect = {
        strategy: d.strategy,
        triggered: !!d.triggered,
        before_count: d.before_count ?? 0,
        after_count: d.after_count ?? 0,
        beforeTokenCount: d.beforeTokenCount ?? d.before_tokens ?? 0,
        afterTokenCount: d.afterTokenCount ?? d.after_tokens ?? 0,
        beforeMessages: d.beforeMessages ?? [],
        afterMessages: d.afterMessages ?? [],
        summary: d.summary ?? null,
        summarySourceCount: d.summarySourceCount ?? null,
      };
    }
  }
  return { steps, tokenUsage: { input, output }, strategyEffect };
}

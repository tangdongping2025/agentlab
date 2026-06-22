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
      if (d.action === 'retry') {
        return {
          type: 'action',
          label: `连接不稳定,正在重试(第 ${d.attempt}/${d.maxAttempts} 次尝试)`,
          detail: `${d.nextRetryIn}s 后重试 · ${d.reason}`,
          ts: Date.now(),
        };
      }
      if (d.action === 'strategy_effect') {
        const beforeChars = d.beforeCharCount ?? d.before_chars ?? d.before_tokens ?? 0;
        const afterChars = d.afterCharCount ?? d.after_chars ?? d.after_tokens ?? 0;
        if (d.strategy === 'context_compression') {
          return {
            type: 'action',
            label: `已自动压缩早期上下文: ${beforeChars}→${afterChars} 字符`,
            detail: '原始会话记录仍完整保留',
            ts: Date.now(),
          };
        }
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
  type: 'text' | 'tool_call';
  label: string;
  detail?: string;
  text?: string;                    // text 步骤的完整累积内容
  toolName?: string;                // 工具步骤
  toolParams?: Record<string, any>; // 工具步骤
  toolResult?: any;                 // 工具步骤(由配对的 tool_result 回填)
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
  beforeCharCount?: number;
  afterCharCount?: number;
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

/** 把一次 agent run 的所有 SSE 事件聚合成结构化的可观察性数据(steps + token + 策略效果)。
 *  步骤合并规则:连续 text 合并成一个「生成文本」步骤(流式 chunk 不各算一步);
 *  tool_call + 紧接的 tool_result 配对一个「工具」步骤(回填 result)。 */
export function aggregateObservability(events: AgentEvent[]): ObservabilityData {
  const steps: ObsStep[] = [];
  let input = 0, output = 0;
  let strategyEffect: ObsStrategyEffect | null = null;
  let toolIdx = 0;
  let textBuf = '';
  let textStepCount = 0;

  const flushText = () => {
    if (textBuf) {
      textStepCount++;
      steps.push({
        id: `text-${textStepCount}`, type: 'text', label: '生成文本',
        detail: textBuf.slice(0, 500), text: textBuf,
      });
      textBuf = '';
    }
  };

  for (const ev of events) {
    if (ev.type === 'text') {
      textBuf += ev.data.text || '';
    } else if (ev.type === 'tool_call') {
      flushText();
      toolIdx++;
      steps.push({
        id: `tool-${toolIdx}`, type: 'tool_call',
        label: `调用工具: ${ev.data.name || ''}`,
        detail: JSON.stringify(ev.data.params || {}),
        toolName: ev.data.name, toolParams: ev.data.params || {},
      });
    } else if (ev.type === 'tool_result') {
      // 回填到最近一个尚未有 result 的 tool 步骤
      const lastTool = [...steps].reverse().find(s => s.type === 'tool_call' && s.toolResult === undefined);
      if (lastTool) {
        lastTool.toolResult = ev.data.result;
        lastTool.detail = `${JSON.stringify(lastTool.toolParams)} → ${String(ev.data.result || '').slice(0, 200)}`;
      }
    } else if (ev.type === 'token_usage') {
      flushText();
      input = ev.data.input_tokens ?? 0;
      output = ev.data.output_tokens ?? 0;
    } else if (ev.type === 'action' && ev.data.action === 'strategy_effect') {
      flushText();
      const d = ev.data;
      strategyEffect = {
        strategy: d.strategy,
        triggered: !!d.triggered,
        before_count: d.before_count ?? 0,
        after_count: d.after_count ?? 0,
        beforeTokenCount: d.beforeTokenCount ?? d.before_tokens ?? 0,
        afterTokenCount: d.afterTokenCount ?? d.after_tokens ?? 0,
        beforeCharCount: d.beforeCharCount ?? d.before_chars ?? d.before_tokens ?? 0,
        afterCharCount: d.afterCharCount ?? d.after_chars ?? d.after_tokens ?? 0,
        beforeMessages: d.beforeMessages ?? [],
        afterMessages: d.afterMessages ?? [],
        summary: d.summary ?? null,
        summarySourceCount: d.summarySourceCount ?? null,
      };
    }
  }
  flushText();
  return { steps, tokenUsage: { input, output }, strategyEffect };
}

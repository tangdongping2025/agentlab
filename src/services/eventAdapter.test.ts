import { describe, it, expect } from 'vitest';
import { aggregateObservability } from './eventAdapter';
import type { AgentEvent } from './agentRuntimeApi';

describe('aggregateObservability', () => {
  it('把 text/tool_call/tool_result/token_usage/action 聚合成结构', () => {
    const events: AgentEvent[] = [
      { type: 'text', data: { text: '你好' } },
      { type: 'tool_call', data: { name: 'anysearch', params: { q: 'x' } } },
      { type: 'tool_result', data: { name: 'anysearch', result: '...' } },
      { type: 'token_usage', data: { input_tokens: 12, output_tokens: 3 } },
      { type: 'action', data: { action: 'strategy_effect', strategy: 'sliding', before_count: 15, after_count: 10, beforeTokenCount: 30, afterTokenCount: 20, triggered: true, beforeMessages: [], afterMessages: [] } },
    ];
    const obs = aggregateObservability(events);
    expect(obs.steps.length).toBe(3);
    expect(obs.tokenUsage.input).toBe(12);
    expect(obs.tokenUsage.output).toBe(3);
    expect(obs.strategyEffect?.strategy).toBe('sliding');
    expect(obs.strategyEffect?.triggered).toBe(true);
  });

  it('无 strategy_effect 时 strategyEffect 为 null', () => {
    const obs = aggregateObservability([{ type: 'text', data: { text: 'hi' } }]);
    expect(obs.strategyEffect).toBeNull();
  });
});

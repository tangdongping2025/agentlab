import { describe, it, expect } from 'vitest';
import { aggregateObservability, toDisplayEvent } from './eventAdapter';
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
    expect(obs.steps.length).toBe(2);  // text + tool_call(tool_result 已合并)
    expect(obs.steps[0].type).toBe('text');
    expect(obs.steps[0].text).toBe('你好');
    expect(obs.steps[1].type).toBe('tool_call');
    expect(obs.steps[1].toolName).toBe('anysearch');
    expect(obs.steps[1].toolResult).toBe('...');  // tool_result 回填
    expect(obs.tokenUsage.input).toBe(12);
    expect(obs.tokenUsage.output).toBe(3);
    expect(obs.strategyEffect?.strategy).toBe('sliding');
    expect(obs.strategyEffect?.triggered).toBe(true);
  });

  it('无 strategy_effect 时 strategyEffect 为 null', () => {
    const obs = aggregateObservability([{ type: 'text', data: { text: 'hi' } }]);
    expect(obs.strategyEffect).toBeNull();
  });

  it('聚合 context_compression strategy_effect 的摘要和字符数', () => {
    const obs = aggregateObservability([
      {
        type: 'action',
        data: {
          action: 'strategy_effect',
          strategy: 'context_compression',
          triggered: true,
          summary: '早期上下文摘要',
          summarySourceCount: 18,
          before_chars: 52000,
          after_chars: 12000,
        },
      },
    ]);

    expect(obs.strategyEffect).toEqual(expect.objectContaining({
      strategy: 'context_compression',
      triggered: true,
      summary: '早期上下文摘要',
      summarySourceCount: 18,
      beforeCharCount: 52000,
      afterCharCount: 12000,
    }));
  });

  it('把 context_compression strategy_effect 显示为用户友好提示', () => {
    const display = toDisplayEvent({
      type: 'action',
      data: {
        action: 'strategy_effect',
        strategy: 'context_compression',
        before_chars: 52000,
        after_chars: 12000,
      },
    });

    expect(display?.label).toBe('已自动压缩早期上下文: 52000→12000 字符');
    expect(display?.detail).toBe('原始会话记录仍完整保留');
  });
});

describe('toDisplayEvent retry action', () => {
  it('retry action 显示重试进度', () => {
    const display = toDisplayEvent({
      type: 'action',
      data: { action: 'retry', attempt: 2, maxAttempts: 3, reason: 'RuntimeError: timeout', nextRetryIn: 1 },
    });
    expect(display?.label).toBe('连接不稳定,正在重试(第 2/3 次尝试)');
    expect(display?.detail).toBe('1s 后重试 · RuntimeError: timeout');
  });

  it('retry 分支不影响其他 action 类型(switch_agent)', () => {
    const display = toDisplayEvent({
      type: 'action',
      data: { _action: 'switch_agent', agent_id: 'research' },
    });
    expect(display?.label).toBe('切换到 agent: research');
  });
});

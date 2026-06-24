import { describe, it, expect } from 'vitest';
import { aggregateObservability, toDisplayEvent, getWorkspaceStatus } from './eventAdapter';
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

describe('getWorkspaceStatus', () => {
  it('零事件 → 正在启动(冷启动)', () => {
    expect(getWorkspaceStatus([])).toBe('正在启动…');
  });

  it('thinking → 正在思考', () => {
    expect(getWorkspaceStatus([{ type: 'thinking', label: '思考', detail: '...', ts: 0 }])).toBe('正在思考…');
  });

  it('tool_result → 正在分析工具结果', () => {
    expect(getWorkspaceStatus([{ type: 'tool_result', label: '工具结果', detail: '...', ts: 0 }])).toBe('正在分析工具结果…');
  });

  it('WebSearch tool_call → 显示搜索 query', () => {
    const ev = toDisplayEvent({ type: 'tool_call', data: { name: 'WebSearch', params: { query: '税友公司介绍' } } })!;
    expect(getWorkspaceStatus([ev])).toBe('🔍 正在搜索「税友公司介绍」…');
  });

  it('Read tool_call → 正在查看文件', () => {
    const ev = toDisplayEvent({ type: 'tool_call', data: { name: 'Read', params: {} } })!;
    expect(getWorkspaceStatus([ev])).toBe('正在查看文件…');
  });

  it('Bash tool_call → 正在执行命令', () => {
    const ev = toDisplayEvent({ type: 'tool_call', data: { name: 'Bash', params: {} } })!;
    expect(getWorkspaceStatus([ev])).toBe('正在执行命令…');
  });

  it('未知工具 → 正在使用工具', () => {
    const ev = toDisplayEvent({ type: 'tool_call', data: { name: 'Foo', params: {} } })!;
    expect(getWorkspaceStatus([ev])).toBe('正在使用工具…');
  });

  it('取最新相关事件(tool_call 后又 thinking)', () => {
    const tc = toDisplayEvent({ type: 'tool_call', data: { name: 'WebSearch', params: { query: 'x' } } })!;
    const th = { type: 'thinking', label: '思考', detail: '', ts: 2 };
    expect(getWorkspaceStatus([tc, th])).toBe('正在思考…');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { agentService } from './agentService';

describe('agentService.loadHistory', () => {
  beforeEach(() => {
    agentService.clearHistory();
  });

  it('loads non-empty messages as LLM context', () => {
    agentService.loadHistory([
      { role: 'user', content: '之前的问题' },
      { role: 'assistant', content: '之前的回答' },
    ]);
    expect(agentService.getHistory()).toEqual([
      { role: 'user', content: '之前的问题' },
      { role: 'assistant', content: '之前的回答' },
    ]);
  });

  it('filters out empty-content messages (avoids LLM 400)', () => {
    agentService.loadHistory([
      { role: 'user', content: '有效问题' },
      { role: 'assistant', content: '' },      // 空，过滤
      { role: 'user', content: '   ' },         // 空白，过滤
      { role: 'assistant', content: '有效回答' },
    ]);
    expect(agentService.getHistory()).toEqual([
      { role: 'user', content: '有效问题' },
      { role: 'assistant', content: '有效回答' },
    ]);
  });

  it('clears previous history on load (no cross-session leak)', () => {
    agentService.loadHistory([{ role: 'user', content: '会话A' }]);
    agentService.loadHistory([{ role: 'user', content: '会话B' }]);
    expect(agentService.getHistory()).toEqual([{ role: 'user', content: '会话B' }]);
  });
});

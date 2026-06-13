import { describe, it, expect } from 'vitest';
import { sanitizeMessagesForApi, isEmptyContent } from './sanitizeMessages';

describe('isEmptyContent', () => {
  it('treats empty/whitespace string as empty', () => {
    expect(isEmptyContent('')).toBe(true);
    expect(isEmptyContent('   ')).toBe(true);
    expect(isEmptyContent('hi')).toBe(false);
  });

  it('treats empty array as empty', () => {
    expect(isEmptyContent([])).toBe(true);
  });

  it('treats array of only empty-text blocks as empty', () => {
    expect(isEmptyContent([{ type: 'text', text: '' }])).toBe(true);
    expect(isEmptyContent([{ type: 'text', text: '  ' }])).toBe(true);
  });

  it('treats array with real text or image blocks as non-empty', () => {
    expect(isEmptyContent([{ type: 'text', text: 'hello' }])).toBe(false);
    expect(isEmptyContent([{ type: 'image', source: {} }])).toBe(false);
    expect(isEmptyContent([{ type: 'tool_use', name: 'x' }])).toBe(false);
  });
});

describe('sanitizeMessagesForApi', () => {
  it('removes empty-string assistant message and merges consecutive users', () => {
    const out = sanitizeMessagesForApi([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'yo' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'hi\nyo' }]);
  });

  it('removes empty-array assistant message (the agentService line-818 bug)', () => {
    const out = sanitizeMessagesForApi([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: [] },
      { role: 'user', content: '再问' },
    ]);
    expect(out).toEqual([{ role: 'user', content: '问题\n再问' }]);
  });

  it('removes multiple empty assistant messages between users', () => {
    const out = sanitizeMessagesForApi([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: [] },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'c' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'a\nb\nc' }]);
  });

  it('keeps a normal alternating conversation unchanged', () => {
    const conv = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'bye' },
    ];
    expect(sanitizeMessagesForApi(conv)).toEqual(conv);
  });

  it('keeps assistant message with real content', () => {
    const out = sanitizeMessagesForApi([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].content).toEqual([{ type: 'text', text: 'answer' }]);
  });

  it('preserves alternation when a middle assistant is dropped', () => {
    // 删掉中间空 assistant 后，两侧 user 合并，仍以 user 开头、合法交替
    const out = sanitizeMessagesForApi([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: '' },   // 空，删
      { role: 'user', content: 'u3' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2\nu3' },
    ]);
  });
});

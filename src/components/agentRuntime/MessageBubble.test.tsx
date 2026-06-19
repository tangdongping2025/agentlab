import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MessageBubble from './MessageBubble';

describe('MessageBubble', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('user message renders raw text (no markdown)', () => {
    render(<MessageBubble role="user" content="hello **world**" />);
    expect(screen.getByText('hello **world**')).toBeTruthy();
  });
  it('AI message renders markdown bold', () => {
    const { container } = render(<MessageBubble role="assistant" content="**hi**" />);
    expect(container.querySelector('strong')).toBeTruthy();
  });
  it('AI markdown renders article-style structural elements', () => {
    const { container } = render(
      <MessageBubble
        role="assistant"
        content={[
          '## 核心判断',
          '',
          '一句话结论。',
          '',
          '> 关键提示。',
          '',
          '- 子点一',
          '- 子点二',
          '',
          '| 维度 | 说明 |',
          '|---|---|',
          '| 条目A | 内容 |',
          '',
          '---',
          '',
          '[链接](https://example.com)',
        ].join('\n')}
      />
    );

    expect(container.querySelector('[data-testid="assistant-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markdown-content"]')).toBeTruthy();
    expect(container.querySelector('h2')?.textContent).toBe('核心判断');
    expect(container.querySelector('blockquote')?.textContent).toContain('关键提示');
    expect(container.querySelector('ul li')?.textContent).toBe('子点一');
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('hr')).toBeTruthy();

    const link = container.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('AI markdown table is wrapped for horizontal scrolling', () => {
    const { container } = render(
      <MessageBubble role="assistant" content={'| 维度 | 说明 |\n|---|---|\n| A | B |'} />
    );

    expect(container.querySelector('[data-testid="markdown-table-scroll"] table')).toBeTruthy();
  });

  it('AI assistant card uses a light reading background', () => {
    const { container } = render(<MessageBubble role="assistant" content="正文" />);

    const card = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.background).toBe('rgb(251, 252, 255)');
    expect(card.style.border).toContain('rgba(148, 163, 184, 0.22)');
  });

  it('AI markdown bold text is visibly emphasized', () => {
    const { container } = render(<MessageBubble role="assistant" content="这是 **重点内容**" />);

    const strong = container.querySelector('[data-testid="markdown-strong"]') as HTMLElement;
    expect(strong).toBeTruthy();
    expect(strong.textContent).toBe('重点内容');
    expect(strong.style.background).toBe('rgba(250, 204, 21, 0.18)');
    expect(strong.style.fontWeight).toBe('700');
  });

  it('assistant message shows copy action by default', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByText('复制')).toBeInTheDocument();
  });

  it('assistant message hides actions when showActions is false', () => {
    render(<MessageBubble role="assistant" content="reply text" showActions={false} />);

    expect(screen.queryByText('复制')).not.toBeInTheDocument();
  });

  it('AI copy button copies content', async () => {
    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByText('复制'));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reply text');
    });
  });
  it('regenerate button only when onRegenerate provided', () => {
    const fn = vi.fn();
    const { rerender } = render(<MessageBubble role="assistant" content="x" />);
    expect(screen.queryByText('重新生成')).toBeNull();
    rerender(<MessageBubble role="assistant" content="x" onRegenerate={fn} />);
    fireEvent.click(screen.getByText('重新生成'));
    expect(fn).toHaveBeenCalled();
  });
});

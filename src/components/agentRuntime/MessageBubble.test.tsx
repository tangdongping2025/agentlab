import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('AI copy button copies content', () => {
    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reply text');
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

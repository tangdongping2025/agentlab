import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MessageBubble from './MessageBubble';

class TestClipboardItem {
  items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

const originalImage = globalThis.Image;
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalClipboard = navigator.clipboard;
const originalClipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
const originalClipboardItem = globalThis.ClipboardItem;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

function installScreenshotMocks(options: { toBlob?: Blob | null } = {}) {
  const blob = options.toBlob === undefined ? new Blob(['png'], { type: 'image/png' }) : options.toBlob;
  const drawImage = vi.fn();

  Object.defineProperty(globalThis, 'ClipboardItem', {
    configurable: true,
    writable: true,
    value: TestClipboardItem,
  });

  URL.createObjectURL = vi.fn(() => 'blob:assistant-card');
  URL.revokeObjectURL = vi.fn();

  class MockImage {
    width = 0;
    height = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }

  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as any;
  HTMLCanvasElement.prototype.toBlob = vi.fn(callback => callback(blob)) as any;

  return { drawImage, blob };
}

describe('MessageBubble', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        writable: true,
        value: originalClipboard,
      });
      delete (navigator as any).clipboard;
    }
    if (originalClipboardItemDescriptor) {
      Object.defineProperty(globalThis, 'ClipboardItem', originalClipboardItemDescriptor);
    } else {
      Object.defineProperty(globalThis, 'ClipboardItem', {
        configurable: true,
        writable: true,
        value: originalClipboardItem,
      });
      delete (globalThis as any).ClipboardItem;
    }
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
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

  it('AI assistant card uses the Yuanbao warm white reading background', () => {
    const { container } = render(<MessageBubble role="assistant" content="正文" />);

    const card = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.background).toBe('rgb(255, 255, 255)');
    expect(card.style.border).toContain('rgb(214, 207, 196)');
    expect(card.style.borderRadius).toBe('12px');
  });

  it('user message uses the Yuanbao warm gray bubble', () => {
    const { container } = render(<MessageBubble role="user" content="hello" />);

    const bubble = container.querySelector('[data-testid="user-message-bubble"]') as HTMLElement;
    expect(bubble).toBeTruthy();
    expect(bubble.style.background).toBe('rgb(232, 226, 217)');
    expect(bubble.style.color).toBe('rgb(26, 26, 26)');
    expect(bubble.style.borderRadius).toBe('18px 18px 4px');
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

  it('assistant message shows screenshot copy action by default', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByRole('button', { name: '截图复制' })).toBeInTheDocument();
  });

  it('assistant message hides screenshot copy action when showActions is false', () => {
    render(<MessageBubble role="assistant" content="reply text" showActions={false} />);

    expect(screen.queryByRole('button', { name: '截图复制' })).not.toBeInTheDocument();
  });

  it('screenshot copy writes a png image to clipboard', async () => {
    const { blob } = installScreenshotMocks();

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByRole('button', { name: '截图复制' }));

    expect(screen.getByRole('button', { name: '截图中' })).toBeInTheDocument();

    await waitFor(() => {
      expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    });

    const [[clipboardItem]] = (navigator.clipboard.write as any).mock.calls[0];
    expect(clipboardItem).toBeInstanceOf(TestClipboardItem);
    expect(clipboardItem.items['image/png']).toBe(blob);
    expect(await screen.findByRole('button', { name: '已截图' })).toBeTruthy();
  });

  it('screenshot copy shows failure state when png rendering fails', async () => {
    installScreenshotMocks({ toBlob: null });

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByRole('button', { name: '截图复制' }));

    expect(await screen.findByRole('button', { name: '截图失败' })).toBeTruthy();
    expect(navigator.clipboard.write).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '复制' }));

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

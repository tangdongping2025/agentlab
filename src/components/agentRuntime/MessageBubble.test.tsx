import { readFileSync } from 'fs';
import { Suspense, startTransition } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import MessageBubble from './MessageBubble';

describe('MessageBubble', () => {
  it('does not invalidate Word export requests during render', () => {
    const source = readFileSync('src/components/agentRuntime/MessageBubble.tsx', 'utf-8');

    expect(source).not.toContain('if (latestExportContextRef.current.content !== content || latestExportContextRef.current.workspaceCwd !== workspaceCwd)');
  });

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
  });

  function mockSpeechSynthesis() {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });

    return { speak, cancel };
  }

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

  it('assistant message shows copy actions by default', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByRole('button', { name: '复制内容' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制纯文本' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /截图/ })).not.toBeInTheDocument();
  });

  it('assistant message hides actions when showActions is false', () => {
    render(<MessageBubble role="assistant" content="reply text" showActions={false} />);

    expect(screen.queryByRole('button', { name: '复制内容' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制纯文本' })).not.toBeInTheDocument();
  });

  it('AI copy button copies markdown content', async () => {
    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByRole('button', { name: '复制内容' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reply text');
    });
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument();
  });

  it('AI plain text copy button copies readable plain text', async () => {
    const markdown = [
      '## 核心判断',
      '',
      '这是 **重点** 和 [链接](https://example.com)。',
      '',
      '- 第一项',
      '- 第二项',
      '',
      '| 维度 | 说明 |',
      '|---|---|',
      '| A | B |',
      '',
      '```ts',
      'const value = `ok`;',
      '```',
    ].join('\n');

    render(<MessageBubble role="assistant" content={markdown} />);
    fireEvent.click(screen.getByRole('button', { name: '复制纯文本' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith([
        '核心判断',
        '',
        '这是 重点 和 链接（https://example.com）。',
        '',
        '- 第一项',
        '- 第二项',
        '',
        '维度\t说明',
        'A\tB',
        '',
        'const value = ok;',
      ].join('\n'));
    });
    expect(await screen.findByRole('button', { name: '已复制纯文本' })).toBeInTheDocument();
  });

  it('assistant message shows speech action when Web Speech API is supported', () => {
    mockSpeechSynthesis();

    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument();
  });

  it('assistant speech button speaks readable plain text', () => {
    const { speak, cancel } = mockSpeechSynthesis();
    const markdown = [
      '## 核心判断',
      '',
      '这是 **重点** 和 `代码`。',
    ].join('\n');

    render(<MessageBubble role="assistant" content={markdown} />);
    fireEvent.click(screen.getByRole('button', { name: '朗读' }));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('核心判断\n\n这是 重点 和 代码。');
    expect(utterance.lang).toBe('zh-CN');
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  });

  it('assistant speech stop button cancels current speech', () => {
    const { cancel } = mockSpeechSynthesis();

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByRole('button', { name: '朗读' }));
    fireEvent.click(screen.getByRole('button', { name: '停止' }));

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument();
  });

  it('starting speech on another assistant card stops the previous card UI state', () => {
    const { cancel } = mockSpeechSynthesis();

    render(
      <>
        <MessageBubble role="assistant" content="first reply" />
        <MessageBubble role="assistant" content="second reply" />
      </>
    );

    const readButtons = screen.getAllByRole('button', { name: '朗读' });
    fireEvent.click(readButtons[0]);
    expect(screen.getAllByRole('button', { name: '停止' })).toHaveLength(1);

    fireEvent.click(readButtons[1]);

    expect(cancel).toHaveBeenCalledTimes(3);
    expect(screen.getAllByRole('button', { name: '朗读' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '停止' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '朗读' })[0]).toBe(readButtons[0]);
  });

  it('stops active speech when the assistant card content changes', () => {
    const { cancel } = mockSpeechSynthesis();
    const { rerender } = render(<MessageBubble role="assistant" content="old reply" />);

    fireEvent.click(screen.getByRole('button', { name: '朗读' }));
    rerender(<MessageBubble role="assistant" content="new reply" />);

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument();
  });

  it('assistant message hides speech action when Web Speech API is unsupported', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.queryByRole('button', { name: '朗读' })).not.toBeInTheDocument();
  });

  it('assistant message exports markdown as Word when workspace cwd exists', async () => {
    const onExportDocx = vi.fn().mockResolvedValue({
      docxPath: '/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
    });

    render(
      <MessageBubble
        role="assistant"
        content="# 标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await waitFor(() => {
      expect(onExportDocx).toHaveBeenCalledWith('# 标题');
    });
    expect(await screen.findByRole('button', { name: '下载 Word' })).toBeInTheDocument();
  });

  it('assistant message asks user to select cwd before exporting Word', () => {
    const onExportDocx = vi.fn();

    render(<MessageBubble role="assistant" content="reply" onExportDocx={onExportDocx} />);

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    expect(onExportDocx).not.toHaveBeenCalled();
    expect(screen.getByText('请先选择工作目录')).toBeInTheDocument();
  });

  it('assistant message hides Word export action when showActions is false', () => {
    render(
      <MessageBubble
        role="assistant"
        content="reply"
        showActions={false}
        workspaceCwd="/repo"
        onExportDocx={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '导出 Word' })).not.toBeInTheDocument();
  });

  it('download Word button creates an anchor and clicks it', async () => {
    const onExportDocx = vi.fn().mockResolvedValue({
      docxPath: '/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
    });

    render(
      <MessageBubble
        role="assistant"
        content="# 标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    const downloadButton = await screen.findByRole('button', { name: '下载 Word' });
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    fireEvent.click(downloadButton);

    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx');
    expect(anchor.download).toBe('assistant-card.docx');
    expect(anchor.click).toHaveBeenCalled();
  });

  it('resets Word export state when assistant content changes', async () => {
    const onExportDocx = vi.fn().mockResolvedValue({
      docxPath: '/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fassistant-card.docx',
    });
    const { rerender } = render(
      <MessageBubble
        role="assistant"
        content="# 旧标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));
    expect(await screen.findByRole('button', { name: '下载 Word' })).toBeInTheDocument();

    rerender(
      <MessageBubble
        role="assistant"
        content="# 新标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );

    expect(screen.getByRole('button', { name: '导出 Word' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载 Word' })).not.toBeInTheDocument();
    expect(screen.queryByText('请先选择工作目录')).not.toBeInTheDocument();
    expect(screen.queryByText('Word 导出失败')).not.toBeInTheDocument();
  });

  it('ignores stale Word export result after assistant content changes', async () => {
    let resolveExport: (value: { docxPath: string; downloadUrl: string }) => void = () => {};
    const onExportDocx = vi.fn().mockReturnValue(new Promise(resolve => {
      resolveExport = resolve;
    }));
    const { rerender } = render(
      <MessageBubble
        role="assistant"
        content="# 旧标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));
    expect(screen.getByRole('button', { name: '导出中…' })).toBeInTheDocument();

    rerender(
      <MessageBubble
        role="assistant"
        content="# 新标题"
        workspaceCwd="/repo"
        onExportDocx={onExportDocx}
      />
    );
    expect(screen.getByRole('button', { name: '导出 Word' })).toBeInTheDocument();

    await act(async () => {
      resolveExport({
        docxPath: '/repo/exports/old-card.docx',
        downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fold-card.docx',
      });
    });

    expect(screen.getByRole('button', { name: '导出 Word' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载 Word' })).not.toBeInTheDocument();
    expect(screen.queryByText('请先选择工作目录')).not.toBeInTheDocument();
    expect(screen.queryByText('Word 导出失败')).not.toBeInTheDocument();
  });

  it('ignores stale Word export result after returning to the same content before passive cleanup', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveExport: (value: { docxPath: string; downloadUrl: string }) => void = () => {};
    const onExportDocx = vi.fn().mockReturnValue(new Promise(resolve => {
      resolveExport = resolve;
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function renderBubble(content: string) {
      root.render(
        <MessageBubble
          role="assistant"
          content={content}
          workspaceCwd="/repo"
          onExportDocx={onExportDocx}
        />
      );
    }

    await act(async () => {
      renderBubble('# 标题 A');
    });
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));
    expect(screen.getByRole('button', { name: '导出中…' })).toBeInTheDocument();

    flushSync(() => renderBubble('# 标题 B'));
    flushSync(() => renderBubble('# 标题 A'));

    resolveExport({
      docxPath: '/repo/exports/old-card.docx',
      downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fold-card.docx',
    });
    await Promise.resolve();

    expect(screen.getByRole('button', { name: '导出 Word' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载 Word' })).not.toBeInTheDocument();
    expect(screen.queryByText('请先选择工作目录')).not.toBeInTheDocument();
    expect(screen.queryByText('Word 导出失败')).not.toBeInTheDocument();

    root.unmount();
    container.remove();
    consoleError.mockRestore();
  });

  it('keeps committed Word export valid when a different content render is abandoned', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveExport: (value: { docxPath: string; downloadUrl: string }) => void = () => {};
    const onExportDocx = vi.fn().mockReturnValue(new Promise(resolve => {
      resolveExport = resolve;
    }));
    const never = new Promise(() => {});

    function MaybeSuspend({ shouldSuspend }: { shouldSuspend: boolean }) {
      if (shouldSuspend) throw never;
      return null;
    }

    function App({ content, shouldSuspend = false }: { content: string; shouldSuspend?: boolean }) {
      return (
        <Suspense fallback={<div>加载中</div>}>
          <MessageBubble
            role="assistant"
            content={content}
            workspaceCwd="/repo"
            onExportDocx={onExportDocx}
          />
          <MaybeSuspend shouldSuspend={shouldSuspend} />
        </Suspense>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<App content="# 标题 A" />);
    });
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));
    expect(screen.getByRole('button', { name: '导出中…' })).toBeInTheDocument();

    startTransition(() => {
      root.render(<App content="# 标题 B" shouldSuspend />);
    });
    await Promise.resolve();

    await act(async () => {
      resolveExport({
        docxPath: '/repo/exports/a-card.docx',
        downloadUrl: '/api/db/files/download?path=%2Frepo%2Fexports%2Fa-card.docx',
      });
    });

    expect(await screen.findByRole('button', { name: '下载 Word' })).toBeInTheDocument();
    expect(screen.queryByText('加载中')).not.toBeInTheDocument();

    root.unmount();
    container.remove();
    consoleError.mockRestore();
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

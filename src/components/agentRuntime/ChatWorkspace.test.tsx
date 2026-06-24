import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ChatWorkspace from './ChatWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi');

describe('ChatWorkspace fullscreen', () => {
  it('defines mobile compact CSS that hides chrome on narrow screens', () => {
    const css = readFileSync('src/index.css', 'utf-8');

    expect(css).toContain('@media (max-width: 768px)');
    expect(css).toContain('(pointer: coarse)');
    expect(css).toContain('.mobile-compact-hidden');
    expect(css).toContain('display: none');
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    Element.prototype.scrollTo = vi.fn();
    vi.mocked(dbApi.fetchWorkspaceSettings).mockResolvedValue({
      environment: 'windows',
      rootDir: 'D:/Projects',
      cwd: '',
      cwdHistory: [],
    });
    vi.mocked(dbApi.listFiles).mockResolvedValue([]);
    useAgentRuntimeStore.setState({
      agents: [{ id: 'assistant', name: '项目助手', description: '测试智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'assistant',
      workspaceMessages: [{ role: 'assistant', content: '已有回复' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceCwd: null,
      workspaceHasMoreBefore: false,
      workspaceLoadingOlder: false,
      workspaceLoadOlderError: null,
      workspaceIsAtLatest: true,
      workspaceHasNewerNotice: false,
      workspaceTaskIndex: [],
    });
  });

  it('opens fullscreen from header and keeps the input box', () => {
    render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));

    expect(screen.getByRole('button', { name: '退出全屏' })).toBeInTheDocument();
    expect(screen.getAllByText('已有回复').length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText('输入消息...').length).toBeGreaterThan(0);
  });

  it('closes fullscreen with Escape', () => {
    render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: '退出全屏' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全屏' })).toBeInTheDocument();
  });

  it('preserves the message scroll position when opening fullscreen', () => {
    const { container } = render(<ChatWorkspace />);
    const normalViewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    Object.defineProperty(normalViewport, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(normalViewport, 'clientHeight', { configurable: true, value: 250 });
    normalViewport.scrollTop = 300;

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));

    const viewports = container.querySelectorAll('[data-testid="chat-message-viewport"]');
    const fullscreenViewport = viewports[1] as HTMLElement;
    expect(fullscreenViewport.scrollTop).toBe(300);
  });

  it('preserves the fullscreen message scroll position when closing fullscreen', () => {
    const { container } = render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    const viewports = container.querySelectorAll('[data-testid="chat-message-viewport"]');
    const fullscreenViewport = viewports[1] as HTMLElement;
    Object.defineProperty(fullscreenViewport, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(fullscreenViewport, 'clientHeight', { configurable: true, value: 250 });
    fullscreenViewport.scrollTop = 300;

    fireEvent.click(screen.getByRole('button', { name: '退出全屏' }));

    const normalViewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    expect(normalViewport.scrollTop).toBe(300);
  });

  it('renders streaming assistant content with the same article card', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'assistant', name: '项目助手', description: '测试智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'assistant',
      workspaceMessages: [],
      workspaceStreaming: '## 核心判断\n\n正在流式输出',
      workspaceEvents: [],
      workspaceRunning: true,
      workspaceAbortController: null,
    });

    const { container } = render(<ChatWorkspace />);

    expect(container.querySelector('[data-testid="assistant-card"] h2')?.textContent).toBe('核心判断');
    expect(screen.queryByText('复制')).not.toBeInTheDocument();
  });

  it('passes workspace cwd and assistant markdown to Word export API', async () => {
    vi.mocked(dbApi.exportDocx).mockResolvedValue({
      mdPath: 'D:/repo/exports/assistant-card.md',
      docxPath: 'D:/repo/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=D%3A%2Frepo%2Fexports%2Fassistant-card.docx',
    });
    useAgentRuntimeStore.setState({
      workspaceCwd: 'D:/repo',
      workspaceMessages: [{ role: 'assistant', content: '# 导出内容' }],
      workspaceStreaming: '',
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));
    });

    await vi.waitFor(() => {
      expect(dbApi.exportDocx).toHaveBeenCalledWith({ cwd: 'D:/repo', markdown: '# 导出内容' });
    });
  });

  it('uses saved workspace cwd for Word export when chat store has not restored it', async () => {
    vi.mocked(dbApi.fetchWorkspaceSettings).mockResolvedValue({
      environment: 'windows',
      rootDir: 'D:/Projects',
      cwd: 'D:/Projects/sdk',
      cwdHistory: ['D:/Projects/sdk'],
    });
    vi.mocked(dbApi.exportDocx).mockResolvedValue({
      mdPath: 'D:/Projects/sdk/exports/assistant-card.md',
      docxPath: 'D:/Projects/sdk/exports/assistant-card.docx',
      downloadUrl: '/api/db/files/download?path=D%3A%2FProjects%2Fsdk%2Fexports%2Fassistant-card.docx',
    });
    useAgentRuntimeStore.setState({
      workspaceCwd: null,
      workspaceMessages: [{ role: 'assistant', content: '# 导出内容' }],
      workspaceStreaming: '',
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);
    await vi.waitFor(() => {
      expect(useAgentRuntimeStore.getState().workspaceCwd).toBe('D:/Projects/sdk');
    });
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    await vi.waitFor(() => {
      expect(dbApi.exportDocx).toHaveBeenCalledWith({ cwd: 'D:/Projects/sdk', markdown: '# 导出内容' });
    });
    expect(screen.queryByText('请先选择工作目录')).not.toBeInTheDocument();
  });

  it('keeps Word export local when workspace cwd is missing', async () => {
    vi.mocked(dbApi.fetchWorkspaceSettings).mockResolvedValue({
      environment: 'windows',
      rootDir: 'D:/Projects',
      cwd: '',
      cwdHistory: [],
    });
    useAgentRuntimeStore.setState({
      workspaceCwd: null,
      workspaceMessages: [{ role: 'assistant', content: '# 导出内容' }],
      workspaceStreaming: '',
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '导出 Word' }));

    expect(dbApi.exportDocx).not.toHaveBeenCalled();
    expect(screen.getByText('请先选择工作目录')).toBeInTheDocument();
  });

  it('uses Yuanbao warm chat panel and input styles', () => {
    const { container } = render(<ChatWorkspace />);

    const panel = container.querySelector('[data-testid="chat-workspace-panel"]') as HTMLElement;
    const header = container.querySelector('[data-testid="chat-workspace-header"]') as HTMLElement;
    const viewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement;
    const sendButton = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;

    expect(panel.style.background).toBe('rgb(245, 241, 235)');
    expect(header.style.background).toBe('rgb(245, 241, 235)');
    expect(header).toHaveClass('mobile-compact-hidden');
    expect(viewport.style.background).toBe('rgb(245, 241, 235)');
    expect(input.style.background).toBe('rgb(255, 255, 255)');
    expect(input.style.border).toContain('rgb(214, 207, 196)');
    expect(input.style.borderRadius).toBe('24px');
    expect(sendButton.style.background).toBe('rgb(37, 99, 235)');
  });

  it('does not render workspace event labels inside the chat message area', () => {
    useAgentRuntimeStore.setState({
      workspaceEvents: [{ id: 'tool-1', type: 'tool_call', label: '调用工具: WebSearch' } as any],
    });

    render(<ChatWorkspace />);

    expect(screen.queryByText('调用工具: WebSearch')).not.toBeInTheDocument();
  });

  it('renders a lightweight notice when long session context was compressed', () => {
    useAgentRuntimeStore.setState({
      workspaceObservability: {
        steps: [],
        tokenUsage: { input: 0, output: 0 },
        strategyEffect: {
          strategy: 'context_compression',
          triggered: true,
          before_count: 0,
          after_count: 0,
          beforeTokenCount: 0,
          afterTokenCount: 0,
          beforeCharCount: 52000,
          afterCharCount: 12000,
          beforeMessages: [],
          afterMessages: [],
        },
      },
    });

    render(<ChatWorkspace />);

    expect(screen.getByTestId('context-compression-notice')).toHaveTextContent('当前会话较长，已自动压缩早期上下文以保持响应速度。原始会话记录仍完整保留。');
  });

  it('renders a stronger lobster agent header with animated avatar', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '会使用工具、读写文件、执行命令并观察结果的行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);

    const name = screen.getByText('龙虾 Agent');
    expect(name.style.background).toBe('linear-gradient(135deg, var(--accent-blue), var(--accent-violet))');
    expect(name.style.webkitTextFillColor).toBe('transparent');
    // 龙虾 Agent header 现在是动画头像 + name,不再显示 description 文字
    expect(screen.getByRole('img', { name: '龙虾 Agent' })).toBeTruthy();
    expect(screen.queryByText('会使用工具、读写文件、执行命令并观察结果的行动型智能体')).toBeNull();
  });

  it('renders lobster agent welcome examples in an empty chat', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
    });

    render(<ChatWorkspace />);

    expect(screen.getByText('我是龙虾 Agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮我查看当前目录里有哪些文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮我读一个文件并总结重点' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮我运行命令检查项目状态' })).toBeInTheDocument();
  });

  it('sends a welcome example directly when clicked', () => {
    const runWorkspace = vi.fn();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      runWorkspace,
    });

    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '帮我查看当前目录里有哪些文件' }));

    expect(runWorkspace).toHaveBeenCalledWith('帮我查看当前目录里有哪些文件');
  });

  it('renders lobster runtime status inside the streaming assistant card', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '看看文件' }],
      workspaceStreaming: '正在读取结果',
      workspaceEvents: [{ id: 'tool-1', type: 'tool_call', label: '调用工具: Bash', detail: '{"command":"ls"}' } as any],
      workspaceRunning: true,
    });

    const { container } = render(<ChatWorkspace />);
    const assistantCard = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;

    expect(assistantCard).toHaveTextContent('龙虾 Agent · 正在执行命令…');
    expect(screen.queryByTestId('lobster-floating-runtime-status')).not.toBeInTheDocument();
  });

  it('renders tool events as a collapsed timeline inside the streaming assistant card', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '运行命令' }],
      workspaceStreaming: '命令结果如下',
      workspaceEvents: [
        { id: 'tool-1', type: 'tool_call', label: '调用工具: Bash', detail: '{"command":"ls"}' } as any,
        { id: 'tool-2', type: 'tool_result', label: '工具结果', detail: 'README.md' } as any,
      ],
      workspaceRunning: true,
    });

    const { container } = render(<ChatWorkspace />);
    const assistantCard = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;
    const timeline = container.querySelector('[data-testid="assistant-tool-timeline"]') as HTMLDetailsElement;

    expect(assistantCard).toHaveTextContent('工具时间线');
    expect(assistantCard).toHaveTextContent('调用工具: Bash');
    expect(assistantCard).toHaveTextContent('工具结果');
    expect(timeline.open).toBe(false);
  });

  it('opens the session task navigator and jumps to a global indexed user message', async () => {
    const scrollIntoView = vi.fn();
    const jumpWorkspaceToMessageSeq = vi.fn(async (seq: number) => {
      useAgentRuntimeStore.setState({
        workspaceMessages: [
          { role: 'user', content: '优化定位体验', seq },
          { role: 'assistant', content: '可以', seq: seq + 1 },
        ],
      });
    });
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      useAgentRuntimeStore.setState({
        agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
        currentAgentId: 'claude-sdk',
        workspaceMessages: [
          { role: 'assistant', content: '可以', seq: 19 },
        ],
        workspaceTaskIndex: [
          { messageSeq: 0, role: 'user', title: '早期任务', preview: '早期任务' },
          { messageSeq: 20, role: 'user', title: '优化定位体验', preview: '优化定位体验' },
        ],
        workspaceStreaming: '',
        workspaceEvents: [],
        workspaceRunning: false,
        workspaceAbortController: null,
        jumpWorkspaceToMessageSeq,
      });

      const { container } = render(<ChatWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: '任务 2' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /优化定位体验/ }));
      });

      const target = container.querySelector('[data-message-seq="20"]') as HTMLElement;

      expect(jumpWorkspaceToMessageSeq).toHaveBeenCalledWith(20);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      expect(target.style.border).toContain('rgb(37, 99, 235)');
      expect(target.style.background).toBe('rgba(37, 99, 235, 0.08)');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('keeps the task highlight for a full duration after repeated jumps to the same message', () => {
    vi.useFakeTimers();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();

    try {
      useAgentRuntimeStore.setState({
        agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
        currentAgentId: 'claude-sdk',
        workspaceMessages: [
          { role: 'user', content: '帮我实现任务目录' },
          { role: 'assistant', content: '可以' },
          { role: 'user', content: '优化定位体验' },
        ],
        workspaceStreaming: '',
        workspaceEvents: [],
        workspaceRunning: false,
        workspaceAbortController: null,
      });

      const { container } = render(<ChatWorkspace />);
      fireEvent.click(screen.getByRole('button', { name: '任务 2' }));
      const taskButton = screen.getByRole('button', { name: /优化定位体验/ });
      const target = container.querySelector('[data-message-index="2"]') as HTMLElement;

      fireEvent.click(taskButton);
      act(() => { vi.advanceTimersByTime(700); });
      fireEvent.click(screen.getByRole('button', { name: '任务 2' }));
      fireEvent.click(screen.getByRole('button', { name: /优化定位体验/ }));
      act(() => { vi.advanceTimersByTime(700); });

      expect(target.style.border).toContain('rgb(37, 99, 235)');
      expect(target.style.background).toBe('rgba(37, 99, 235, 0.08)');

      act(() => { vi.advanceTimersByTime(700); });

      expect(target.style.border).toContain('transparent');
      expect(target.style.background).toBe('transparent');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('loads older messages from the top control', async () => {
    const loadOlderWorkspaceMessages = vi.fn();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '最近消息', seq: 18 }],
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: false,
      workspaceLoadOlderError: null,
      loadOlderWorkspaceMessages,
    });

    render(<ChatWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '加载更早消息' }));

    expect(loadOlderWorkspaceMessages).toHaveBeenCalledTimes(1);
  });

  it('shows older message loading and retry states', () => {
    const loadOlderWorkspaceMessages = vi.fn();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '最近消息', seq: 18 }],
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: true,
      workspaceLoadOlderError: 'network failed',
      loadOlderWorkspaceMessages,
    });

    render(<ChatWorkspace />);

    expect(screen.getByRole('button', { name: '正在加载更早消息…' })).toBeDisabled();
    expect(screen.getByText(/更早消息加载失败/)).toBeInTheDocument();
  });

  it('jumps to latest when newer messages are available', async () => {
    const jumpWorkspaceToLatest = vi.fn(async () => {
      useAgentRuntimeStore.setState({
        workspaceMessages: [{ role: 'user', content: '最新消息', seq: 30 }],
        workspaceIsAtLatest: true,
        workspaceHasNewerNotice: false,
      });
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '旧窗口消息', seq: 10 }],
      workspaceHasMoreAfter: true,
      workspaceIsAtLatest: false,
      workspaceHasNewerNotice: true,
      jumpWorkspaceToLatest,
    });

    render(<ChatWorkspace />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '跳到最新' }));
    });

    expect(jumpWorkspaceToLatest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('最新消息')).toBeInTheDocument();
  });

  it('auto-loads older messages when scrolling near the top', () => {
    const loadOlderWorkspaceMessages = vi.fn();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '最近消息', seq: 18 }],
      workspaceOldestSeq: 18,
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: false,
      workspaceLoadOlderError: null,
      loadOlderWorkspaceMessages,
    });

    const { container } = render(<ChatWorkspace />);
    const viewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    viewport.scrollTop = 12;
    fireEvent.scroll(viewport);

    expect(loadOlderWorkspaceMessages).toHaveBeenCalledTimes(1);
  });

  it('does not scroll to bottom while an older-message load is pending or failed', () => {
    const loadOlderWorkspaceMessages = vi.fn(() => {
      useAgentRuntimeStore.setState({ workspaceLoadingOlder: true });
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '最近消息', seq: 18 }],
      workspaceOldestSeq: 18,
      workspaceHasMoreBefore: true,
      workspaceLoadingOlder: false,
      workspaceLoadOlderError: null,
      workspaceIsAtLatest: true,
      loadOlderWorkspaceMessages,
    });

    const { container } = render(<ChatWorkspace />);
    const viewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 });
    viewport.scrollTop = 12;

    fireEvent.scroll(viewport);
    useAgentRuntimeStore.setState({ workspaceLoadingOlder: false, workspaceLoadOlderError: 'network failed' });

    expect(scrollTo).not.toHaveBeenCalledWith({ top: 1000 });
  });

  it('loads workspace settings for @ file references when the file panel has not initialized cwd', async () => {
    vi.mocked(dbApi.fetchWorkspaceSettings).mockResolvedValue({
      environment: 'windows',
      rootDir: 'D:/Projects',
      cwd: 'D:/Projects/context-lab',
      cwdHistory: ['D:/Projects/context-lab'],
    });
    vi.mocked(dbApi.listFiles).mockResolvedValue([
      { name: 'ChatWorkspace.tsx', mtime: 1, size: 100, is_dir: false },
    ]);
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceCwd: null,
    });

    render(<ChatWorkspace />);

    fireEvent.change(screen.getByPlaceholderText('输入消息...'), { target: { value: '@' } });

    expect(await screen.findByRole('button', { name: 'ChatWorkspace.tsx' })).toBeInTheDocument();
    expect(dbApi.listFiles).toHaveBeenCalledWith('D:/Projects/context-lab');
  });

  it('selects @ file reference candidates with keyboard arrows and Enter', async () => {
    vi.mocked(dbApi.listFiles).mockResolvedValue([
      { name: 'Alpha.tsx', mtime: 1, size: 100, is_dir: false },
      { name: 'Beta.tsx', mtime: 1, size: 100, is_dir: false },
    ]);
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceCwd: '/workspace/project',
    });

    render(<ChatWorkspace />);

    const input = screen.getByPlaceholderText('输入消息...');
    fireEvent.change(input, { target: { value: '@' } });
    expect(await screen.findByRole('button', { name: 'Alpha.tsx' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Beta.tsx' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('@Beta.tsx ');
    expect(screen.queryByRole('button', { name: 'Alpha.tsx' })).not.toBeInTheDocument();
  });

  it('supports @ file reference selection and sends path hints without file content', async () => {
    const runWorkspace = vi.fn();
    vi.mocked(dbApi.listFiles).mockResolvedValue([
      { name: 'FilesPanel.tsx', mtime: 1, size: 100, is_dir: false },
      { name: 'image.png', mtime: 1, size: 100, is_dir: false },
      { name: 'src', mtime: 1, size: 0, is_dir: true },
    ]);
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceCwd: '/workspace/project',
      runWorkspace,
    });

    render(<ChatWorkspace />);

    const input = screen.getByPlaceholderText('输入消息...');
    fireEvent.change(input, { target: { value: '帮我看 @' } });

    const option = await screen.findByRole('button', { name: 'FilesPanel.tsx' });
    expect(screen.queryByRole('button', { name: 'image.png' })).not.toBeInTheDocument();
    fireEvent.click(option);

    expect(input).toHaveValue('帮我看 @FilesPanel.tsx ');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(runWorkspace).toHaveBeenCalledWith([
      '用户提到以下当前工作区文件：',
      '- FilesPanel.tsx',
      '',
      '如果需要，请优先读取这些文件。',
      '',
      '帮我看 @FilesPanel.tsx',
    ].join('\n'));
    expect(input).toHaveValue('');
  });

  it('updates the session task count after sending a local message without duplicate message keys', () => {
    const keyWarningSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runWorkspace = vi.fn((message: string) => {
      useAgentRuntimeStore.setState(state => ({
        workspaceMessages: [...state.workspaceMessages, { role: 'user', content: message }],
        workspaceRunning: true,
      }));
    });
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '已有任务', seq: 1 }],
      workspaceTaskIndex: [{ messageSeq: 1, role: 'user', title: '已有任务', preview: '已有任务' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
      runWorkspace,
    });

    render(<ChatWorkspace />);
    fireEvent.change(screen.getByPlaceholderText('输入消息...'), { target: { value: '新任务' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByRole('button', { name: '任务 2' })).toBeInTheDocument();
    const duplicateKeyWarning = keyWarningSpy.mock.calls.some(call =>
      call.map(String).join(' ').includes('Encountered two children with the same key')
    );
    expect(duplicateKeyWarning).toBe(false);

    keyWarningSpy.mockRestore();
  });

  it('keeps normal task jumps working after fullscreen closes', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      useAgentRuntimeStore.setState({
        agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
        currentAgentId: 'claude-sdk',
        workspaceMessages: [
          { role: 'user', content: '帮我实现任务目录' },
          { role: 'assistant', content: '可以' },
          { role: 'user', content: '优化定位体验' },
        ],
        workspaceStreaming: '',
        workspaceEvents: [],
        workspaceRunning: false,
        workspaceAbortController: null,
      });

      const { container } = render(<ChatWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: '全屏' }));
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.click(screen.getByRole('button', { name: '任务 2' }));
      fireEvent.click(screen.getByRole('button', { name: /优化定位体验/ }));

      const target = container.querySelector('[data-message-index="2"]') as HTMLElement;

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      expect(target.style.border).toContain('rgb(37, 99, 235)');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ChatWorkspace from './ChatWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

describe('ChatWorkspace fullscreen', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    useAgentRuntimeStore.setState({
      agents: [{ id: 'assistant', name: '项目助手', description: '测试智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'assistant',
      workspaceMessages: [{ role: 'assistant', content: '已有回复' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
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

  it('uses Yuanbao warm chat panel and input styles', () => {
    const { container } = render(<ChatWorkspace />);

    const panel = container.querySelector('[data-testid="chat-workspace-panel"]') as HTMLElement;
    const header = container.querySelector('[data-testid="chat-workspace-header"]') as HTMLElement;
    const viewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement;
    const sendButton = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;

    expect(panel.style.background).toBe('rgb(245, 241, 235)');
    expect(header.style.background).toBe('rgb(245, 241, 235)');
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

  it('renders a stronger lobster agent header name and description', () => {
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
    const description = screen.getByText('会使用工具、读写文件、执行命令并观察结果的行动型智能体');
    expect(name.style.background).toBe('linear-gradient(135deg, var(--accent-blue), var(--accent-violet))');
    expect(name.style.webkitTextFillColor).toBe('transparent');
    expect(description.style.color).toBe('rgb(74, 74, 74)');
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

  it('shows a lightweight tool progress status for lobster agent while running', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: '龙虾 Agent', description: '行动型智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [{ role: 'user', content: '看看文件' }],
      workspaceStreaming: '',
      workspaceEvents: [{ id: 'tool-1', type: 'tool_call', label: '调用工具: Read', detail: '{"file_path":"demo.py"}' } as any],
      workspaceRunning: true,
    });

    render(<ChatWorkspace />);

    expect(screen.getByText('正在查看文件…')).toBeInTheDocument();
    expect(screen.queryByText('调用工具: Read')).not.toBeInTheDocument();
  });

  it('opens the session task navigator and jumps to the original user message', () => {
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
          { role: 'user', content: '这个是什么？' },
          { role: 'user', content: '优化定位体验' },
        ],
        workspaceStreaming: '',
        workspaceEvents: [],
        workspaceRunning: false,
        workspaceAbortController: null,
      });

      const { container } = render(<ChatWorkspace />);

      fireEvent.click(screen.getByRole('button', { name: '任务 3' }));
      fireEvent.click(screen.getByRole('button', { name: /优化定位体验/ }));

      const target = container.querySelector('[data-message-index="3"]') as HTMLElement;

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

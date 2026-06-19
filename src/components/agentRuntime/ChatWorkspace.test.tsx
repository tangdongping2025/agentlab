import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});

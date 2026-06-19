import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Markdown from './Markdown';
import CodeBlock from './CodeBlock';
import AgentRuntimeView from './AgentRuntimeView';
import AgentLibrary from './AgentLibrary';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';
import TabsWorkspace from './TabsWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

vi.mock('../../services/agentRuntimeApi', () => ({
  listAgents: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    querySessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
  },
}));

describe('Yuanbao warm theme details', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();

    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: ['Read', 'Edit', 'Bash', 'WebSearch'] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      workspaceRunning: false,
      workspaceCwd: null,
      assistantMessages: [],
      assistantStreaming: '',
      assistantEvents: [],
      assistantObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      assistantRunning: false,
    });
  });
  it('uses warm markdown quote, table, link, and inline code styles', () => {
    const { container } = render(
      <Markdown content={'> 引用\n\n| 维度 | 说明 |\n|---|---|\n| A | B |\n\n[链接](https://example.com)\n\n`inline`'} />
    );

    const quote = container.querySelector('blockquote') as HTMLElement;
    const th = container.querySelector('th') as HTMLElement;
    const link = container.querySelector('a') as HTMLElement;
    const inlineCode = container.querySelector('p code') as HTMLElement;

    expect(quote.style.borderLeft).toContain('rgb(214, 207, 196)');
    expect(quote.style.color).toBe('rgb(85, 85, 85)');
    expect(th.style.background).toBe('rgb(237, 232, 223)');
    expect(link.style.color).toBe('rgb(37, 99, 235)');
    expect(inlineCode.style.background).toBe('rgb(237, 232, 223)');
  });

  it('uses a warm light rounded code block compatible with warm chat cards', () => {
    const { container } = render(<CodeBlock language="ts" code="const a = 1;" />);

    const wrapper = container.firstElementChild as HTMLElement;
    const header = wrapper.firstElementChild as HTMLElement;

    expect(wrapper.style.borderRadius).toBe('8px');
    expect(wrapper.style.border).toContain('rgb(214, 207, 196)');
    expect(header.style.background).toBe('rgb(237, 232, 223)');
  });

  it('uses warm workbench shell background', () => {
    const { container } = render(<AgentRuntimeView />);
    const shell = container.querySelector('[data-testid="agent-runtime-shell"]') as HTMLElement;

    expect(shell.style.background).toBe('rgb(245, 241, 235)');
  });

  it('uses warm collapsed sidebar rails', () => {
    const { container: left } = render(<AgentLibrary />);
    const { container: right } = render(<AssistantSidebar />);

    expect((left.firstElementChild as HTMLElement).style.background).toBe('rgb(237, 232, 223)');
    expect((right.firstElementChild as HTMLElement).style.background).toBe('rgb(237, 232, 223)');
  });

  it('uses a warm light tabs workspace header', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'react-agent', name: 'React Agent', description: 'Tabs agent', workspace: { type: 'tabs', tabs: ['对话', '文件'] }, capabilities: [] }],
      currentAgentId: 'react-agent',
    });

    const { container } = render(<TabsWorkspace />);
    const shell = container.firstElementChild as HTMLElement;
    const tabHeader = shell.firstElementChild as HTMLElement;

    expect(shell.style.background).toBe('rgb(245, 241, 235)');
    expect(tabHeader.style.background).toBe('rgb(255, 255, 255)');
    expect(tabHeader.style.borderBottom).toContain('rgb(214, 207, 196)');
  });

  it('uses a warm light workspace type badge in the agent library', () => {
    render(<AgentLibrary />);

    fireEvent.click(screen.getByTitle('展开应用库'));

    const badge = screen.getByText('chat');
    expect(badge.style.background).toBe('rgb(255, 255, 255)');
    expect(badge.style.border).toContain('rgb(214, 207, 196)');
  });

  it('uses warm status bar while preserving useful default summary', () => {
    const { container } = render(<ObservabilityBar />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.style.background).toBe('rgb(237, 232, 223)');
    expect(container.textContent).toContain('消息 0');
    expect(container.textContent).toContain('默认沙箱');
    expect(container.textContent).toContain('等待首次运行');
  });
});

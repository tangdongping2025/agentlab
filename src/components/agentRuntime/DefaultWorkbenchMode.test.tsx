import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentLibrary from './AgentLibrary';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';
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

describe('default workbench mode', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({
      agents: [
        {
          id: 'claude-sdk',
          name: 'Claude SDK Agent',
          description: 'SDK agent',
          workspace: { type: 'chat' },
          capabilities: ['Read', 'Edit', 'Bash', 'WebSearch', 'MCP'],
        },
      ],
      currentAgentId: 'claude-sdk',
      isLoadingAgents: false,
      workspaceMessages: [],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      workspaceRunning: false,
      workspaceAbortController: null,
      workspaceCwd: null,
      assistantMessages: [],
      assistantStreaming: '',
      assistantEvents: [],
      assistantObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
      assistantRunning: false,
      assistantAbortController: null,
    });
  });

  it('collapses the agent library by default', () => {
    render(<AgentLibrary />);

    expect(screen.getByTitle('展开应用库')).toBeInTheDocument();
    expect(screen.queryByText('Claude SDK Agent')).not.toBeInTheDocument();
  });

  it('collapses the assistant sidebar by default', () => {
    render(<AssistantSidebar />);

    expect(screen.getByTitle('展开助手')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('问助手...')).not.toBeInTheDocument();
  });

  it('shows useful default information in the collapsed status bar', () => {
    render(<ObservabilityBar />);

    expect(screen.getByText(/Claude SDK Agent/)).toBeInTheDocument();
    expect(screen.getByText('空闲')).toBeInTheDocument();
    expect(screen.getByText('消息 0')).toBeInTheDocument();
    expect(screen.getByText(/Read · Edit · Bash · WebSearch/)).toBeInTheDocument();
    expect(screen.getByText(/默认沙箱/)).toBeInTheDocument();
    expect(screen.getByText(/等待首次运行/)).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssistantSidebar from './AssistantSidebar';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import type { AgentError } from '../../services/agentRuntimeApi';

const err = (overrides: Partial<AgentError> = {}): AgentError => ({
  category: 'service_unavailable',
  message: 'AI 服务暂时不可用,请稍后重试',
  detail: 'APIError: 503 No available accounts',
  ...overrides,
});

// AssistantSidebar starts collapsed; expand it so messages render.
function renderExpanded() {
  render(<AssistantSidebar />);
  fireEvent.click(screen.getByTitle('展开助手'));
}

describe('AssistantSidebar error rendering', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({
      assistantMessages: [],
      assistantStreaming: '',
      assistantRunning: false,
    });
  });

  it('renders ErrorBubble when assistant message has an error object', () => {
    useAgentRuntimeStore.setState({
      assistantMessages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', error: err() },
      ],
    });

    renderExpanded();

    expect(screen.getByTestId('error-bubble')).toBeTruthy();
    expect(screen.getByText('AI 服务暂时不可用,请稍后重试')).toBeTruthy();
  });

  it('renders text content for non-error assistant messages', () => {
    useAgentRuntimeStore.setState({
      assistantMessages: [
        { role: 'assistant', content: '正常的助手回复' },
      ],
    });

    renderExpanded();

    expect(screen.queryByTestId('error-bubble')).toBeNull();
    expect(screen.getByText('正常的助手回复')).toBeTruthy();
  });
});

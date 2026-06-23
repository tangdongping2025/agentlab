import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBubble } from './ErrorBubble';
import type { AgentError } from '../../services/agentRuntimeApi';

const err = (overrides: Partial<AgentError> = {}): AgentError => ({
  category: 'service_unavailable',
  message: 'AI 服务暂时不可用,请稍后重试',
  detail: 'APIError: 503 No available accounts',
  ...overrides,
});

describe('ErrorBubble', () => {
  it('renders category message', () => {
    render(<ErrorBubble error={err()} />);
    expect(screen.getByText('AI 服务暂时不可用,请稍后重试')).toBeTruthy();
  });

  it('hides technical detail by default', () => {
    render(<ErrorBubble error={err()} />);
    expect(screen.queryByText('APIError: 503 No available accounts')).toBeNull();
  });

  it('toggles technical detail on click', () => {
    render(<ErrorBubble error={err()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看技术详情' }));
    expect(screen.getByText('APIError: 503 No available accounts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '隐藏技术详情' }));
    expect(screen.queryByText('APIError: 503 No available accounts')).toBeNull();
  });

  it('hides toggle when no detail', () => {
    render(<ErrorBubble error={err({ detail: '' })} />);
    expect(screen.queryByRole('button', { name: '查看技术详情' })).toBeNull();
  });
});

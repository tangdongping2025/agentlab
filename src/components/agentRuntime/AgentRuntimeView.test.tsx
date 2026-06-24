import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import AgentRuntimeView from './AgentRuntimeView';

vi.mock('./AgentLibrary', () => ({
  default: () => <div data-testid="agent-library">Agent Library</div>,
}));

vi.mock('./AgentWorkspace', () => ({
  default: () => <div data-testid="agent-workspace">Agent Workspace</div>,
}));

vi.mock('./AssistantSidebar', () => ({
  default: () => <div data-testid="assistant-sidebar">Assistant Sidebar</div>,
}));

vi.mock('./ObservabilityBar', () => ({
  default: () => <div data-testid="observability-bar">Observability Bar</div>,
}));

vi.mock('./ResizeHandle', () => ({
  default: ({ direction }: { direction: string }) => <div data-testid={`resize-${direction}`} />,
}));

describe('AgentRuntimeView mobile compact chrome', () => {
  it('marks sidebars and observability chrome as hidden in mobile compact mode', () => {
    const { container } = render(<AgentRuntimeView />);

    // agent 列表(left-rail)功能模式显示(mobile-compact-hidden);观测栏/resize 移动端始终隐藏(always-hidden)
    expect(container.querySelector('[data-testid="agent-runtime-left-rail"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-left-resize"]')).toHaveClass('mobile-compact-always-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-right-resize"]')).toHaveClass('mobile-compact-always-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-right-rail"]')).toHaveClass('mobile-compact-always-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-bottom-resize"]')).toHaveClass('mobile-compact-always-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-bottom-panel"]')).toHaveClass('mobile-compact-always-hidden');
  });
});

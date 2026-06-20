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

    expect(container.querySelector('[data-testid="agent-runtime-left-rail"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-left-resize"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-right-resize"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-right-rail"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-bottom-resize"]')).toHaveClass('mobile-compact-hidden');
    expect(container.querySelector('[data-testid="agent-runtime-bottom-panel"]')).toHaveClass('mobile-compact-hidden');
  });
});

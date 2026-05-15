// __tests__/components/ContextVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import ContextVisualizer from '../../src/components/ContextVisualizer';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('ContextVisualizer', () => {
  const mockSystemPrompt = '系统提示词内容';
  const mockContextSize = 32768;

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      systemPrompt: mockSystemPrompt,
      contextSize: mockContextSize,
      conversationHistory: [],
      apiInteractions: []
    });
  });

  test('renders context visualizer', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '上下文窗口' })).toBeInTheDocument();
  });

  test('renders system prompt section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '系统提示词' })).toBeInTheDocument();
  });

  test('renders user prompt section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '用户提示词' })).toBeInTheDocument();
  });

  test('renders history section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '对话历史' })).toBeInTheDocument();
  });
});

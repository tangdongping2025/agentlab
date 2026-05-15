// __tests__/components/ProcessTimeline.test.tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import ProcessTimeline from '../../src/components/ProcessTimeline';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('ProcessTimeline', () => {
  const mockApiInteractions = [
    {
      id: '1',
      timestamp: new Date(),
      request: {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'sk-***'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1024,
          messages: [{ role: 'user', content: 'Hello' }]
        })
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: [{ type: 'text', text: 'Hello, how can I help you?' }]
        }),
        duration: 1234
      }
    }
  ];

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      apiInteractions: [],
      timelineSteps: [],
      currentScene: 'restaurant',
      selectedTools: [],
      lastUserInput: ''
    });
  });

  test('renders timeline header', () => {
    render(<ProcessTimeline />);
    expect(screen.getByRole('heading', { name: 'API 交互过程' })).toBeInTheDocument();
  });

  test('renders empty state when no interactions', () => {
    render(<ProcessTimeline />);
    expect(screen.getByText('暂无 API 交互记录')).toBeInTheDocument();
    expect(screen.getByText('发送请求后会显示详细的交互过程')).toBeInTheDocument();
  });

  test('renders API interactions when available', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      apiInteractions: mockApiInteractions,
      timelineSteps: [
        {
          id: 'user-input',
          icon: '💬',
          title: '用户输入',
          description: '等待用户输入...',
          active: false,
          completed: true,
          expandable: false,
          expanded: false
        },
        {
          id: 'context-pack',
          icon: '🧠',
          title: '上下文打包',
          description: '准备打包上下文...',
          active: false,
          completed: true,
          expandable: false,
          expanded: false
        },
        {
          id: 'tool-call',
          icon: '🔧',
          title: '工具调用',
          description: '准备调用工具...',
          active: true,
          completed: false,
          expandable: true,
          expanded: false
        }
      ],
      currentScene: 'restaurant',
      selectedTools: [],
      lastUserInput: '',
      toggleStepExpanded: vi.fn()
    });

    render(<ProcessTimeline />);

    // 检查 API 交互记录显示
    expect(screen.getByText('调用 #1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });
});

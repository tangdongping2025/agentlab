// __tests__/components/ProcessTimeline.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: 'API 交互记录' })).toBeInTheDocument();
  });

  test('renders empty state when no interactions', () => {
    render(<ProcessTimeline />);
    expect(screen.getByText('暂无 API 交互记录')).toBeInTheDocument();
  });

  test('renders API interactions when available', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      apiInteractions: mockApiInteractions,
      timelineSteps: [],
      currentScene: 'restaurant',
      selectedTools: [],
      lastUserInput: '',
      toggleStepExpanded: vi.fn()
    });

    render(<ProcessTimeline />);

    // First expand the component
    fireEvent.click(screen.getByText('▶'));

    // 检查 API 交互记录显示
    expect(screen.getByText('调用 #1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  // Step 2: Test for default collapsed state
  test('shows collapsed state by default with summary when there are interactions', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      apiInteractions: [
        {
          id: 'test-1',
          timestamp: new Date(),
          request: {
            url: 'https://api.example.com/test',
            headers: {},
            body: '{}'
          },
          response: null
        }
      ],
      timelineSteps: [],
      currentScene: 'restaurant',
      selectedTools: [],
      lastUserInput: '',
      toggleStepExpanded: vi.fn()
    });

    render(<ProcessTimeline />);

    expect(screen.getByText('(1 次调用)')).toBeInTheDocument();
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.getByText(/点击 ▶ 查看.*次 API 交互详情/)).toBeInTheDocument();
    expect(screen.queryByText('调用 #1')).not.toBeInTheDocument();
  });

  // Step 3: Test for toggle functionality
  test('toggles between collapsed and expanded when arrow is clicked', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      apiInteractions: [
        {
          id: 'test-1',
          timestamp: new Date(),
          request: {
            url: 'https://api.example.com/test',
            headers: {},
            body: '{}'
          },
          response: null
        }
      ],
      timelineSteps: [],
      currentScene: 'restaurant',
      selectedTools: [],
      lastUserInput: '',
      toggleStepExpanded: vi.fn()
    });

    render(<ProcessTimeline />);

    // Initially collapsed
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.queryByText('调用 #1')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('▶'));

    // Now expanded
    expect(screen.getByText('▼')).toBeInTheDocument();
    expect(screen.getByText('调用 #1')).toBeInTheDocument();

    // Click to collapse again
    fireEvent.click(screen.getByText('▼'));

    // Collapsed again
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.queryByText('调用 #1')).not.toBeInTheDocument();
  });
});

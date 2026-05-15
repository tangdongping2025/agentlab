import { render, screen, fireEvent } from '@testing-library/react';
import ApiReorganizeStep from './ApiReorganizeStep';
import { useAppStore } from '../stores/appStore';

// 模拟useAppStore
vi.mock('../stores/appStore');

describe('ApiReorganizeStep', () => {
  const mockStepActive = {
    id: 'api-reorganize',
    icon: '📄',
    title: '重新组织上下文报文',
    description: '工具结果已整合，重新组织上下文报文...',
    active: true,
    completed: false
  };

  const mockStepCompleted = {
    id: 'api-reorganize',
    icon: '📄',
    title: '重新组织上下文报文',
    description: '工具结果已整合，重新组织上下文报文...',
    active: false,
    completed: true
  };

  const mockApiInteractions = [
    {
      id: '1',
      timestamp: new Date(),
      request: {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'method': 'POST'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          messages: []
        })
      },
      response: {
        status: 200,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          content: [{ text: 'Hello, world!' }]
        }),
        duration: 1234
      }
    }
  ];

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      systemPrompt: '你是一个餐厅预订助手',
      conversationHistory: [
        { role: 'user', content: '我需要预订餐厅', timestamp: new Date() },
        { role: 'assistant', content: '好的，请问有什么需求？', timestamp: new Date() }
      ],
      selectedTools: ['xueqiu-search', 'xueqiu-quote'],
      availableTools: [
        { id: 'xueqiu-search', name: '📈 雪球搜索', description: '在雪球上搜索股票、基金、投资信息', icon: '📈' },
        { id: 'xueqiu-quote', name: '💰 股票行情', description: '获取实时股票行情、涨跌幅、成交量信息', icon: '💰' },
        { id: 'xueqiu-news', name: '📰 投资资讯', description: '获取最新财经新闻、公司公告、研报信息', icon: '📰' }
      ],
      contextSize: 32768,
      contextStrategy: 'sliding',
      currentScene: 'restaurant',
      apiInteractions: mockApiInteractions
    });
  });

  test('renders step title', () => {
    render(<ApiReorganizeStep step={mockStepActive} />);
    expect(screen.getByText('重新组织上下文报文')).toBeInTheDocument();
  });

  test('renders step description', () => {
    render(<ApiReorganizeStep step={mockStepActive} />);
    expect(screen.getByText('工具结果已整合，重新组织上下文报文...')).toBeInTheDocument();
  });

  test('does NOT display "查看完整报文" button when only active', () => {
    render(<ApiReorganizeStep step={mockStepActive} />);
    expect(screen.queryByText('查看完整报文')).not.toBeInTheDocument();
  });

  test('displays "查看完整报文" button when completed', () => {
    render(<ApiReorganizeStep step={mockStepCompleted} />);
    expect(screen.getByText('查看完整报文')).toBeInTheDocument();
  });

  test('opens modal when button clicked', () => {
    render(<ApiReorganizeStep step={mockStepCompleted} />);

    fireEvent.click(screen.getByText('查看完整报文'));

    expect(screen.getByText('API交互详情：完整上下文报文')).toBeInTheDocument();
  });

  test('modal contains API interaction records when available', () => {
    render(<ApiReorganizeStep step={mockStepCompleted} />);

    fireEvent.click(screen.getByText('查看完整报文'));

    const modalContent = screen.getByText(/系统提示词/);
    expect(modalContent).toBeInTheDocument();

    // 应该包含API交互记录标题
    expect(screen.getByText(/API 交互记录/)).toBeInTheDocument();
  });
});

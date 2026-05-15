import { render, screen } from '@testing-library/react';
import ToolInteractionDetails from '../../src/components/ToolInteractionDetails';

const mockDetails = {
  type: 'tool',
  toolInfo: {
    name: 'xueqiu-search',
    description: '搜索股票信息',
    parameters: { query: '贵州茅台' },
  },
  callContext: {
    systemPrompt: '你是一个投资助手',
    userQuery: '查一下贵州茅台',
    conversationHistory: [],
  },
  toolOutput: { results: [{ title: '贵州茅台', price: 1800 }] },
  reorganizedContext: '系统提示 + 用户查询 + 工具结果',
  toolUseReasoning: '用户查询股票信息，需要调用搜索工具',
};

test('renders tool interaction details', () => {
  render(<ToolInteractionDetails details={mockDetails} />);

  expect(screen.getByText('🎯 大模型思考过程')).toBeInTheDocument();
  expect(screen.getByText('📋 调用上下文')).toBeInTheDocument();
  expect(screen.getByText('🔧 工具信息')).toBeInTheDocument();
  expect(screen.getByText('📥 工具返回结果')).toBeInTheDocument();
  expect(screen.getByText('🔄 上下文重组')).toBeInTheDocument();
});

test('displays tool name and description', () => {
  render(<ToolInteractionDetails details={mockDetails} />);

  expect(screen.getByText('xueqiu-search')).toBeInTheDocument();
  expect(screen.getByText('搜索股票信息')).toBeInTheDocument();
});

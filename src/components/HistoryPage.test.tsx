import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HistoryPage from './HistoryPage';
import { dbApi } from '../services/dbApi';

vi.mock('../services/dbApi');
const mockedQuery = vi.mocked(dbApi.querySessions);
const mockedGet = vi.mocked(dbApi.getSession);

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    mockedGet.mockResolvedValue({ id: '', messages: [] } as any);
  });

  it('renders filter inputs and back button', () => {
    render(<HistoryPage onBack={() => {}} />);
    expect(screen.getByPlaceholderText(/搜索关键词/)).toBeInTheDocument();
    expect(screen.getByText(/返回对话/)).toBeInTheDocument();
  });

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<HistoryPage onBack={onBack} />);
    fireEvent.click(screen.getByText(/返回对话/));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows results from query', async () => {
    mockedQuery.mockResolvedValue({
      items: [{ id: 's1', name: '测试会话', preview: '你好', totalTokens: 100 }],
      total: 1, page: 1, size: 20,
    });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText('测试会话')).toBeInTheDocument();
  });

  it('shows empty state when no results', async () => {
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    render(<HistoryPage onBack={() => {}} />);
    expect(await screen.findByText(/无匹配会话/)).toBeInTheDocument();
  });

  it('queries with keyword when search input changes', async () => {
    mockedQuery.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });
    render(<HistoryPage onBack={() => {}} />);
    const input = screen.getByPlaceholderText(/搜索关键词/);
    fireEvent.change(input, { target: { value: '股票' } });
    // 等待 effect 触发的查询
    await screen.findByText(/无匹配会话/);
    expect(mockedQuery).toHaveBeenCalledWith(expect.objectContaining({ q: '股票' }));
  });
});

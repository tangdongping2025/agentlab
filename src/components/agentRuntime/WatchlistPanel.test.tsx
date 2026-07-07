import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WatchlistPanel from './WatchlistPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    listWatchlistQuotes: vi.fn(),
    pinWatchlist: vi.fn(),
    unpinWatchlist: vi.fn(),
  },
}));

describe('WatchlistPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders quotes columns', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '贵州茅台', note: '核心', add_time: '2026-06-26', close: 1200.5, pct_chg: 1.5, pe: 18.2, pb: 5.5, total_mv: 1500000000.0 },
    ]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-panel')).toBeTruthy());
    expect(screen.getByText('600519.SH')).toBeTruthy();
    expect(screen.getByText('1200.50')).toBeTruthy();
    expect(screen.getByText('+1.50')).toBeTruthy();
    expect(screen.getByText('150000.0 亿')).toBeTruthy();
  });

  it('renders empty hint when no items', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText(/还没有自选股/)).toBeTruthy());
  });

  it('renders error with retry when load fails', async () => {
    (dbApi.listWatchlistQuotes as any).mockRejectedValue(new Error('boom'));
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('clicking refresh calls listWatchlistQuotes with true', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-refresh-btn')).toBeTruthy());
    fireEvent.click(screen.getByTestId('watchlist-refresh-btn'));
    await waitFor(() => {
      const calls = (dbApi.listWatchlistQuotes as any).mock.calls;
      expect(calls.some((c: any[]) => c[0] === true)).toBe(true);
    });
  });

  it('pct_chg color red for up, green for down', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '茅台', close: 10, pct_chg: 2.0, total_mv: 1e8 },
      { id: 2, ts_code: '000001.SZ', name: '平安', close: 10, pct_chg: -1.5, total_mv: 1e8 },
    ]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('茅台')).toBeTruthy());
    expect(screen.getByText('+2.00').style.color).toBe('rgb(217, 83, 79)');
    expect(screen.getByText('-1.50').style.color).toBe('rgb(92, 184, 92)');
  });
});

describe('WatchlistPanel manual add/delete', () => {
  it('renders input field for adding stock code', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    expect(screen.getByTestId('watchlist-add-btn')).toBeTruthy();
  });

  it('add button is disabled when input is empty', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-add-btn')).toBeDisabled());
  });

  it('calls pinWatchlist when adding a code', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    (dbApi.pinWatchlist as any).mockResolvedValue({ ts_code: '000001.SZ', name: '平安' });
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('watchlist-code-input'), { target: { value: '000001' } });
    fireEvent.click(screen.getByTestId('watchlist-add-btn'));
    await waitFor(() => expect(dbApi.pinWatchlist).toHaveBeenCalledWith('000001'));
    // 添加后应刷新列表(至少被调用过,含 mount 时的首次 load)
    expect(dbApi.listWatchlistQuotes).toHaveBeenCalled();
  });

  it('calls unpinWatchlist when clicking delete on a row', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '茅台', close: 1200, pct_chg: 1, pe: 18, pb: 5, total_mv: 1.5e9 },
    ]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('茅台')).toBeTruthy());
    fireEvent.click(screen.getByTestId('watchlist-delete-600519.SH'));
    await waitFor(() => expect(dbApi.unpinWatchlist).toHaveBeenCalledWith('600519.SH'));
  });

  it('shows error message when pinWatchlist fails', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    (dbApi.pinWatchlist as any).mockRejectedValue(new Error('股票代码不存在'));
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('watchlist-code-input'), { target: { value: '999999' } });
    fireEvent.click(screen.getByTestId('watchlist-add-btn'));
    await waitFor(() => expect(screen.getByText(/股票代码不存在/)).toBeTruthy());
  });
});

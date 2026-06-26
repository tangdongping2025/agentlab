import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WatchlistPanel from './WatchlistPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    listWatchlistQuotes: vi.fn(),
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

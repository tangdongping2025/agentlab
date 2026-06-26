import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WatchlistPanel from './WatchlistPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    listWatchlist: vi.fn(),
  },
}));

describe('WatchlistPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders items in a table', async () => {
    (dbApi.listWatchlist as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '贵州茅台', note: '核心资产', add_time: '2026-06-26 10:00' },
      { id: 2, ts_code: '000001.SZ', name: '平安银行', note: null, add_time: '2026-06-26 11:00' },
    ]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-panel')).toBeTruthy());
    expect(screen.getByText('600519.SH')).toBeTruthy();
    expect(screen.getByText('贵州茅台')).toBeTruthy();
    expect(screen.getByText('核心资产')).toBeTruthy();
    expect(screen.getByText('000001.SZ')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders empty hint when no items', async () => {
    (dbApi.listWatchlist as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText(/还没有自选股/)).toBeTruthy());
  });

  it('renders error with retry when load fails', async () => {
    (dbApi.listWatchlist as any).mockRejectedValue(new Error('boom'));
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    expect(screen.getByText('重试')).toBeTruthy();
  });
});

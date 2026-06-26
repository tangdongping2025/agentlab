import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WatchlistSuggestButton from './WatchlistSuggestButton';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

describe('WatchlistSuggestButton', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({
      pendingWatchlistSuggestion: null,
      pinWatchlist: vi.fn().mockResolvedValue(true),
      unpinWatchlist: vi.fn().mockResolvedValue(true),
    });
  });

  it('renders nothing when no suggestion', () => {
    const { container } = render(<WatchlistSuggestButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders pin button when not pinned', () => {
    useAgentRuntimeStore.setState({
      pendingWatchlistSuggestion: { ts_code: '600519.SH', name: '贵州茅台', already_pinned: false },
    });
    render(<WatchlistSuggestButton />);
    const btn = screen.getByTestId('watchlist-pin-btn');
    expect(btn.textContent).toContain('贵州茅台');
    expect(btn.textContent).toContain('600519.SH');
  });

  it('renders pinned state with remove when already_pinned', () => {
    useAgentRuntimeStore.setState({
      pendingWatchlistSuggestion: { ts_code: '600519.SH', name: '贵州茅台', already_pinned: true },
    });
    render(<WatchlistSuggestButton />);
    expect(screen.getByTestId('watchlist-suggest').textContent).toContain('已自选');
    expect(screen.getByTestId('watchlist-unpin-btn')).toBeTruthy();
  });

  it('clicking pin calls store pinWatchlist', async () => {
    const pinWatchlist = vi.fn().mockResolvedValue(true);
    useAgentRuntimeStore.setState({
      pendingWatchlistSuggestion: { ts_code: '600519.SH', name: '贵州茅台', already_pinned: false },
      pinWatchlist,
    });
    render(<WatchlistSuggestButton />);
    await fireEvent.click(screen.getByTestId('watchlist-pin-btn'));
    await waitFor(() => expect(pinWatchlist).toHaveBeenCalledWith('600519.SH', '贵州茅台'));
  });

  it('clicking unpin calls store unpinWatchlist', async () => {
    const unpinWatchlist = vi.fn().mockResolvedValue(true);
    useAgentRuntimeStore.setState({
      pendingWatchlistSuggestion: { ts_code: '600519.SH', name: '贵州茅台', already_pinned: true },
      unpinWatchlist,
    });
    render(<WatchlistSuggestButton />);
    await fireEvent.click(screen.getByTestId('watchlist-unpin-btn'));
    await waitFor(() => expect(unpinWatchlist).toHaveBeenCalledWith('600519.SH'));
  });
});

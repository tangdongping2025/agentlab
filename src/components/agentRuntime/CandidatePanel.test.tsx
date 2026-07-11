import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CandidatePanel from './CandidatePanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    listCandidateStrategies: vi.fn(),
    listCandidateSnapshots: vi.fn(),
    listCandidates: vi.fn(),
    runCandidates: vi.fn(),
    promoteCandidate: vi.fn(),
  },
}));

describe('CandidatePanel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders empty hint when no snapshots', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [{ name: 'rank_composite', label: 'x' }], presets: { '多因子平衡': {} } });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: null, items: [] });
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-panel')).toBeTruthy());
    expect(screen.getByText(/还没跑过策略/)).toBeTruthy();
  });

  it('renders candidate rows from latest snapshot', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([{ id: 1, run_at: '2026-07-11', strategy_label: '多因子平衡', count: 1 }]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: 1, items: [
      { id: 1, rank: 1, ts_code: '600519.SH', name: '贵州茅台', industry: '食品饮料', score: 87.2, pe_rank: 45, roe_rank: 95, momentum_rank: 58, promoted: false },
    ]});
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    expect(screen.getByText('87.2')).toBeTruthy();
  });

  it('clicking run calls runCandidates', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: { '多因子平衡': {} } });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: null, items: [] });
    (dbApi.runCandidates as any).mockResolvedValue({ snapshot_id: 2, count: 3 });
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-run-btn')).toBeTruthy());
    fireEvent.click(screen.getByTestId('candidate-run-btn'));
    await waitFor(() => expect(dbApi.runCandidates).toHaveBeenCalled());
  });

  it('promoted row shows disabled 已晋升', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([{ id: 1, strategy_label: 'x', count: 1 }]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: 1, items: [
      { id: 1, rank: 1, ts_code: '600519.SH', name: '茅台', score: 80, pe_rank: 50, roe_rank: 90, momentum_rank: 50, promoted: true },
    ]});
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByText('已晋升')).toBeTruthy());
  });

  it('ML option in dropdown sends ml_ridge strategy (no label)', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: null, items: [] });
    (dbApi.runCandidates as any).mockResolvedValue({ snapshot_id: 2, count: 3 });
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-strategy-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('candidate-strategy-select'), { target: { value: 'Ridge' } });
    fireEvent.click(screen.getByTestId('candidate-run-btn'));
    await waitFor(() => expect(dbApi.runCandidates).toHaveBeenCalled());
    const call = (dbApi.runCandidates as any).mock.calls[0][0];
    expect(call.strategy).toBe('ml_ridge');
    expect(call.label).toBeUndefined();
  });

  it('hides 三秩 columns when ML strategy selected', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: 1, items: [
      { id: 1, rank: 1, ts_code: '600519.SH', name: '贵州茅台', industry: '食品饮料', score: 87.2, pe_rank: 0, roe_rank: 0, momentum_rank: 0, promoted: false },
    ]});
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    // rank-composite default: 三秩 visible
    expect(screen.getByText('PE秩')).toBeTruthy();
    expect(screen.getByText('ROE秩')).toBeTruthy();
    expect(screen.getByText('动量秩')).toBeTruthy();
    // switch to ML
    fireEvent.change(screen.getByTestId('candidate-strategy-select'), { target: { value: 'LightGBM' } });
    await waitFor(() => expect(screen.queryByText('PE秩')).toBeNull());
    expect(screen.queryByText('ROE秩')).toBeNull();
    expect(screen.queryByText('动量秩')).toBeNull();
    // 总分 still visible
    expect(screen.getByText('总分')).toBeTruthy();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BacktestPanel from './BacktestPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { runBacktest: vi.fn(), listCandidateStrategies: vi.fn() },
}));
vi.mock('recharts', () => ({   // 测试里不渲染真实 SVG
  LineChart: () => <div data-testid="mock-linechart" />,
  AreaChart: () => <div data-testid="mock-areachart" />,
  Line: () => null, Area: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Brush: () => null, ResponsiveContainer: () => null,
}));

describe('BacktestPanel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders controls + runs backtest on click', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: { '多因子平衡': {} } });
    (dbApi.runBacktest as any).mockResolvedValue({
      equity: [{ date: '2020-01-31', strategy: 1.0, benchmark: 1.0 }],
      drawdown: [{ date: '2020-01-31', value: 0 }],
      metrics: { ann_return: 0.185, bench_ann_return: 0.042, excess: 0.143, sharpe: 1.07,
                 max_drawdown: -0.214, calmar: 0.86, win_rate: 0.62 },
      caveats: [],
    });
    render(<BacktestPanel />);
    await waitFor(() => expect(screen.getByTestId('backtest-panel')).toBeTruthy());
    fireEvent.click(screen.getByTestId('backtest-run-btn'));
    await waitFor(() => expect(dbApi.runBacktest).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/18\.5/)).toBeTruthy());   // 指标 tile
  });

  it('renders caveats when present', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.runBacktest as any).mockResolvedValue({
      equity: [], drawdown: [], metrics: {}, caveats: ['幸存者偏差'],
    });
    render(<BacktestPanel />);
    await waitFor(() => expect(screen.getByTestId('backtest-panel')).toBeTruthy());
    fireEvent.click(screen.getByTestId('backtest-run-btn'));
    await waitFor(() => expect(screen.getByText(/幸存者偏差/)).toBeTruthy());
  });

  it('cadence select passes through to runBacktest', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.runBacktest as any).mockResolvedValue({ equity: [], drawdown: [], metrics: {}, caveats: [] });
    render(<BacktestPanel />);
    await waitFor(() => expect(screen.getByTestId('backtest-cadence-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('backtest-cadence-select'), { target: { value: 'quarterly' } });
    fireEvent.click(screen.getByTestId('backtest-run-btn'));
    await waitFor(() => {
      const call = (dbApi.runBacktest as any).mock.calls[0][0];
      expect(call.cadence).toBe('quarterly');
    });
  });
});

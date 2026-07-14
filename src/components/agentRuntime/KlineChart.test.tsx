import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KlineChart from './KlineChart';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { getKline: vi.fn() },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => <div data-testid="mock-chart" />,
  LineChart: () => <div />,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
}));

const POINTS = [
  { date: '20230103', close: 10, ma5: 9, ma10: null, ma20: null },
  { date: '20230104', close: 11, ma5: 10, ma10: null, ma20: null },
];

describe('KlineChart', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders chart when points present (defaults to daily)', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'daily', source: 'local', points: POINTS });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    expect(dbApi.getKline).toHaveBeenCalledWith('600519.SH', 'daily', 120);
  });

  it('switching to weekly calls getKline with freq=weekly', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'weekly', source: 'local', points: POINTS });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kline-freq-weekly'));
    await waitFor(() =>
      expect((dbApi.getKline as any).mock.calls.some((c: any[]) => c[1] === 'weekly')).toBe(true));
  });

  it('shows empty hint when points empty', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'daily', source: 'tushare', points: [] });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/暂无K线数据/)).toBeTruthy());
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StockDetailPanel from './StockDetailPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { getStockDetail: vi.fn() },
}));

const MOCK = {
  basic: { name: '贵州茅台', industry: '白酒', market: '主板', list_date: '20010827' },
  quotes: { close: 1212.1, pe_ttm: 18.4, pb: 5.59, total_mv: 1.5e12, dv_ttm: 2.5 },
  score: {
    total: 88.5, verdict: '通过初筛,值得深入研究',
    dim_scores: { '成长性': 95, '盈利质量': 95, '估值': 70, '趋势': 90, '安全': 85 },
    dim_labels: { '成长性': '🟢', '盈利质量': '🟢', '估值': '🟡', '趋势': '🟢', '安全': '🟢' },
    dim_reasons: { '成长性': '均值高增长', '盈利质量': 'ROE 30%', '估值': 'PE分位35%', '趋势': '站上MA60', '安全': '财务稳健' },
  },
  growth: { rev_cagr_3y: 18.5, np_cagr_3y: 15.2, np_yoy: 22.3 },
  profit: { roe: 30, gross_margin: 91, net_margin: 50, cash_ratio: 1.2 },
  value: { pe_now: 18.4, pe_pct: 0.35, peg: 0.8 },
  trend: { ret_1y: 0.15, above_ma60: true },
  safety: { debt_ratio: 25, current_ratio: 3.5, max_dd: -0.3 },
};

describe('StockDetailPanel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders loading then basic info + total score', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    expect(screen.getByText(/白酒/)).toBeTruthy();
    expect(screen.getByText('88.5')).toBeTruthy();
  });

  it('renders 5 dimension cards on 总览 tab', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/盈利质量/)).toBeTruthy());
    expect(screen.getByText(/均值高增长/)).toBeTruthy();
  });

  it('switches to 成长 tab and shows growth detail', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/盈利质量/)).toBeTruthy());
    fireEvent.click(screen.getByText('成长'));
    await waitFor(() => expect(screen.getByText(/营收 3 年 CAGR/)).toBeTruthy());
  });

  it('renders error when fetch fails', async () => {
    (dbApi.getStockDetail as any).mockRejectedValue(new Error('分析失败'));
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/分析失败/)).toBeTruthy());
  });
});

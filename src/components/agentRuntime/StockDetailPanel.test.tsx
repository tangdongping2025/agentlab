import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StockDetailPanel from './StockDetailPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { getStockDetail: vi.fn(), aiDeepdive: vi.fn() },
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
  buffett: {
    conclusion: { verdict: '通过初筛,值得深入研究', one_liner: '基本面不错', counts: { green: 4, yellow: 2, red: 0, gray: 2 } },
    eight_questions: [
      { n: 1, dimension: '看得懂吗', light: 'green', explain: '白酒业务简单' },
      { n: 3, dimension: '别人能复制吗', light: 'green', explain: '毛利率91%可能有护城河' },
      { n: 7, dimension: '管理层诚实吗', light: 'gray', explain: '需人工看公告' },
    ],
    moat: { signal: '毛利率 91%(>60%),可能有护城河', type: '需 AI 定性', strength: '中-强', trend: '数据不足' },
    financials: [{ metric: 'ROE', value: 30, light: 'green', explain: '每100块本金赚30块,顶级' }],
    valuation: { pe: 25, pe_pct: 0.5, explain: '历史分位50%', margin_of_safety: '合理区间' },
    risks: ['消费周期', '政策风险', '竞争'],
    summary: '白酒是收费桥型生意',
    industry_matched: '白酒',
  },
};

describe('StockDetailPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (dbApi.aiDeepdive as any).mockResolvedValue({ dimension: '', text: null, cached: false });
  });

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

  it('switches to 巴菲特 tab and renders buffett checkup', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/盈利质量/)).toBeTruthy());
    fireEvent.click(screen.getByText('🩺 巴菲特'));
    await waitFor(() => expect(screen.getByText(/基本面不错/)).toBeTruthy());
    expect(screen.getByText(/白酒业务简单/)).toBeTruthy();
    expect(screen.getByText(/巴菲特 8 问/)).toBeTruthy();
  });

  it('shows cached AI deepdive text automatically on mount (no click, no token)', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    (dbApi.aiDeepdive as any).mockImplementation((_ts: string, dim: string) =>
      Promise.resolve(dim === 'moat_type'
        ? { dimension: 'moat_type', text: '护城河是资源特许型,长江不可复制', cached: true }
        : { dimension: 'management_integrity', text: null, cached: false }));
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/盈利质量/)).toBeTruthy());
    fireEvent.click(screen.getByText('🩺 巴菲特'));
    await waitFor(() => expect(screen.getByText(/资源特许型/)).toBeTruthy());
    expect(dbApi.aiDeepdive).toHaveBeenCalledWith('600519.SH', 'moat_type', false);
  });

  it('shows deepdive button when no cache; clicking forces LLM call', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    (dbApi.aiDeepdive as any).mockImplementation((_ts: string, dim: string, force: boolean) =>
      Promise.resolve(dim === 'moat_type' && force
        ? { dimension: 'moat_type', text: '护城河是品牌型', cached: false }
        : { dimension: dim, text: null, cached: false }));
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/盈利质量/)).toBeTruthy());
    fireEvent.click(screen.getByText('🩺 巴菲特'));
    const btn = await screen.findByTestId('ai-deepdive-moat_type');
    fireEvent.click(btn);
    await waitFor(() => expect(dbApi.aiDeepdive).toHaveBeenCalledWith('600519.SH', 'moat_type', true));
    await waitFor(() => expect(screen.getByText(/品牌型/)).toBeTruthy());
  });
});

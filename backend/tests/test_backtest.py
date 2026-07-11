import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))


def test_metrics_monotonic_up_no_drawdown_full_winrate():
    from backtest import compute_metrics
    # 2 月,每月 +10%(策略) vs +5%(基准)
    m = compute_metrics([1.0, 1.10, 1.20], [1.0, 1.05, 1.10], periods_per_year=12)
    assert m["max_drawdown"] == 0.0                 # 单调上行无回撤
    assert m["win_rate"] == 1.0                      # 两期都涨
    assert m["ann_return"] > m["bench_ann_return"]   # 策略年化 > 基准
    assert m["excess"] == round(m["ann_return"] - m["bench_ann_return"], 4)


def test_metrics_max_drawdown_known_dip():
    from backtest import compute_metrics
    # 1.0 → 1.2 → 1.1(回撤 1.1/1.2-1=-0.0833)→ 1.3
    m = compute_metrics([1.0, 1.2, 1.1, 1.3], [1.0, 1.0, 1.0, 1.0], periods_per_year=12)
    assert abs(m["max_drawdown"] - (1.1 / 1.2 - 1)) < 1e-9


def test_metrics_annualization():
    from backtest import compute_metrics
    # 月频 2 期,总涨 20% → 年化 = 1.2^(12/2)-1
    m = compute_metrics([1.0, 1.10, 1.20], [1.0, 1.0, 1.0], periods_per_year=12)
    expected = 1.20 ** (12 / 2) - 1
    assert abs(m["ann_return"] - expected) < 1e-9


def test_metrics_calmar_ratio():
    from backtest import compute_metrics
    m = compute_metrics([1.0, 1.2, 1.1, 1.3], [1.0, 1.0, 1.0, 1.0], periods_per_year=12)
    assert m["max_drawdown"] < 0
    assert abs(m["calmar"] - m["ann_return"] / abs(m["max_drawdown"])) < 1e-9


def test_metrics_empty_returns_none():
    from backtest import compute_metrics
    m = compute_metrics([1.0], [1.0], periods_per_year=12)
    assert m["ann_return"] is None and m["sharpe"] is None and m["max_drawdown"] == 0.0


def test_metrics_sharpe_positive_for_steady_gains():
    from backtest import compute_metrics
    m = compute_metrics([1.0, 1.10, 1.20], [1.0, 1.0, 1.0], periods_per_year=12)
    assert m["sharpe"] is not None and m["sharpe"] > 0

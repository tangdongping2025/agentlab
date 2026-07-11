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


import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__])
    S = sessionmaker(bind=eng)
    yield S()


def _seed_daily(db, code, dates_prices, adj=1.0, pe=10.0):
    """dates_prices: [(trade_date, close), ...]"""
    for td, close in dates_prices:
        db.add(models.StockDailyModel(code=code, trade_date=td, close=close,
                                      adj_factor=adj, pe_ttm=pe, total_mv=1e5))
    db.commit()


def _seed_constituent(db, trade_date, codes, index_code="000300.SH"):
    for c in codes:
        db.add(models.IndexConstituentModel(index_code=index_code, trade_date=trade_date,
                                            code=c, weight=1.0 / len(codes)))
    db.commit()


def test_run_backtest_equity_starts_at_1_and_has_period_points(db):
    from backtest import run_backtest
    # 2 只,4 个月末交易日,单调上行
    dates = ["20200131", "20200228", "20200331", "20200430"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)], pe=10.0)
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                   "top_n": 2, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200430", cadence="monthly", cost_single=0.0)
    assert len(res["equity"]) == len(dates)
    assert res["equity"][0]["strategy"] == 1.0           # 起点归一
    assert res["equity"][0]["benchmark"] == 1.0
    # 单调上行 → 末点 > 1
    assert res["equity"][-1]["strategy"] > 1.0


def test_run_backtest_metrics_and_caveats_present(db):
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331", "20200430"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, start_date="20200101", end_date="20200430", cadence="monthly", cost_single=0.0)
    assert set(res["metrics"]) >= {"ann_return", "sharpe", "max_drawdown", "win_rate"}
    assert isinstance(res["caveats"], list)
    assert res["as_of"] == "20200430"


def test_run_backtest_cost_reduces_return(db):
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    nocost = run_backtest(db, start_date="20200101", end_date="20200331", cost_single=0.0)
    withcost = run_backtest(db, start_date="20200101", end_date="20200331", cost_single=0.01)
    assert withcost["equity"][-1]["strategy"] <= nocost["equity"][-1]["strategy"]


def test_run_backtest_cadence_quarterly_fewer_points(db):
    from backtest import run_backtest
    # 6 个月末交易日 → 月频 6 点,季频 2 点
    dates = ["20200131", "20200228", "20200331", "20200430", "20200531", "20200630"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    monthly = run_backtest(db, start_date="20200101", end_date="20200630", cadence="monthly", cost_single=0.0)
    quarterly = run_backtest(db, start_date="20200101", end_date="20200630", cadence="quarterly", cost_single=0.0)
    assert len(quarterly["equity"]) < len(monthly["equity"])


def test_run_backtest_pit_future_fundamental_invisible(db):
    """调仓日 rb 之后的财报(ann_date > rb)不可见。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    # 一份 ann_date=20210101 的财报(在所有 rb 之后)→ 不应影响 2020 的回测
    db.add(models.FundamentalPitModel(code="A", end_date="20201231", ann_date="20210101", roe=99.0))
    db.add(models.FundamentalPitModel(code="B", end_date="20201231", ann_date="20210101", roe=1.0))
    db.commit()
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, params={"w_pe": 0.0, "w_roe": 1.0, "w_mom": 0.0, "window": 252,
                                   "top_n": 2, "pe_filter": False, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200228", cost_single=0.0)
    assert len(res["equity"]) == 2   # 不崩;未来 roe 不被用(两只 roe 都 None → rank 退化但不出错)


def test_run_backtest_empty_data_returns_empty(db):
    from backtest import run_backtest
    res = run_backtest(db, start_date="20200101", end_date="20200430")
    assert res["equity"] == [] and res["metrics"]["ann_return"] is None

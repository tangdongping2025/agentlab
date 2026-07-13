import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import numpy as np


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
                                          models.IndexConstituentModel.__table__,
                                          models.IndexDailyModel.__table__])
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
    assert len(res["equity"]) == 2   # 不崩;未来 roe 不被用(roe 默认 0.0 → rank 退化但不出错)


def test_run_backtest_empty_data_returns_empty(db):
    from backtest import run_backtest
    res = run_backtest(db, start_date="20200101", end_date="20200430")
    assert res["equity"] == [] and res["metrics"]["ann_return"] is None


def test_run_backtest_pit_pick_follows_visible_not_future_roe(db):
    """top_n=1: visible roe picks A(high); a FUTURE roe that would pick B must NOT leak.
    A price rises, B price falls → equity>1.0 proves A (visible winner) held; a leak would hold B → equity<1.0."""
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331"]
    _seed_daily(db, "A", [(d, p) for d, p in zip(dates, [10.0, 12.0, 14.0])], pe=10.0)   # A 上涨
    _seed_daily(db, "B", [(d, p) for d, p in zip(dates, [10.0, 8.0, 6.0])], pe=10.0)    # B 下跌
    # 可见 roe(ann_date ≤ 所有 rb):A 高 B 低 → PIT 下选 A
    db.add(models.FundamentalPitModel(code="A", end_date="20191231", ann_date="20200101", roe=25.0))
    db.add(models.FundamentalPitModel(code="B", end_date="20191231", ann_date="20200101", roe=5.0))
    # 未来 roe(ann_date 20210101 > 所有 2020 rb):若泄漏会选 B(A=1,B=99)
    db.add(models.FundamentalPitModel(code="A", end_date="20201231", ann_date="20210101", roe=1.0))
    db.add(models.FundamentalPitModel(code="B", end_date="20201231", ann_date="20210101", roe=99.0))
    db.commit()
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, params={"w_pe": 0.0, "w_roe": 1.0, "w_mom": 0.0, "window": 252,
                                   "top_n": 1, "pe_filter": False, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200331", cost_single=0.0)
    # PIT 下选 A(可见 roe 25>B 5)→ A 上涨 → 末点 > 1.0;若泄漏选 B(未来 roe 99)→ B 下跌 → < 1.0
    assert res["equity"][-1]["strategy"] > 1.0, "PIT 泄漏:用了未来 roe 选了 B(下跌)"


def test_run_backtest_min_var_runs_and_returns_weighting_in_params(db):
    """min_var 加权成功运行,返回的 params 包含 weighting 字段,策略净值有限值(无 NaN)。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331", "20200430", "20200531", "20200630"]
    # 5 只满足 max_w=0.3 可行;用固定偏移替代 hash(code)%3 (避免 PYTHONHASHSEED 不确定性)
    offset_map = {"A": 0, "B": 1, "C": 2, "D": 0, "E": 1}
    for code in ["A", "B", "C", "D", "E"]:
        offset = offset_map[code]
        _seed_daily(db, code, [(d, 10.0 + i + offset) for i, d in enumerate(dates)], pe=10.0)
    _seed_constituent(db, "20200131", ["A", "B", "C", "D", "E"])
    res = run_backtest(db, params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                   "top_n": 5, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200630", cadence="monthly",
                       cost_single=0.0, weighting="min_var", opt_window=3, max_w=0.3)
    assert len(res["equity"]) == len(dates)
    assert res["params"]["weighting"] == "min_var"
    assert all(np.isfinite(e["strategy"]) for e in res["equity"])   # 无 NaN


def test_run_backtest_weighting_default_equal_matches_pillar_e(db):
    """weighting 默认 equal,行为与 pillar E 一致,params 包含 weighting 字段。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, start_date="20200101", end_date="20200331", cost_single=0.0)  # weighting 默认 equal
    assert res["params"]["weighting"] == "equal"


def test_run_backtest_insufficient_window_falls_back_equal_no_raise(db):
    """窗口不足(opt_window=60 但仅 2 日)时降级 equal,不抛异常,返回正确结果。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228"]                            # 仅 2 日,opt_window=60 不足
    for code in ["A", "B", "C", "D", "E"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B", "C", "D", "E"])
    res = run_backtest(db, params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                   "top_n": 5, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200228", weighting="min_var", opt_window=60)
    assert len(res["equity"]) == 2                              # 窗口不足降级 equal,不崩


def test_run_backtest_weighting_does_not_affect_benchmark(db):
    """加权只作用策略组合;基准(benchmark 列)在 equal vs min_var 下必须逐点相同。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331", "20200430", "20200531", "20200630"]
    for code, off in zip(["A", "B", "C", "D", "E"], [0, 1, 2, 3, 4]):   # 固定偏移避免 cov 奇异
        _seed_daily(db, code, [(d, 10.0 + i + off) for i, d in enumerate(dates)], pe=10.0)
    _seed_constituent(db, "20200131", ["A", "B", "C", "D", "E"])
    common = dict(params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                          "top_n": 5, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                  start_date="20200101", end_date="20200630", cadence="monthly", cost_single=0.0,
                  opt_window=3, max_w=0.3)
    eq_equal = run_backtest(db, weighting="equal", **common)["equity"]
    eq_minvar = run_backtest(db, weighting="min_var", **common)["equity"]
    assert len(eq_equal) == len(eq_minvar) == len(dates)
    # benchmark 列逐点相同(weighting 不影响基准);strategy 列可能不同
    assert [p["benchmark"] for p in eq_equal] == [p["benchmark"] for p in eq_minvar]


def test_run_backtest_ml_returns_ic(db):
    from backtest import run_backtest
    from ml_strategy import clear_panel_cache
    clear_panel_cache()
    # 18 个月日 × 5 只,确保多个调仓日有足够训练数据(min_train=12)
    dates = ["20200131","20200228","20200331","20200430","20200531","20200630","20200731","20200831","20200930","20201031","20201130","20201231","20210131","20210228","20210331","20210430","20210531","20210630"]
    for code, k in zip(["A","B","C","D","E"], range(5)):
        _seed_daily(db, code, [(d, 10.0 + i + k) for i, d in enumerate(dates)], pe=10.0+k)
        # 喂养基本面(ann_date=20200101 ≤ 所有调仓日,确保 PIT 可见)
        db.add(models.FundamentalPitModel(code=code, end_date="20191231", ann_date="20200101",
                                          roe=10+k*5, grossprofit_margin=30+k*5, debt_to_assets=40-k*5))
    db.commit()
    _seed_constituent(db, "20200131", ["A","B","C","D","E"])
    res = run_backtest(db, strategy_name="ml_lightgbm", params={"top_n": 3, "ml_start":"20200101","ml_end":"20210630"},
                       start_date="20200101", end_date="20210630", cadence="monthly", cost_single=0.0)
    assert "ic" in res and "icir" in res and "ic_win_rate" in res
    assert isinstance(res["ic"], list)
    assert len(res["equity"]) > 1  # ML 路径执行(walk-forward 多期净值);lightgbm 小样本 IC 退化,真实 300 股才出有效 IC


def test_run_backtest_rank_composite_has_no_ic(db):
    """非 ML 回测不带 ic 字段(pillar E/D 不回归)。"""
    from backtest import run_backtest
    dates = ["20200131","20200228","20200331","20200430"]
    for code in ["A","B"]:
        _seed_daily(db, code, [(d, 10.0+i) for i,d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A","B"])
    res = run_backtest(db, start_date="20200101", end_date="20200430", cost_single=0.0)  # default rank_composite
    assert "ic" not in res


def test_run_backtest_benchmark_uses_index_daily(db):
    """benchmark 用沪深300指数日线(非成分等权):seed 指数每段翻倍 → benchmark 末点=8.0。
    若 benchmark 仍用成分等权(A/B 单调+1),末点会 ≠ 8.0 → 失败,证明改用指数。"""
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331", "20200430"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    # 指数日线:100 → 200 → 400 → 800(每段翻倍)
    for i, d in enumerate(dates):
        db.add(models.IndexDailyModel(ts_code="000300.SH", trade_date=d, close=100.0 * (2 ** i), pct_chg=0.0))
    db.commit()
    res = run_backtest(db, start_date="20200101", end_date="20200430", cadence="monthly", cost_single=0.0)
    assert res["equity"][0]["benchmark"] == 1.0
    assert abs(res["equity"][-1]["benchmark"] - 8.0) < 1e-9, "benchmark 应用指数日线收益(非成分等权)"

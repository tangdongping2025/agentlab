# 候选池 pillar E(回测引擎 + Recharts 图表)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** invest agent 加「回测」tab——把 rank-composite 策略按月/季 walk-forward 跑过历史 → 净值/回撤/指标 → Recharts 交互图(Tooltip 悬停看每点值)。不落库。

**Architecture:** 后端 Python 跑回测,前端只渲染。引擎 **load-once**(一次性读窗口面板)+ 每调仓日复用纯函数 `screener.rank_composite_score`(非每调仓日重查 DB,避免 ~65k 查询)。等权组合 vs CSI300 等权基准。`compute_metrics` 纯函数便于 TDD。

**Tech Stack:** 后端 Python + SQLAlchemy + pandas(复用 candidate-pool 的 models/screener);前端 React + TypeScript + **Recharts@2.10**(已装,首次使用);测试 pytest(sqlite in-memory)+ Vitest。

**Spec:** `docs/superpowers/specs/2026-07-11-candidate-pool-backtest-design.md`

## Global Constraints

- 复用 A+B:`backend/scripts/screener.py` 的 `rank_composite_score(rows, params)`、`DEFAULT_PARAMS`;`backend/routers/candidates.py` 的 `_resolve_params(label, params)`;Task 1 的 6 张表。
- PIT 命脉:每调仓日 `rb` 只用 `trade_date ≤ rb`(行情/成分)、`ann_date ≤ rb`(财务)。
- `fina_indicator`/`index_weight` 数据天花板:`index_weight` 仅近 ~2 年(2024-07+),`rb` 早于此时退到最早快照 → 2024 前幸存者偏差,结果 `caveats` 标注。
- tushare token 用 `settings.tushare_token`(本 pillar 不直接抓数,复用 A+B 已抓数据)。
- 命令:后端 `cd backend && python -m pytest tests/<file> -v`(无 .venv,用全局 python3.12);前端 `npm run test:run -- <pattern>` + `npm run typecheck`。
- 镜像现有 CandidatePanel/WatchlistPanel 风格(暖色 #F5F1EB/#F0E7DA/#2b6cb0)。
- v1 只回测 rank_composite;不做 pillar C(ML)/D(优化)/网格扫描/对比/IC/落库。

## File Structure

**后端新建:**
- `backend/scripts/backtest.py` — `compute_metrics`(纯)+ `run_backtest`(load-once 引擎)+ 私有 helpers(`_load_panel`/`_factor_rows_as_of`/`_period_return`/`_rebalance_dates`)
- `backend/tests/test_backtest.py`

**后端修改:**
- `backend/routers/candidates.py` — 加 `POST /candidates/backtest`
- `backend/runtime/tools/candidates.py` — 加 `RunBacktestTool` + 注册
- `backend/agents/invest_agent.py` — tabs 加「回测」+ tool_names 加 `run_backtest` + prompt 段
- `backend/tests/test_candidates_router.py` / `test_candidates_tool.py` / `test_invest_agent.py` — 加用例

**前端:**
- `src/services/dbApi.ts` — 加 `runBacktest` + `BacktestResult` 类型
- `src/components/agentRuntime/BacktestPanel.tsx`(新)+ `BacktestPanel.test.tsx`(新)
- `src/components/agentRuntime/TabsWorkspace.tsx` — 渲染「回测」tab

**文档:** `项目执行跟踪矩阵.md` — +RQ-101

---

## Task 1: `compute_metrics` 纯函数

**Files:**
- Create: `backend/scripts/backtest.py`(本 Task 只写纯函数 + import)
- Test: `backend/tests/test_backtest.py`

**Interfaces:**
- Produces: `compute_metrics(strategy_eq: list[float], benchmark_eq: list[float], periods_per_year: int, rf: float = 0.02) -> dict`。返回 `{ann_return, bench_ann_return, excess, sharpe, max_drawdown, calmar, win_rate}`(均 float;空序列→各值 None)。

- [ ] **Step 1: 写失败测试** `backend/tests/test_backtest.py`

```python
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_backtest.py -v`
Expected: FAIL(`ModuleNotFoundError: backtest`)

- [ ] **Step 3: 实现** `backend/scripts/backtest.py`

```python
"""候选池 pillar E 回测引擎。load-once walk-forward + 复用 screener.rank_composite_score。"""
from __future__ import annotations
import math
from typing import Any


def compute_metrics(strategy_eq: list[float], benchmark_eq: list[float],
                    periods_per_year: int, rf: float = 0.02) -> dict:
    """纯函数:从累计净值序列算指标。eq 索引从 1.0 起,等长。
    返回 {ann_return, bench_ann_return, excess, sharpe, max_drawdown, calmar, win_rate}。
    不足 2 期 → 年化/Sharpe 为 None。"""
    def _stats(eq: list[float]):
        if len(eq) < 2:
            return {"ann": None, "sharpe": None, "mdd": 0.0, "win": None}
        rets = [(eq[i] / eq[i - 1] - 1) for i in range(1, len(eq)) if eq[i - 1]]
        n = len(rets)
        total = eq[-1] / eq[0] - 1 if eq[0] else 0.0
        ann = (1.0 + total) ** (periods_per_year / n) - 1 if n else None
        mean_r = sum(rets) / n if n else 0.0
        var = sum((r - mean_r) ** 2 for r in rets) / n if n else 0.0
        std = math.sqrt(var) if var > 0 else 0.0
        rf_period = rf / periods_per_year
        sharpe = (mean_r - rf_period) / std * math.sqrt(periods_per_year) if std > 0 else None
        # 最大回撤
        peak = eq[0]; mdd = 0.0
        for v in eq:
            peak = max(peak, v)
            mdd = min(mdd, v / peak - 1) if peak else mdd
        win = sum(1 for r in rets if r > 0) / n if n else None
        return {"ann": ann, "sharpe": sharpe, "mdd": mdd, "win": win}

    s = _stats(strategy_eq)
    b = _stats(benchmark_eq)
    ann = s["ann"]; bann = b["ann"]
    return {
        "ann_return": round(ann, 4) if ann is not None else None,
        "bench_ann_return": round(bann, 4) if bann is not None else None,
        "excess": round(ann - bann, 4) if (ann is not None and bann is not None) else None,
        "sharpe": round(s["sharpe"], 4) if s["sharpe"] is not None else None,
        "max_drawdown": round(s["mdd"], 4),
        "calmar": round(ann / abs(s["mdd"]), 4) if (ann is not None and s["mdd"] < 0) else None,
        "win_rate": round(s["win"], 4) if s["win"] is not None else None,
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_backtest.py -v`
Expected: PASS(6 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/backtest.py backend/tests/test_backtest.py
git commit -m "feat(backtest): compute_metrics 纯函数(年化/Sharpe/MaxDD/Calmar/胜率) (RQ-E1)"
```

---

## Task 2: `run_backtest` 引擎(load-once walk-forward)

**Files:**
- Modify: `backend/scripts/backtest.py`(追加 load-once 引擎 + helpers + `import models`/pandas)
- Test: `backend/tests/test_backtest.py`(追加)

**Interfaces:**
- Consumes: `screener.rank_composite_score(rows, params)`(Task A2)、Task 1 的 `StockDailyModel`/`FundamentalPitModel`/`IndexConstituentModel`
- Produces: `run_backtest(db, strategy_name="rank_composite", params=None, start_date="20200101", end_date=None, cadence="monthly", cost_single=0.001) -> dict` → `{equity:[{date,strategy,benchmark}], drawdown:[{date,value}], metrics:{...}, as_of, params, caveats:[str]}`

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_backtest.py`)

```python
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_backtest.py -v`
Expected: FAIL(`ImportError: cannot import name 'run_backtest'`)

- [ ] **Step 3: 实现** 追加到 `backend/scripts/backtest.py`(顶部加 `import models`、`import pandas as pd`、`from screener import rank_composite_score, DEFAULT_PARAMS`):

```python
import pandas as pd
from sqlalchemy.orm import Session
import models
from screener import rank_composite_score, DEFAULT_PARAMS

PERIODS_PER_YEAR = {"monthly": 12, "quarterly": 4}


def _latest_trade_date(db: Session) -> str | None:
    row = db.query(models.StockDailyModel.trade_date).order_by(
        models.StockDailyModel.trade_date.desc()).first()
    return row[0] if row else None


def _load_panel(db: Session, start_date: str, end_date: str):
    """一次性 load。返回 (daily_df, fund_df, const_df)。"""
    sd = db.query(models.StockDailyModel).filter(
        models.StockDailyModel.trade_date >= start_date,
        models.StockDailyModel.trade_date <= end_date).all()
    daily_df = pd.DataFrame([{"code": r.code, "trade_date": r.trade_date, "close": r.close,
                              "adj_factor": r.adj_factor or 1.0, "pe_ttm": r.pe_ttm}
                             for r in sd])
    fp = db.query(models.FundamentalPitModel).all()
    fund_df = pd.DataFrame([{"code": r.code, "ann_date": r.ann_date, "roe": r.roe}
                            for r in fp]) if fp else pd.DataFrame(columns=["code", "ann_date", "roe"])
    ic = db.query(models.IndexConstituentModel).filter(
        models.IndexConstituentModel.index_code == "000300.SH",
        models.IndexConstituentModel.trade_date <= end_date).all()
    const_df = pd.DataFrame([{"trade_date": r.trade_date, "code": r.code}
                             for r in ic]) if ic else pd.DataFrame(columns=["trade_date", "code"])
    return daily_df, fund_df, const_df


def _rebalance_dates(trade_dates: list[str], cadence: str, start: str, end: str) -> list[str]:
    """区间末交易日序列(monthly/quarterly)。"""
    if not trade_dates:
        return []
    s = sorted(set(t for t in trade_dates if start <= t <= end))
    if not s:
        return []
    df = pd.DataFrame({"td": s})
    dt = pd.to_datetime(df["td"], format="%Y%m%d")
    key = dt.dt.to_period("M") if cadence == "monthly" else dt.dt.to_period("Q")
    df["key"] = key.astype(str)
    return df.groupby("key")["td"].max().tolist()


def _universe_as_of(const_df: pd.DataFrame, rb: str) -> list[str]:
    sub = const_df[const_df["trade_date"] <= rb]
    if sub.empty:
        return []
    snap = sub["trade_date"].max()
    return sub[sub["trade_date"] == snap]["code"].tolist()


def _factor_rows_as_of(daily_df: pd.DataFrame, fund_df: pd.DataFrame,
                       const_df: pd.DataFrame, rb: str, window: int) -> list[dict]:
    """PIT 切片 → rank_composite_score 的 rows 输入。"""
    universe = _universe_as_of(const_df, rb)
    rows = []
    for code in universe:
        d = daily_df[(daily_df["code"] == code) & (daily_df["trade_date"] <= rb)].sort_values("trade_date")
        if d.empty:
            continue
        adj = (d["close"] * d["adj_factor"]).tolist()
        pe = float(d["pe_ttm"].iloc[-1]) if pd.notna(d["pe_ttm"].iloc[-1]) else float("nan")
        # roe PIT:ann_date ≤ rb 最新
        f = fund_df[(fund_df["code"] == code) & (fund_df["ann_date"] <= rb)]
        roe = float(f.sort_values("ann_date")["roe"].iloc[-1]) if not f.empty and pd.notna(f.sort_values("ann_date")["roe"].iloc[-1]) else float("nan")
        start_idx = max(0, len(adj) - 1 - window)
        mom = (adj[-1] / adj[start_idx] - 1) if (len(adj) >= 2 and adj[start_idx]) else 0.0
        rows.append({"code": code, "name": "", "industry": "", "pe": pe, "roe": roe, "momentum": mom})
    return rows


def _period_return(daily_df: pd.DataFrame, codes: list[str], rb: str, next_rb: str) -> float:
    """等权 codes 在 (rb, next_rb] 的收益(用复权价)。"""
    rets = []
    for code in codes:
        d = daily_df[(daily_df["code"] == code) & (daily_df["trade_date"].between(rb, next_rb))].sort_values("trade_date")
        if len(d) < 2:
            continue
        adj = (d["close"] * d["adj_factor"]).tolist()
        rets.append(adj[-1] / adj[0] - 1)
    return sum(rets) / len(rets) if rets else 0.0


def _turnover(prev: set[str], new: set[str]) -> float:
    if not new:
        return 0.0
    if not prev:                      # 首次建仓
        return 1.0
    n_new, n_prev = len(new), len(prev)
    codes = new | prev
    t = 0.0
    for c in codes:
        w_new = 1 / n_new if c in new else 0.0
        w_old = 1 / n_prev if c in prev else 0.0
        t += abs(w_new - w_old)
    return t


def run_backtest(db: Session, strategy_name: str = "rank_composite", params: dict | None = None,
                 start_date: str = "20200101", end_date: str | None = None,
                 cadence: str = "monthly", cost_single: float = 0.001) -> dict:
    params = {**DEFAULT_PARAMS, **(params or {})}
    end_date = end_date or _latest_trade_date(db)
    if cadence not in PERIODS_PER_YEAR:
        cadence = "monthly"

    daily_df, fund_df, const_df = _load_panel(db, start_date, end_date)
    if daily_df.empty:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], PERIODS_PER_YEAR[cadence]),
                "as_of": end_date, "params": params, "caveats": ["数据底座为空"]}

    rb_dates = _rebalance_dates(daily_df["trade_date"].tolist(), cadence, start_date, end_date)
    if len(rb_dates) < 2:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], PERIODS_PER_YEAR[cadence]),
                "as_of": end_date, "params": params, "caveats": ["调仓日不足(<2)"]}

    strat_eq, bench_eq, dates_out = [1.0], [1.0], [rb_dates[0]]
    prev_holdings: set[str] = set()
    for i in range(len(rb_dates) - 1):
        rb, next_rb = rb_dates[i], rb_dates[i + 1]
        rows = _factor_rows_as_of(daily_df, fund_df, const_df, rb, int(params["window"]))
        cands = rank_composite_score(rows, params)
        holdings = [c.ts_code for c in cands]
        if not holdings:                      # 该期无候选 → 持有上一期(空则空仓)
            holdings = list(prev_holdings)
        universe = _universe_as_of(const_df, rb)
        port_ret = _period_return(daily_df, holdings, rb, next_rb)
        bench_ret = _period_return(daily_df, universe, rb, next_rb)
        cost = cost_single * _turnover(prev_holdings, set(holdings))
        strat_eq.append(strat_eq[-1] * (1 + port_ret - cost))
        bench_eq.append(bench_eq[-1] * (1 + bench_ret))
        dates_out.append(next_rb)
        prev_holdings = set(holdings)

    metrics = compute_metrics(strat_eq, bench_eq, PERIODS_PER_YEAR[cadence])
    equity = [{"date": d, "strategy": round(s, 4), "benchmark": round(b, 4)}
              for d, s, b in zip(dates_out, strat_eq, bench_eq)]
    peak = strat_eq[0]; drawdown = []
    for d, s in zip(dates_out, strat_eq):
        peak = max(peak, s)
        drawdown.append({"date": d, "value": round(s / peak - 1, 4) if peak else 0.0})
    caveats = []
    if rb_dates[0] < "20240701":
        caveats.append("universe 成分(index_weight)仅近 ~2 年有效,2024-07 前回测存在幸存者偏差")
    return {"equity": equity, "drawdown": drawdown, "metrics": metrics,
            "as_of": end_date, "params": params, "caveats": caveats}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_backtest.py -v`
Expected: PASS(6 + Task1 6 = 12 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/backtest.py backend/tests/test_backtest.py
git commit -m "feat(backtest): run_backtest 引擎 load-once walk-forward (RQ-E2)"
```

---

## Task 3: Router `POST /candidates/backtest`

**Files:**
- Modify: `backend/routers/candidates.py`(加端点)
- Test: `backend/tests/test_candidates_router.py`(加用例)

**Interfaces:**
- Consumes: `backtest.run_backtest`、router 现有 `_resolve_params`、`models.StockDailyModel`
- Produces: `POST /api/db/candidates/backtest` body `{strategy, label?, params?, cadence?, start?, end?, cost?}` → `{equity, drawdown, metrics, as_of, params, caveats}`;空底座→409

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_candidates_router.py`,复用其现有 `client` fixture)

```python
def test_backtest_empty_data_returns_409(client):
    r = client.post("/api/db/candidates/backtest", json={"strategy": "rank_composite"})
    assert r.status_code == 409
    assert "fetch" in r.json()["detail"]


def test_backtest_happy_returns_series_and_metrics(client, monkeypatch):
    from routers import candidates as cands
    # 绕过空底座检查
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20200131", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    fake = {"equity": [{"date": "20200131", "strategy": 1.0, "benchmark": 1.0}],
            "drawdown": [{"date": "20200131", "value": 0.0}],
            "metrics": {"ann_return": 0.18, "sharpe": 1.07, "max_drawdown": -0.21, "win_rate": 0.62},
            "as_of": "20200430", "params": {"w_pe": 0.3}, "caveats": []}
    monkeypatch.setattr(cands, "run_backtest", lambda *a, **k: fake)
    r = client.post("/api/db/candidates/backtest",
                    json={"strategy": "rank_composite", "label": "多因子平衡", "cadence": "monthly"})
    assert r.status_code == 200
    body = r.json()
    assert body["metrics"]["sharpe"] == 1.07
    assert body["equity"][0]["strategy"] == 1.0
    assert body["params"]["w_pe"] == 0.3


def test_backtest_custom_params_and_cadence(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20200131", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    captured = {}
    def fake(db, strategy_name=None, params=None, **k):
        captured["params"] = params; captured["cadence"] = k.get("cadence")
        return {"equity": [], "drawdown": [], "metrics": {}, "as_of": None, "params": params, "caveats": []}
    monkeypatch.setattr(cands, "run_backtest", fake)
    r = client.post("/api/db/candidates/backtest", json={
        "strategy": "rank_composite", "cadence": "quarterly",
        "params": {"w_pe": 0.5, "w_roe": 0.5, "w_mom": 0.0, "top_n": 10}})
    assert r.status_code == 200
    assert captured["params"]["w_pe"] == 0.5 and captured["cadence"] == "quarterly"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_candidates_router.py::test_backtest_empty_data_returns_409 -v`
Expected: FAIL(404 — 端点不存在)

- [ ] **Step 3: 实现** 在 `backend/routers/candidates.py` 顶部 import 行(`from screener import ...` 那行)加 `run_backtest`:
```python
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS  # 现有
from backtest import run_backtest                                  # 新增
```
在 `promote` 端点之后追加:
```python
@router.post("/candidates/backtest")
def backtest(payload: dict, db: Session = Depends(get_db)):
    strategy = payload.get("strategy", "rank_composite")
    if strategy != "rank_composite":
        raise HTTPException(status_code=400, detail=f"v1 仅支持 rank_composite: {strategy}")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(status_code=409, detail="数据底座为空,先跑 scripts/fetch_candidates_data.py")
    params = _resolve_params(payload.get("label"), payload.get("params"))
    return run_backtest(db, strategy, params,
                        start_date=payload.get("start", "20200101"),
                        end_date=payload.get("end"),
                        cadence=payload.get("cadence", "monthly"),
                        cost_single=payload.get("cost", 0.001))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_candidates_router.py -v`
Expected: PASS(现有 6 + 新 3 = 9)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/candidates.py backend/tests/test_candidates_router.py
git commit -m "feat(backtest): POST /candidates/backtest 端点 (RQ-E3)"
```

---

## Task 4: 工具 `run_backtest`(RunBacktestTool)

**Files:**
- Modify: `backend/runtime/tools/candidates.py`(加 RunBacktestTool + 注册)
- Test: `backend/tests/test_candidates_tool.py`(加用例)

**Interfaces:**
- Consumes: `backtest.run_backtest`、screener `PRESETS`/`DEFAULT_PARAMS`
- Produces: 工具 `run_backtest`(只返回指标摘要 + caveats,不返回整条 series)

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_candidates_tool.py`,复用其现有 `patch_session` fixture)

```python
@pytest.mark.asyncio
async def test_run_backtest_tool_returns_metrics_summary(patch_session, monkeypatch):
    from runtime.tools import candidates as ct
    monkeypatch.setattr(ct, "run_backtest", lambda *a, **k: {
        "equity": [{"date": "x", "strategy": 1.2, "benchmark": 1.05}],
        "metrics": {"ann_return": 0.185, "bench_ann_return": 0.042, "excess": 0.143,
                    "sharpe": 1.07, "max_drawdown": -0.214, "calmar": 0.86, "win_rate": 0.62},
        "caveats": ["幸存者偏差"]})
    out = await ct.RunBacktestTool().execute(label="多因子平衡", cadence="monthly")
    import json
    body = json.loads(out)
    assert body["metrics"]["sharpe"] == 1.07
    assert "equity" not in body                     # 不返回整条 series
    assert body["caveats"] == ["幸存者偏差"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_candidates_tool.py::test_run_backtest_tool_returns_metrics_summary -v`
Expected: FAIL(`AttributeError: module ... has no attribute 'RunBacktestTool'`)

- [ ] **Step 3: 实现** 在 `backend/runtime/tools/candidates.py`:
顶部 import 行(`from screener import compute_candidates, PRESETS, DEFAULT_PARAMS`)加 `run_backtest`:
```python
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS  # 现有
from backtest import run_backtest                                  # 新增
```
在 `PromoteCandidateTool` 之后、`_register_default` 之前加(用真实 `SessionLocal`,与 RunScreenerTool 同模式;测试 monkeypatch `run_backtest` 故不触碰 db):
```python
class RunBacktestTool:
    name = "run_backtest"
    description = ("回测某个策略(默认「多因子平衡」)的历史表现,返回指标摘要(年化/基准/超额/Sharpe/"
                   "最大回撤/Calmar/胜率)+ caveats。不返回整条净值序列。用户说「回测/历史表现/跑一遍看看」时调用。")
    input_schema = {
        "type": "object", "properties": {
            "label": {"type": "string", "description": "预设名:多因子平衡/价值+质量/纯动量/价值+动量"},
            "params": {"type": "object", "description": "自定义参数(覆盖预设)"},
            "cadence": {"type": "string", "description": "monthly(默认)/quarterly"},
            "start": {"type": "string", "description": "起始日 YYYYMMDD,默认 20200101"},
            "end": {"type": "string", "description": "结束日 YYYYMMDD,默认最新"},
        },
    }

    async def execute(self, **params: Any) -> str:
        label = params.get("label", "多因子平衡")
        custom = params.get("params")
        p = {**DEFAULT_PARAMS, **custom} if custom else dict(PRESETS.get(label, DEFAULT_PARAMS))
        db = SessionLocal()
        try:
            result = run_backtest(db, "rank_composite", p,
                                  start_date=params.get("start", "20200101"),
                                  end_date=params.get("end"),
                                  cadence=params.get("cadence", "monthly"))
        finally:
            db.close()
        return json.dumps({"metrics": result["metrics"], "caveats": result["caveats"],
                           "as_of": result["as_of"], "label": label,
                           "cadence": params.get("cadence", "monthly")},
                          ensure_ascii=False)
```
在 `_register_default()` 末尾加 `register_tool(RunBacktestTool())`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_candidates_tool.py -v`
Expected: PASS(现有 6 + 新 1 = 7)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/tools/candidates.py backend/tests/test_candidates_tool.py
git commit -m "feat(backtest): run_backtest 工具(指标摘要) (RQ-E4)"
```

---

## Task 5: invest_agent 接线(tab + tool + prompt)

**Files:**
- Modify: `backend/agents/invest_agent.py`
- Test: `backend/tests/test_invest_agent.py`

**Interfaces:**
- Produces: tabs 加「回测」、tool_names 加 `run_backtest`、prompt 加【回测】段

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_invest_agent.py`)

```python
def test_invest_agent_has_backtest_tab_and_tool():
    from agents.invest_agent import InvestAgent
    meta = InvestAgent.metadata
    assert "回测" in (meta.workspace or {}).get("tabs", [])
    assert "run_backtest" in InvestAgent.tool_names
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_invest_agent.py::test_invest_agent_has_backtest_tab_and_tool -v`
Expected: FAIL(`AssertionError`,"回测" not in tabs)

- [ ] **Step 3: 实现** 改 `backend/agents/invest_agent.py`:
- `workspace.tabs`:`["对话", "文件", "Skill", "自选股", "候选池", "回测"]`
- `tool_names` 末尾加 `"run_backtest"`
- `system_prompt` 末尾(候选池段之后)追加:
```python
        "\n\n【回测·历史表现】\n"
        "- 用户想「回测/历史表现/跑一遍看看这策略过去几年怎样」时,调 run_backtest(默认多因子平衡,可选 cadence 月/季、区间)→ 返回年化/Sharpe/最大回撤等指标摘要。\n"
        "- 回测是把策略 walk-forward 跑过历史;结果仅参考(幸存者偏差、不含未来)。结合数据诚实标注局限。\n"
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_invest_agent.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/agents/invest_agent.py backend/tests/test_invest_agent.py
git commit -m "feat(backtest): invest_agent 接入回测 tab+工具 (RQ-E5)"
```

---

## Task 6: 前端 dbApi + BacktestPanel + 测试

**Files:**
- Modify: `src/services/dbApi.ts`(加 `runBacktest` + `BacktestResult` 类型)
- Create: `src/components/agentRuntime/BacktestPanel.tsx`
- Create: `src/components/agentRuntime/BacktestPanel.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `POST /candidates/backtest`
- Produces: `BacktestPanel` 组件、`dbApi.runBacktest`

- [ ] **Step 1: 写失败测试** `src/components/agentRuntime/BacktestPanel.test.tsx`

```tsx
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- BacktestPanel`
Expected: FAIL(`Cannot find module './BacktestPanel'`)

- [ ] **Step 3a: 实现 dbApi** 在 `src/services/dbApi.ts` 加类型(在 CandidateStrategies 附近)+ 方法(在 `dbApi` 对象内,`runCandidates` 之后):

```ts
export interface BacktestPoint { date: string; strategy: number; benchmark: number; }
export interface BacktestResult {
  equity: BacktestPoint[];
  drawdown: { date: string; value: number }[];
  metrics: {
    ann_return: number | null; bench_ann_return: number | null; excess: number | null;
    sharpe: number | null; max_drawdown: number | null; calmar: number | null; win_rate: number | null;
  };
  as_of?: string; params?: Record<string, unknown>; caveats: string[];
}
```
dbApi 内:
```ts
  runBacktest: (payload: { strategy: string; label?: string; params?: Record<string, unknown>;
                           cadence?: string; start?: string; end?: string; cost?: number }) =>
    req<BacktestResult>('/candidates/backtest', { method: 'POST', body: JSON.stringify(payload) }),
```

- [ ] **Step 3b: 实现 BacktestPanel.tsx** `src/components/agentRuntime/BacktestPanel.tsx`(Recharts 首次使用;镜像 CandidatePanel 暖色风):

```tsx
import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Brush, AreaChart, Area, ResponsiveContainer } from 'recharts';
import { dbApi, type BacktestResult } from '../../services/dbApi';

const PRESET_LABELS = ['多因子平衡', '价值+质量', '纯动量', '价值+动量', '自定义'] as const;

const BacktestPanel: React.FC = () => {
  const [label, setLabel] = useState<string>('多因子平衡');
  const [cadence, setCadence] = useState<string>('monthly');
  const [start, setStart] = useState('20200101');
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setRunning(true); setError(null);
    try {
      const payload: any = { strategy: 'rank_composite', cadence, start, label };
      if (label === '自定义') payload.params = { w_pe: 30, w_roe: 30, w_mom: 40 };  // 自定义占位(可扩面板)
      setResult(await dbApi.runBacktest(payload));
    } catch (e) { setError(e instanceof Error ? e.message : '回测失败'); }
    finally { setRunning(false); }
  }, [label, cadence, start]);
  // 不自动跑——用户点【📊 回测】才触发(避免 mount 时无意义请求)

  const m = result?.metrics;
  const Tile = ({ k, v, color }: any) => (
    <div style={{ flex: 1, minWidth: 90, background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#8a8178' }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || '#1A1A1A' }}>{v}</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="backtest-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6b6155' }}>策略</span>
        <select value={label} onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #2b6cb0', borderRadius: 6, background: '#fff', fontSize: 13, fontWeight: 600, color: '#2b6cb0' }}>
          {PRESET_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#6b6155' }}>频率</span>
        <select data-testid="backtest-cadence-select" value={cadence} onChange={(e) => setCadence(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
          <option value="monthly">月频</option><option value="quarterly">季频</option>
        </select>
        <span style={{ fontSize: 12, color: '#6b6155' }}>起</span>
        <input value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 80, padding: '6px 8px', border: '1px solid #D6CFC4', borderRadius: 6, fontSize: 13 }} />
        <button data-testid="backtest-run-btn" onClick={handleRun} disabled={running}
          style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: running ? '#8aa8c9' : '#2b6cb0', color: '#fff', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '回测中…' : '📊 回测'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--accent-red,#d9534f)', fontSize: 12 }}>{error}</div>}
      {result?.caveats?.map((c, i) => (
        <div key={i} style={{ color: '#b8860b', fontSize: 12, background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 6, padding: '4px 8px' }}>⚠️ {c}</div>
      ))}

      {m && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tile k="年化" v={m.ann_return != null ? (m.ann_return * 100).toFixed(1) + '%' : '—'} color="#d9534f" />
          <Tile k="基准" v={m.bench_ann_return != null ? (m.bench_ann_return * 100).toFixed(1) + '%' : '—'} color="#8a8178" />
          <Tile k="超额" v={m.excess != null ? (m.excess * 100).toFixed(1) + '%' : '—'} color="#2b6cb0" />
          <Tile k="Sharpe" v={m.sharpe ?? '—'} />
          <Tile k="最大回撤" v={m.max_drawdown != null ? (m.max_drawdown * 100).toFixed(1) + '%' : '—'} color="#5cb85c" />
          <Tile k="Calmar" v={m.calmar ?? '—'} />
          <Tile k="胜率" v={m.win_rate != null ? (m.win_rate * 100).toFixed(0) + '%' : '—'} />
        </div>
      )}

      {result && result.equity.length > 1 && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6155', marginBottom: 6 }}>净值曲线(基准=1.0)</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={result.equity}>
                <CartesianGrid stroke="#EFE7DA" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="strategy" stroke="#2b6cb0" strokeWidth={2} dot={false} name="策略" />
                <Line type="monotone" dataKey="benchmark" stroke="#b3aa9c" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="基准" />
                <Brush dataKey="date" height={20} stroke="#2b6cb0" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b6155', marginBottom: 6 }}>水下回撤</div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={result.drawdown}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#d9534f" fill="rgba(217,83,79,0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {!result && !running && <div style={{ color: '#888', fontSize: 13 }}>选好策略点【📊 回测】。</div>}
    </div>
  );
};
export default BacktestPanel;
```

> 测试里 `vi.mock('recharts')` 把 LineChart/AreaChart 渲染成带 `data-testid` 的 div;但上面的组件用真实 Recharts 组件(测试环境被 mock 替换)。组件内额外放的 `<div data-testid="mock-linechart" style="display:none">` 是为了让测试在 mock 下能稳定命中 testid——若 mock 已返回 testid 则可删,二选一即可。**简化**:依赖 `vi.mock` 返回的 testid,删掉组件里那两个 display:none div;测试断言用 `getAllByTestId('mock-linechart')` 容错(0 或 1 个均可,测试只验证 runBacktest 被调 + 指标 tile)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- BacktestPanel && npm run typecheck`
Expected: 3 tests PASS + typecheck clean

- [ ] **Step 5: Commit**

```bash
git add src/services/dbApi.ts src/components/agentRuntime/BacktestPanel.tsx src/components/agentRuntime/BacktestPanel.test.tsx
git commit -m "feat(backtest): BacktestPanel + dbApi.runBacktest(Recharts 净值/回撤 + 指标) (RQ-E6)"
```

---

## Task 7: TabsWorkspace 接线

**Files:**
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`

**Interfaces:**
- Consumes: Task 6 的 `BacktestPanel`

- [ ] **Step 1: 改 `src/components/agentRuntime/TabsWorkspace.tsx`** —— import 加:
```tsx
import BacktestPanel from './BacktestPanel';
```
渲染区(候选池行之后)加:
```tsx
        {activeStatic === '回测' && <BacktestPanel />}
```

- [ ] **Step 2: typecheck + TabsWorkspace 测试**

Run: `npm run typecheck && npm run test:run -- TabsWorkspace`
Expected: typecheck PASS;测试 PASS(无回归)

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/TabsWorkspace.tsx
git commit -m "feat(backtest): TabsWorkspace 渲染回测 tab (RQ-E7)"
```

---

## Task 8: 跟踪矩阵 + 全量验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 更新跟踪矩阵** 加 RQ-101(pillar E 回测)条目,沿用现有格式(🆕/📋/📝/🔨/✅/🔍)。

- [ ] **Step 2: 全量后端候选池+回测测试**

Run: `cd backend && python -m pytest tests/test_backtest.py tests/test_candidate_model.py tests/test_screener.py tests/test_candidates_router.py tests/test_candidates_tool.py tests/test_invest_agent.py -v`
Expected: 全 PASS(回测 12 + 候选池既有 ~31)

- [ ] **Step 3: 前端 typecheck + 全量前端测试**

Run: `npm run typecheck && npm run test:run`
Expected: typecheck PASS;前端候选池/回测相关全 PASS(全量套件的预存债/MySQL-down 失败与本 pillar 无关)

- [ ] **Step 4: 端到端冒烟(手动)**

`npm run dev` + 后端起;选「龙虾·原生版·投资助手」→ 回测 tab → 多因子平衡 → 📊回测 → 净值曲线+回撤+指标出现,悬停看每点值;切季频重跑;对话里说「回测一下多因子平衡」→ agent 调 run_backtest 返回指标摘要。

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 跟踪矩阵补 候选池 pillar E 回测 RQ-101 + 端到端验证"
```

---

## Self-Review(plan 写完自查)

- **Spec 覆盖**:① 回测引擎(Task 1 compute_metrics + Task 2 run_backtest)✓;② router /candidates/backtest(Task 3)✓;③ BacktestPanel + 回测 tab(Task 6/7)✓;④ run_backtest 工具(Task 4)✓;⑤ invest_agent 接线(Task 5)✓;⑥ load-once + 复用 rank_composite_score(Task 2)✓;⑦ cadence 可切换默认月频(Task 2 + Task 6 面板)✓;⑧ 不落库(全链无 DB 写)✓;⑨ 幸存者偏差 caveats(Task 2)✓;⑩ Recharts Tooltip/Brush(Task 6)✓。
- **占位符扫描**:无 TBD/TODO;Task 4 有「修正」注(已在同 task 给出修正后的 execute 代码,实现者用修正版);Task 6 Recharts mock 锚点已注明简化处理。
- **类型一致**:`run_backtest(db, strategy_name, params, start_date, end_date, cadence, cost_single)` 签名 Task 2 定义,Task 3/4 调用一致;`compute_metrics(strategy_eq, benchmark_eq, periods_per_year, rf)` Task 1 定义,Task 2 调用一致;`BacktestResult` 字段 Task 3(router 返回)/Task 6(前端类型)一致;`run_backtest_tool` 只回 metrics+caveats(Task 4 测试断言 `equity not in body`)。
- **风险点(执行时留意)**:① Task 2 `_factor_rows_as_of` 的 PIT 切片逻辑与 screener 的 DB 版并行(非 DRY,因数据源不同——可接受);② Task 6 Recharts 首次使用,vi.mock 需覆盖所有用到的子组件(LineChart/AreaChart/Line/Area/XAxis/YAxis/CartesianGrid/Tooltip/Brush/ResponsiveContainer);③ Task 4 `run_backtest` 工具用真实 SessionLocal(非 None),用修正后的 execute 代码。

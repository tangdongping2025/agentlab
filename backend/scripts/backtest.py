"""候选池 pillar E 回测引擎。load-once walk-forward + 复用 screener.rank_composite_score。"""
from __future__ import annotations
import math
from typing import Any

import pandas as pd
from sqlalchemy.orm import Session
import models
from screener import rank_composite_score, DEFAULT_PARAMS


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
    ann = s["ann"]; bann = b["ann"]; mdd = s["mdd"]
    excess = ann - bann if (ann is not None and bann is not None) else None
    return {
        "ann_return": ann,
        "bench_ann_return": bann,
        "excess": round(excess, 4) if excess is not None else None,
        "sharpe": s["sharpe"],
        "max_drawdown": mdd,
        "calmar": ann / abs(mdd) if (ann is not None and mdd < 0) else None,
        "win_rate": s["win"],
    }


# ---- Task 2: load-once walk-forward 引擎 ----

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
        # roe PIT:ann_date ≤ rb 最新;无可见财报 → 0.0(中性,不因缺数据在 roe_min<=0 时误滤)
        f = fund_df[(fund_df["code"] == code) & (fund_df["ann_date"] <= rb)]
        roe = float(f.sort_values("ann_date")["roe"].iloc[-1]) if not f.empty and pd.notna(f.sort_values("ann_date")["roe"].iloc[-1]) else 0.0
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


def _turnover(prev: set, new: set) -> float:
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
    prev_holdings: set = set()
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

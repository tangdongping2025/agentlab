"""候选池 pillar E 回测引擎。load-once walk-forward + 复用 screener.rank_composite_score。"""
from __future__ import annotations
import math

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from scipy.stats import spearmanr
import models
from screener import rank_composite_score, DEFAULT_PARAMS
from weighting import compute_weights


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
                              "adj_factor": r.adj_factor or 1.0, "pe_ttm": r.pe_ttm,
                              "total_mv": r.total_mv}
                             for r in sd])
    fp = db.query(models.FundamentalPitModel).all()
    fund_df = pd.DataFrame([{"code": r.code, "ann_date": r.ann_date, "roe": r.roe,
                             "grossprofit_margin": r.grossprofit_margin,
                             "debt_to_assets": r.debt_to_assets}
                            for r in fp]) if fp else pd.DataFrame(
                                columns=["code", "ann_date", "roe", "grossprofit_margin", "debt_to_assets"])
    ic = db.query(models.IndexConstituentModel).filter(
        models.IndexConstituentModel.index_code == "000300.SH",
        models.IndexConstituentModel.trade_date <= end_date).all()
    const_df = pd.DataFrame([{"trade_date": r.trade_date, "code": r.code}
                             for r in ic]) if ic else pd.DataFrame(columns=["trade_date", "code"])
    # 沪深300指数日线(真 benchmark,替代成分等权 proxy)
    idx = db.query(models.IndexDailyModel).filter(
        models.IndexDailyModel.ts_code == "000300.SH",
        models.IndexDailyModel.trade_date >= start_date,
        models.IndexDailyModel.trade_date <= end_date).all()
    idx_close = {r.trade_date: float(r.close) for r in idx if r.close}
    return daily_df, fund_df, const_df, idx_close


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


def _factor_rows_as_of(daily_by_code: dict, fund_by_code: dict,
                       const_df: pd.DataFrame, rb: str, window: int) -> list[dict]:
    """PIT 切片 → rank_composite_score 的 rows 输入。
    daily_by_code/fund_by_code: run_backtest 预分组的 {code: 已排序 DataFrame}。"""
    universe = _universe_as_of(const_df, rb)
    rows = []
    for code in universe:
        d = daily_by_code.get(code)               # O(1) 查表;已按 trade_date 排序
        if d is None:
            continue
        sub = d[d["trade_date"] <= rb]            # 保留排序,iloc[-1] = 最新 ≤ rb
        if sub.empty:
            continue
        adj = (sub["close"] * sub["adj_factor"]).tolist()
        pe = float(sub["pe_ttm"].iloc[-1]) if pd.notna(sub["pe_ttm"].iloc[-1]) else float("nan")
        # roe PIT:ann_date ≤ rb 最新;无可见财报 → 0.0(中性,不因缺数据在 roe_min<=0 时误滤)
        roe = 0.0
        f = fund_by_code.get(code)
        if f is not None and not f.empty:
            fsub = f[f["ann_date"] <= rb]         # 已按 ann_date 排序,iloc[-1] = 最新 ≤ rb
            if not fsub.empty and pd.notna(fsub["roe"].iloc[-1]):
                roe = float(fsub["roe"].iloc[-1])
        start_idx = max(0, len(adj) - 1 - window)
        mom = (adj[-1] / adj[start_idx] - 1) if (len(adj) >= 2 and adj[start_idx]) else 0.0
        rows.append({"code": code, "name": "", "industry": "", "pe": pe, "roe": roe, "momentum": mom})
    return rows


def _period_return(daily_by_code: dict, codes: list[str], rb: str, next_rb: str) -> float:
    """等权 codes 在 (rb, next_rb] 的收益(用复权价)。daily_by_code: 预分组的 {code: 已排序 DataFrame}。"""
    rets = []
    for code in codes:
        d = daily_by_code.get(code)
        if d is None:
            continue
        sub = d[d["trade_date"].between(rb, next_rb)]   # 已排序,adj[0]=rb 侧,adj[-1]=next_rb 侧
        if len(sub) < 2:
            continue
        adj = (sub["close"] * sub["adj_factor"]).tolist()
        rets.append(adj[-1] / adj[0] - 1)
    return sum(rets) / len(rets) if rets else 0.0


def _index_return(idx_close: dict, idx_keys: list[str], rb: str, next_rb: str) -> float:
    """沪深300指数在 (rb, next_rb] 的收益。rb/next_rb 不命中(如春节假日个股有脏数据但指数无)
    时用最近前一交易日 close(bisect),避免漏算暴跌/暴涨段。"""
    import bisect
    def _near(d: str):
        c = idx_close.get(d)
        if c is not None:
            return c
        i = bisect.bisect_right(idx_keys, d) - 1
        return idx_close[idx_keys[i]] if i >= 0 else None
    c_rb = _near(rb); c_next = _near(next_rb)
    if c_rb and c_next:
        return c_next / c_rb - 1
    return 0.0


def _stock_return(daily_by_code: dict, code: str, rb: str, next_rb: str) -> float:
    """单只 code 在 (rb, next_rb] 的复权收益。"""
    d = daily_by_code.get(code)
    if d is None:
        return 0.0
    sub = d[d["trade_date"].between(rb, next_rb)]
    if len(sub) < 2:
        return 0.0
    adj = (sub["close"] * sub["adj_factor"]).tolist()
    return (adj[-1] / adj[0] - 1) if adj[0] else 0.0


def _holdings_cov(daily_by_code: dict, holdings: list[str], rb: str, opt_window: int):
    """holdings 在 ≤rb 的 opt_window 日收益协方差(np.ndarray)。返回 (cov, ok);ok=False=窗口不足。"""
    series = {}
    for code in holdings:
        d = daily_by_code.get(code)
        if d is None:
            return None, False
        sub = d[d["trade_date"] <= rb].sort_values("trade_date").tail(opt_window + 1)
        if len(sub) < 2:
            return None, False
        adj = (sub["close"] * sub["adj_factor"]).tolist()
        rets = [adj[i] / adj[i - 1] - 1 for i in range(1, len(adj)) if adj[i - 1]]
        if len(rets) < 2:
            return None, False
        series[code] = rets
    min_len = min(len(r) for r in series.values())
    mat = np.array([series[c][-min_len:] for c in holdings])
    if mat.shape[0] < 2:
        return None, False
    return np.cov(mat), True


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


def _run_ml_backtest(db: Session, strategy_name: str, params: dict,
                     start_date: str, end_date: str, cadence: str,
                     cost_single: float, weighting: str, opt_window: int, max_w: float) -> dict:
    """ML 策略回测(ml_ridge/ml_lightgbm)。返回 pillar E/D shape + ic/icir/ic_win_rate。
    _load_panel 提到循环外(只调一次),daily_by_code/const_df 循环内复用(性能)。"""
    from ml_strategy import _get_panel
    from screener import STRATEGIES
    strat = STRATEGIES[strategy_name]
    panel = _get_panel(db, params.get("ml_start", start_date), end_date)
    if panel.empty:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], 12),
                "as_of": end_date, "params": {**params, "weighting": weighting}, "caveats": ["ML 面板为空"]}
    rb_dates = sorted(panel["date"].unique().tolist())
    rb_dates = [d for d in rb_dates if start_date <= d <= end_date]
    if len(rb_dates) < 2:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], 12),
                "as_of": end_date, "params": {**params, "weighting": weighting}, "caveats": ["调仓日不足"]}
    # HOIST: _load_panel 只调一次,daily_by_code/const_df 循环内复用(避免 N 次全表读)
    daily_df, _fund_df, const_df, idx_close = _load_panel(db, start_date, end_date)
    daily_by_code = {c: g.sort_values("trade_date") for c, g in daily_df.groupby("code")}
    idx_keys = sorted(idx_close)
    strat_eq, bench_eq, dates_out, ic_series = [1.0], [1.0], [rb_dates[0]], []
    prev_holdings: set = set()
    for i in range(len(rb_dates) - 1):
        rb, next_rb = rb_dates[i], rb_dates[i + 1]
        cands = strat.run(db, rb, params)
        holdings = [c.ts_code for c in cands] or list(prev_holdings)
        # 组合收益(加权/等权,同 D);基准=沪深300真指数
        if weighting == "equal" or len(holdings) < 2:
            port_ret = _period_return(daily_by_code, holdings, rb, next_rb)
        else:
            cov, ok = _holdings_cov(daily_by_code, holdings, rb, opt_window)
            if not ok:
                port_ret = _period_return(daily_by_code, holdings, rb, next_rb)
            else:
                w = compute_weights(weighting, cov, max_w)
                port_ret = sum(wj * _stock_return(daily_by_code, holdings[j], rb, next_rb)
                               for j, wj in enumerate(w))
        bench_ret = _index_return(idx_close, idx_keys, rb, next_rb)
        cost = cost_single * _turnover(prev_holdings, set(holdings))
        strat_eq.append(strat_eq[-1] * (1 + port_ret - cost))
        bench_eq.append(bench_eq[-1] * (1 + bench_ret))
        dates_out.append(next_rb)
        prev_holdings = set(holdings)
        # IC: 预测分 vs 面板该 rb 的实现 fwd_ret(Spearman)
        scores = strat.predict_all(db, rb, params)
        sub = panel[panel["date"] == rb]
        realized = {r["code"]: r["fwd_ret"] for _, r in sub.iterrows() if pd.notna(r["fwd_ret"])}
        common = [c for c in scores if c in realized]
        if len(common) >= 5:
            rho, _ = spearmanr([scores[c] for c in common], [realized[c] for c in common])
            if np.isfinite(rho):
                ic_series.append({"date": rb, "ic": round(float(rho), 4)})
    metrics = compute_metrics(strat_eq, bench_eq, 12)
    equity = [{"date": d, "strategy": round(s, 4), "benchmark": round(b, 4)}
              for d, s, b in zip(dates_out, strat_eq, bench_eq)]
    peak = strat_eq[0]; drawdown = []
    for d, s in zip(dates_out, strat_eq):
        peak = max(peak, s)
        drawdown.append({"date": d, "value": round(s / peak - 1, 4) if peak else 0.0})
    ics = [x["ic"] for x in ic_series]
    icir = round(float(np.mean(ics) / np.std(ics)), 4) if (len(ics) >= 2 and np.std(ics) > 0) else None
    ic_win = round(float(np.mean([i > 0 for i in ics])), 4) if ics else None
    return {"equity": equity, "drawdown": drawdown, "metrics": metrics, "as_of": end_date,
            "params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w},
            "ic": ic_series, "icir": icir, "ic_win_rate": ic_win, "caveats": []}


def run_backtest(db: Session, strategy_name: str = "rank_composite", params: dict | None = None,
                 start_date: str = "20200101", end_date: str | None = None,
                 cadence: str = "monthly", cost_single: float = 0.001,
                 weighting: str = "equal", opt_window: int = 60, max_w: float = 0.3) -> dict:
    params = {**DEFAULT_PARAMS, **(params or {})}
    end_date = end_date or _latest_trade_date(db)
    if cadence not in PERIODS_PER_YEAR:
        cadence = "monthly"

    # ML 分支:ml_ridge/ml_lightgbm 走独立 ML 路径(返回含 ic/icir/ic_win_rate)
    if strategy_name in ("ml_ridge", "ml_lightgbm"):
        return _run_ml_backtest(db, strategy_name, params, start_date, end_date, cadence,
                                cost_single, weighting, opt_window, max_w)

    daily_df, fund_df, const_df, idx_close = _load_panel(db, start_date, end_date)
    if daily_df.empty:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], PERIODS_PER_YEAR[cadence]),
                "as_of": end_date, "params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w}, "caveats": ["数据底座为空"]}

    # 按 code 预分组一次(O(1) 查表),避免每个 rb × code 全表 O(panel) 扫描(load-once 真秒级)
    daily_by_code = {code: g.sort_values("trade_date") for code, g in daily_df.groupby("code")}
    fund_by_code = {code: (g.sort_values("ann_date") if "ann_date" in g else g) for code, g in fund_df.groupby("code")}

    rb_dates = _rebalance_dates(daily_df["trade_date"].tolist(), cadence, start_date, end_date)
    if len(rb_dates) < 2:
        return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0], [1.0], PERIODS_PER_YEAR[cadence]),
                "as_of": end_date, "params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w}, "caveats": ["调仓日不足(<2)"]}

    idx_keys = sorted(idx_close)
    strat_eq, bench_eq, dates_out = [1.0], [1.0], [rb_dates[0]]
    prev_holdings: set = set()
    for i in range(len(rb_dates) - 1):
        rb, next_rb = rb_dates[i], rb_dates[i + 1]
        rows = _factor_rows_as_of(daily_by_code, fund_by_code, const_df, rb, int(params["window"]))
        cands = rank_composite_score(rows, params)
        holdings = [c.ts_code for c in cands]
        if not holdings:                      # 该期无候选 → 持有上一期(空则空仓)
            holdings = list(prev_holdings)
        if weighting == "equal" or len(holdings) < 2:
            port_ret = _period_return(daily_by_code, holdings, rb, next_rb)
        else:
            cov, ok = _holdings_cov(daily_by_code, holdings, rb, opt_window)
            if not ok:
                port_ret = _period_return(daily_by_code, holdings, rb, next_rb)   # 窗口不足降级 equal
            else:
                weights = compute_weights(weighting, cov, max_w)
                port_ret = sum(w * _stock_return(daily_by_code, holdings[i], rb, next_rb)
                               for i, w in enumerate(weights))
        bench_ret = _index_return(idx_close, idx_keys, rb, next_rb)   # 真沪深300指数
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
    return {"equity": equity, "drawdown": drawdown, "metrics": metrics,
            "as_of": end_date, "params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w},
            "caveats": caveats}

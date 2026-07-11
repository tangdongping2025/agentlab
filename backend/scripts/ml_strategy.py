"""候选池 pillar C ML 选股。Ridge + LightGBM。6 因子 load-once 面板 + 缓存。"""
from __future__ import annotations
import pandas as pd
from sqlalchemy.orm import Session

from backtest import _load_panel, _rebalance_dates, _universe_as_of  # 复用 pillar E
from screener import _latest_trade_date

FACTORS = ["momentum", "pe", "roe", "grossprofit_margin", "debt_to_assets", "total_mv"]
_PANEL_CACHE: dict = {"key": None, "df": None}


def clear_panel_cache():
    _PANEL_CACHE.update(key=None, df=None)


def _factor6_as_of(daily_by_code: dict, fund_by_code: dict, code: str, rb: str, window: int) -> dict | None:
    d = daily_by_code.get(code)
    if d is None:
        return None
    dsub = d[d["trade_date"] <= rb]
    if dsub.empty:
        return None
    adj = (dsub["close"] * dsub["adj_factor"]).tolist()
    start_idx = max(0, len(adj) - 1 - window)
    mom = (adj[-1] / adj[start_idx] - 1) if (len(adj) >= 2 and adj[start_idx]) else 0.0
    pe = float(dsub["pe_ttm"].iloc[-1]) if pd.notna(dsub["pe_ttm"].iloc[-1]) else float("nan")
    mv = float(dsub["total_mv"].iloc[-1]) if pd.notna(dsub["total_mv"].iloc[-1]) else float("nan")
    roe = gpm = da = float("nan")
    f = fund_by_code.get(code)
    if f is not None:
        fsub = f[f["ann_date"] <= rb]
        if not fsub.empty:
            last = fsub.iloc[-1]
            roe = float(last["roe"]) if pd.notna(last.get("roe")) else float("nan")
            gpm = float(last["grossprofit_margin"]) if pd.notna(last.get("grossprofit_margin")) else float("nan")
            da = float(last["debt_to_assets"]) if pd.notna(last.get("debt_to_assets")) else float("nan")
    return {"momentum": mom, "pe": pe, "roe": roe, "grossprofit_margin": gpm,
            "debt_to_assets": da, "total_mv": mv}


def _build_panel(db: Session, start: str, end: str) -> pd.DataFrame:
    """load-once:每个 (date, code) 的 6 因子(PIT as-of date)+ fwd_ret(下一期远期收益,月频)。"""
    daily_df, fund_df, const_df = _load_panel(db, start, end)
    if daily_df.empty:
        return pd.DataFrame(columns=["date", "code"] + FACTORS + ["fwd_ret"])
    daily_by_code = {c: g.sort_values("trade_date") for c, g in daily_df.groupby("code")}
    fund_by_code = {c: g.sort_values("ann_date") for c, g in fund_df.groupby("code")} if not fund_df.empty else {}
    rb_dates = _rebalance_dates(daily_df["trade_date"].tolist(), "monthly", start, end)
    window = 252
    rows = []
    for i, rb in enumerate(rb_dates):
        next_rb = rb_dates[i + 1] if i + 1 < len(rb_dates) else None
        for code in _universe_as_of(const_df, rb):
            f = _factor6_as_of(daily_by_code, fund_by_code, code, rb, window)
            if f is None:
                continue
            fwd = float("nan")
            if next_rb is not None:
                dperiod = daily_by_code[code][daily_by_code[code]["trade_date"].between(rb, next_rb)]
                if len(dperiod) >= 2:
                    adp = (dperiod["close"] * dperiod["adj_factor"]).tolist()
                    fwd = (adp[-1] / adp[0] - 1) if adp[0] else float("nan")
            rows.append({"date": rb, "code": code, **f, "fwd_ret": fwd})
    return pd.DataFrame(rows)


def _get_panel(db: Session, start: str, end: str) -> pd.DataFrame:
    key = (start, end)
    if _PANEL_CACHE["key"] != key:
        _PANEL_CACHE.update(key=key, df=_build_panel(db, start, end))
    return _PANEL_CACHE["df"]


def _prep_features(df: pd.DataFrame, method: str):
    """Ridge=横截面 rank(pct,逐 date);LightGBM=raw + 1%/99% winsorize(逐 date)。返回 np.ndarray。"""
    import numpy as np
    X = df[FACTORS].copy()
    dates = df["date"]
    if method == "ridge":
        X = X.groupby(dates.values).rank(pct=True)
        X = X.fillna(0.5)
    else:  # lightgbm
        def _wins(g):
            lo, hi = g.quantile(0.01), g.quantile(0.99)
            return g.clip(lo, hi) if (lo != hi) else g
        X = X.groupby(dates.values).transform(_wins)
        X = X.fillna(0.0)
    return X.values

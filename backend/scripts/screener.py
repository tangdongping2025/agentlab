"""候选池选股引擎。rank-composite(复用 python-learning day7)+ Strategy 抽象。"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import pandas as pd
import httpx

import models
from config import settings
from sqlalchemy.orm import Session

DEFAULT_PARAMS = {
    "w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4,
    "window": 252, "top_n": 30,
    "pe_filter": True, "roe_min": 12.0, "mom_top_pct": 40.0,
}

PRESETS = {
    "多因子平衡": {**DEFAULT_PARAMS},
    "价值+质量": {**DEFAULT_PARAMS, "w_pe": 0.45, "w_roe": 0.45, "w_mom": 0.10},
    "纯动量":    {**DEFAULT_PARAMS, "w_pe": 0.0, "w_roe": 0.0, "w_mom": 1.0},
    "价值+动量": {**DEFAULT_PARAMS, "w_pe": 0.40, "w_roe": 0.0, "w_mom": 0.60},
}


@dataclass
class Candidate:
    ts_code: str
    name: str
    industry: str
    score: float
    pe_rank: float
    roe_rank: float
    momentum_rank: float
    rank: int = 0


def rank_composite_score(rows: list[dict], params: dict[str, Any]) -> list[Candidate]:
    """横截面 rank-composite。rows=[{code,name,industry,pe,roe,momentum}]。
    返回按 score 降序、截断 top_n 的 Candidate 列表(秩/score 均 0-100,越高越好)。"""
    if not rows:
        return []
    p = {**DEFAULT_PARAMS, **params}
    df = pd.DataFrame(rows)

    mom_cut = df["momentum"].quantile(1 - p["mom_top_pct"] / 100.0)
    mask = df["roe"] >= p["roe_min"]
    if p.get("pe_filter", True):
        mask &= df["pe"] > 0
    mask &= df["momentum"] >= mom_cut
    surv = df[mask].copy()
    if surv.empty:
        return []

    surv["pe_rank"] = ((-surv["pe"]).rank(pct=True) * 100).fillna(0)
    surv["roe_rank"] = (surv["roe"].rank(pct=True) * 100).fillna(0)
    surv["mom_rank"] = (surv["momentum"].rank(pct=True) * 100).fillna(0)
    surv["composite"] = (p["w_pe"] * surv["pe_rank"]
                         + p["w_roe"] * surv["roe_rank"]
                         + p["w_mom"] * surv["mom_rank"])
    surv = surv.sort_values("composite", ascending=False).head(int(p["top_n"])).reset_index(drop=True)

    out = []
    for i, r in surv.iterrows():
        out.append(Candidate(
            ts_code=r["code"], name=r.get("name") or "", industry=r.get("industry") or "",
            score=round(float(r["composite"]), 2),
            pe_rank=round(float(r["pe_rank"]), 1),
            roe_rank=round(float(r["roe_rank"]), 1),
            momentum_rank=round(float(r["mom_rank"]), 1),
            rank=i + 1,
        ))
    return out


class Strategy(ABC):
    """选股策略接口。pillar C(MlStrategy)/D(优化器)以后插入。"""
    name: str
    @abstractmethod
    def run(self, db, as_of_date: str | None, params: dict) -> list[Candidate]: ...


# ---- DB 加载层 + Strategy 实现 ----

def _latest_trade_date(db: Session) -> str | None:
    row = db.query(models.StockDailyModel.trade_date).order_by(
        models.StockDailyModel.trade_date.desc()).first()
    return row[0] if row else None


def _universe(db: Session, index_code: str, as_of_date: str) -> list[str]:
    """PIT universe:≤ as_of_date 的最新成分快照。"""
    latest = db.query(models.IndexConstituentModel.trade_date).filter(
        models.IndexConstituentModel.index_code == index_code,
        models.IndexConstituentModel.trade_date <= as_of_date,
    ).order_by(models.IndexConstituentModel.trade_date.desc()).first()
    if not latest:
        return []
    rows = db.query(models.IndexConstituentModel.code).filter(
        models.IndexConstituentModel.index_code == index_code,
        models.IndexConstituentModel.trade_date == latest[0],
    ).all()
    return [r[0] for r in rows]


_NAMES_CACHE: dict = {"map": None, "ts": 0.0}
_NAMES_TTL = 86400.0
TUSHARE_ENDPOINT = "https://api.tushare.pro"


def _stock_names_map() -> dict:
    """{ts_code: {"name":..., "industry":...}} via one bulk stock_basic call. Cached 1d. {} on failure."""
    import time as _t
    now = _t.time()
    if _NAMES_CACHE["map"] is not None and now - _NAMES_CACHE["ts"] < _NAMES_TTL:
        return _NAMES_CACHE["map"]
    token = (settings.tushare_token or "").strip()
    if not token:
        return {}
    try:
        body = {"api_name": "stock_basic", "token": token,
                "params": {"list_status": "L"}, "fields": "ts_code,name,industry"}
        payload = httpx.post(TUSHARE_ENDPOINT, json=body, timeout=30).json()
        if payload.get("code") != 0:
            return {}
        data = payload.get("data") or {}
        fields = data.get("fields") or []; items = data.get("items") or []
        rows = [dict(zip(fields, r)) for r in items]
        m = {r["ts_code"]: {"name": r.get("name") or "", "industry": r.get("industry") or ""} for r in rows}
        _NAMES_CACHE["map"] = m; _NAMES_CACHE["ts"] = now
        return m
    except Exception:
        return {}


class RankCompositeStrategy(Strategy):
    name = "rank_composite"

    def _latest_roe(self, db: Session, code: str, as_of_date: str) -> float | None:
        row = db.query(models.FundamentalPitModel.roe).filter(
            models.FundamentalPitModel.code == code,
            models.FundamentalPitModel.ann_date <= as_of_date,
        ).order_by(models.FundamentalPitModel.ann_date.desc()).first()
        return row[0] if row else None

    def _momentum(self, db: Session, code: str, as_of_date: str, window: int) -> float:
        rows = db.query(models.StockDailyModel.close, models.StockDailyModel.adj_factor).filter(
            models.StockDailyModel.code == code,
            models.StockDailyModel.trade_date <= as_of_date,
        ).order_by(models.StockDailyModel.trade_date.asc()).all()
        if len(rows) < 2:
            return 0.0
        adj = [c * (f if f is not None else 1.0) for c, f in rows]
        start_idx = max(0, len(adj) - 1 - window)
        base = adj[start_idx]
        return (adj[-1] / base - 1) if base else 0.0

    def _latest_pe(self, db: Session, code: str, as_of_date: str) -> float | None:
        row = db.query(models.StockDailyModel.pe_ttm).filter(
            models.StockDailyModel.code == code,
            models.StockDailyModel.trade_date <= as_of_date,
        ).order_by(models.StockDailyModel.trade_date.desc()).first()
        return row[0] if row else None

    def run(self, db: Session, as_of_date: str | None, params: dict) -> list[Candidate]:
        p = {**DEFAULT_PARAMS, **params}
        as_of = as_of_date or _latest_trade_date(db)
        if not as_of:
            return []
        codes = _universe(db, "000300.SH", as_of)
        rows = []
        for code in codes:
            pe = self._latest_pe(db, code, as_of)
            roe = self._latest_roe(db, code, as_of)
            mom = self._momentum(db, code, as_of, int(p["window"]))
            # 取名/行业:候选池 v1 universe 无 name 列,留空(后续 router 用 stock_basic 补,见 Task 5)
            rows.append({"code": code, "name": "", "industry": "",
                         "pe": pe if pe is not None else float("nan"),
                         "roe": roe if roe is not None else float("nan"),
                         "momentum": mom})
        return rank_composite_score(rows, p)


from ml_strategy import MlRidgeStrategy, MlLightgbmStrategy  # noqa: E402
STRATEGIES: dict[str, Strategy] = {
    "rank_composite": RankCompositeStrategy(),
    "ml_ridge": MlRidgeStrategy(),
    "ml_lightgbm": MlLightgbmStrategy(),
}


def compute_candidates(db: Session, strategy_name: str, params: dict,
                       as_of_date: str | None = None) -> list[Candidate]:
    strat = STRATEGIES.get(strategy_name)
    if not strat:
        raise ValueError(f"未知策略: {strategy_name}")
    cands = strat.run(db, as_of_date, params)
    names = _stock_names_map()
    if names:
        for c in cands:
            info = names.get(c.ts_code)
            if info:
                c.name = info["name"]; c.industry = info["industry"]
    return cands

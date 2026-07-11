"""候选池选股引擎。rank-composite(复用 python-learning day7)+ Strategy 抽象。"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

DEFAULT_PARAMS = {
    "w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4,
    "window": 252, "top_n": 30,
    "pe_filter": True, "roe_min": 12.0, "mom_top_pct": 40.0,
}

PRESETS = {
    "多因子平衡": DEFAULT_PARAMS,
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

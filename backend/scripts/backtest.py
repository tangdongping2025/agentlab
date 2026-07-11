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

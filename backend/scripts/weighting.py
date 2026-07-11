"""候选池 pillar D 组合优化加权。scipy SLSQP。失败一律降级 equal,不抛。"""
from __future__ import annotations
import numpy as np
from scipy.optimize import minimize


def equal(n: int) -> list[float]:
    return [1.0 / n] * n if n else []


def _cap(w, max_w: float) -> list[float]:
    """归一 + 截断 max_w(迭代水位)。"""
    w = np.maximum(np.array(w, dtype=float), 0)
    if w.sum() <= 0:
        return equal(len(w))
    w = w / w.sum()
    for _ in range(5):
        over = w > max_w
        if not over.any():
            break
        excess = (w[over] - max_w).sum()
        w[over] = max_w
        # Redistribute excess to elements below max_w
        under = w < max_w
        if under.any() and w[under].sum() > 0:
            w[under] = w[under] + excess * (w[under] / w[under].sum())
        elif under.any():
            # All under weights are zero, distribute equally
            w[under] = w[under] + excess / len(w[under])
    # Final renormalization after capping
    if w.sum() > 0:
        w = w / w.sum()
    else:
        return equal(len(w))
    return [float(x) for x in w]


def min_variance(cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    """SLSQP 最小化 wᵀcovw;约束 Σw=1、0≤w≤max_w。失败→equal。"""
    n = len(cov)
    if n < 2:
        return equal(n)
    try:
        cov = np.array(cov, dtype=float)
        x0 = np.array(equal(n))
        cons = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(0.0, max_w)] * n
        res = minimize(lambda w: float(w @ cov @ w), x0, method="SLSQP",
                       constraints=cons, bounds=bounds, options={"maxiter": 200, "ftol": 1e-9})
        if not res.success or len(res.x) != n:
            return equal(n)
        w = res.x
        if not np.isfinite(w).all() or abs(w.sum() - 1.0) > 1e-3:
            return equal(n)
        return [max(0.0, float(wi)) for wi in w]
    except Exception:
        return equal(n)


def risk_parity(cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    """ERC(SLSQP);不收敛→对角逆波动率 w_i∝1/σ_i(归一+截断)。"""
    n = len(cov)
    if n < 2:
        return equal(n)
    try:
        cov = np.array(cov, dtype=float)
        sigma = np.sqrt(np.diag(cov))
        if np.any(sigma <= 0):
            return equal(n)
        inv_vol = 1.0 / sigma
        inv_vol = inv_vol / inv_vol.sum()
        def obj(w):
            rc = w * (cov @ w)
            return float(np.sum((rc - rc.mean()) ** 2))
        cons = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(0.0, max_w)] * n
        res = minimize(obj, np.array(inv_vol, dtype=float), method="SLSQP",
                       constraints=cons, bounds=bounds, options={"maxiter": 200, "ftol": 1e-9})
        if not res.success or not np.isfinite(res.x).all() or abs(res.x.sum() - 1.0) > 1e-3:
            return _cap(inv_vol, max_w)
        return [max(0.0, float(wi)) for wi in res.x]
    except Exception:
        return equal(n)          # 任何早期异常(sigma/cov)→ equal,不抛


def compute_weights(method: str, cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    n = len(cov)
    if n < 4 and method != "equal":
        return equal(n)
    if method == "min_var":
        return min_variance(cov, max_w)
    if method == "risk_parity":
        return risk_parity(cov, max_w)
    return equal(n)

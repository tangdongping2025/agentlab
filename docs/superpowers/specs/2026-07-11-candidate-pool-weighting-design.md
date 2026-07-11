# 候选池 pillar D·组合优化加权 · 设计

> 2026-07-11 | 设计文档 | 多策略投研平台 pillar D(spec 3)
> 前置:pillar A+B(候选池 screener)+ pillar E(回测引擎)已合入 main。

## 概述

回测(pillar E)现在**等权**持有 top-N。pillar D 加**组合优化加权**:min_var(最小方差)/ risk_parity(等风险贡献 ERC)作为等权之外的选项,scipy SLSQP 求解。只优化**策略组合**;基准(CSI300 等权)不变。

这是平台第 4 个 pillar(pillar C ML 选股随后)。复用 pillar E 的 `run_backtest` + 数据底座;加权是正交于选股的一层。

### 关键决策(brainstorming 已确认)

| 维度 | 决策 |
|---|---|
| 优化器 | **加 scipy**(真·约束优化,匹配 python-learning day9/15) |
| 加权方法 | equal(默认)/ min_var / risk_parity |
| min_var | SLSQP 最小化 `wᵀcovw`,约束 Σw=1、`0≤w≤max_w`(long-only) |
| risk_parity | ERC(SLSQP 等风险贡献);**不收敛 → 降级对角逆波动率 `w_i∝1/σ_i`** |
| 协方差窗 | 60 个交易日(`opt_window`,python-learning 默认) |
| 单股上限 | max_w=0.3;N<4 或不可行 → 降级 equal |
| 基准 | 保持 CSI300 等权(不优化) |
| 应用范围 | **仅回测**(候选池是选股清单,加权无意义) |
| 降级策略 | 任意优化失败(奇异 cov / N<4 / SLSLP 不收敛)→ equal,不抛异常 |

## 架构

新增 `backend/scripts/weighting.py`(纯优化模块,scipy)+ 改 `backend/scripts/backtest.py`(`run_backtest` 加权而非等权)+ router/工具/前端各传一个 `weighting` 参数。基准组合仍等权。

## 数据流(改动点)

```
POST /api/db/candidates/backtest {strategy, params, cadence, start, end, cost, weighting:"min_var"}  ← 新参数
 → run_backtest(db, ..., weighting="equal", opt_window=60, max_w=0.3):
   逐调仓日 rb:
     选 top_n(复用 rank_composite_score)→ holdings
     cov = holdings 在 (rb-opt_window, rb] 的收益协方差(用复权价)
     weights = weighting.compute_weights(weighting_method, cov, max_w)   ← equal/min_var/risk_parity
     组合收益 = Σ_i weights_i × 个股区间收益(rb→next_rb)   ← 替代等权均值
     失败 → weights = equal,继续(不崩)
   基准:universe 等权,同 pillar E(不优化)
 → 返回 {equity, drawdown, metrics, as_of, params, caveats}(结构同 E;params 含 weighting)
前端 BacktestPanel「加权」下拉(equal/min_var/risk_parity)→ 传 weighting
```

## 组件

### ① `backend/scripts/weighting.py`(新)

```python
import numpy as np
from scipy.optimize import minimize

def equal(n: int) -> list[float]:
    return [1.0 / n] * n if n else []

def min_variance(cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    """SLSQP 最小化 wᵀcovw;约束 Σw=1、0≤w≤max_w。失败→equal。"""
    n = len(cov)
    if n < 2:
        return equal(n)
    try:
        x0 = equal(n)
        cons = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(0.0, max_w)] * n
        res = minimize(lambda w: w @ cov @ w, x0, method="SLSQP",
                       constraints=cons, bounds=bounds, options={"maxiter": 200, "ftol": 1e-9})
        w = res.x if res.success and np.isfinite(w_sum := res.x.sum()) and abs(w_sum - 1) < 1e-3 else None
        if w is None:
            return equal(n)
        return [max(0.0, float(wi)) for wi in w]   # 数值清零
    except Exception:
        return equal(n)

def risk_parity(cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    """ERC(SLSQP 等风险贡献);不收敛→对角逆波动率 w_i∝1/σ_i(归一、截断 max_w)。"""
    n = len(cov)
    if n < 2:
        return equal(n)
    sigma = np.sqrt(np.diag(cov))
    if np.any(sigma <= 0):
        return equal(n)
    inv_vol = (1.0 / sigma)
    inv_vol = inv_vol / inv_vol.sum()
    try:
        # ERC:最小化 Σ_i (rc_i - rc_mean)²,rc_i = w_i (cov w)_i
        x0 = inv_vol
        cons = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        bounds = [(0.0, max_w)] * n
        def obj(w):
            rc = w * (cov @ w)
            target = rc.mean()
            return np.sum((rc - target) ** 2)
        res = minimize(obj, x0, method="SLSQP", constraints=cons, bounds=bounds,
                       options={"maxiter": 200, "ftol": 1e-9})
        if not res.success:
            return _cap(inv_vol, max_w)        # 降级逆波动率
        return [max(0.0, float(wi)) for wi in res.x]
    except Exception:
        return _cap(inv_vol, max_w)

def _cap(w: np.ndarray, max_w: float) -> list[float]:
    """归一 + 截断 max_w(迭代水位)。"""
    w = np.array(w, dtype=float)
    w = np.maximum(w, 0)
    if w.sum() <= 0:
        return equal(len(w))
    w = w / w.sum()
    for _ in range(5):
        over = w > max_w
        if not over.any():
            break
        excess = (w[over] - max_w).sum()
        w[over] = max_w
        w[~over] += excess * (w[~over] / w[~over].sum()) if w[~over].sum() else 0
    return [float(x) for x in w]

def compute_weights(method: str, cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    n = len(cov)
    if n < 4 and method != "equal":        # max_w=0.3 需 N≥4 才可行
        return equal(n)
    if method == "min_var":
        return min_variance(cov, max_w)
    if method == "risk_parity":
        return risk_parity(cov, max_w)
    return equal(n)                         # equal / 未知方法
```

> `compute_weights` 是 run_backtest 的唯一入口;异常/不可行一律降级 equal,绝不抛。

### ② `backend/scripts/backtest.py` 改 `run_backtest`

- 加参数 `weighting: str = "equal"`、`opt_window: int = 60`、`max_w: float = 0.3`。
- `run_backtest` 顶部 import:`from weighting import compute_weights`、`import numpy as np`(scripts 同目录,backtest 已在 sys.path)。
- 调仓日循环:选出 holdings 后,
  - 算 holdings 的协方差:`cov = _holdings_cov(daily_by_code, holdings, rb, opt_window)`(用每只 holding ≤rb 的 opt_window 日复权收益)。
  - **窗口不足兜底**:任一 holding 的 ≤rb 历史不足 opt_window 日 → 该调仓日整体降级 equal(不算 cov,不调 compute_weights),不抛。
  - `weights = compute_weights(weighting, cov, max_w)`(长度 == len(holdings))。
  - 组合收益 = `Σ_i weights_i × _stock_return(daily_by_code, holdings[i], rb, next_rb)`。
  - 基准不变(`_period_return` 等权 universe)。
- 返回的 `params` 里加 `weighting`/`opt_window`/`max_w`(快照自描述)。

### ③ Router + 工具 + 前端

- `backend/routers/candidates.py` `/candidates/backtest`:`payload.get("weighting", "equal")` 透传 run_backtest。
- `backend/runtime/tools/candidates.py` `RunBacktestTool`:加 `weighting` 入参,透传。
- `src/services/dbApi.ts` `runBacktest` payload 加 `weighting?`;`BacktestPanel.tsx` 加「加权」下拉(equal/min_var/risk_parity,默认 equal),data-testid `backtest-weighting-select`。
- `backend/requirements.txt` 加 `scipy`(Docker 镜像重建即带上)。

## 测试(TDD)

| 文件 | 关键用例 |
|---|---|
| `test_weighting.py`(新) | `equal` 均匀和=1;`min_variance` 满足 Σw=1+0≤w≤max_w+long-only+方差≤等权方差;`risk_parity` Σw=1+有界;`compute_weights` 未知方法→equal;N<4→equal;奇异 cov→equal(不抛);`_cap` 截断 max_w |
| `test_backtest.py` 加 | min_var 回测跑通(净值长度同 equal;末点有限不 NaN);weighting 透传到结果 params;基准仍等权(weighting 不影响基准);cov 不足窗口→降级 equal 不崩 |
| `test_candidates_router.py` 加 | `/candidates/backtest` body 带 weighting → run_backtest 收到(monkeypatch 捕获) |
| `test_candidates_tool.py` 加 | run_backtest 工具透传 weighting |
| 前端 `BacktestPanel.test.tsx` 加 | 加权下拉渲染 + 选中 min_var 透传 payload |

## 不包含(v1)

- 候选池逐行优化权重显示(选股清单加权无意义)
- 动态 max_w / 自定义约束
- Black-Litterman / 其他优化器
- equal vs min_var 叠图对比
- 组合优化的 IC(IC 是选股维度,非加权)
- 协方差正则化(shrinkage)—— v1 用样本协方差,降级兜底

## 关联

- 前置/复用:`docs/superpowers/specs/2026-07-11-candidate-pool-backtest-design.md`(pillar E run_backtest,本 pillar 改其加权);A+B 数据底座
- 优化参考:`python-learning/notebooks/day9_portfolio_opt.ipynb` + `day15_ivol_portfolio.ipynb`(min_variance/risk_parity via scipy SLSQP, max_w=0.3, opt_window=60)
- 新依赖:scipy(`backend/requirements.txt`)

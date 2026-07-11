# 候选池 pillar D(组合优化加权)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 回测(pillar E)加组合优化加权选项——equal(默认)/ min_var / risk_parity(scipy SLSQP),替代纯等权。基准不变。

**Architecture:** 新增 `backend/scripts/weighting.py`(纯 scipy 优化模块,compute_weights 统一入口 + equal 兜底)+ 改 `backtest.py run_backtest`(加权参数 + _holdings_cov/_stock_return helpers + 加权组合收益 + 窗口不足/失败降级 equal)+ router/工具/前端透传 `weighting`。新依赖 scipy。

**Tech Stack:** Python + scipy(SLSQP)+ numpy + pandas(复用 pillar E backtest);前端 React + Recharts(复用)。

**Spec:** `docs/superpowers/specs/2026-07-11-candidate-pool-weighting-design.md`

## Global Constraints

- 复用 pillar E:`backend/scripts/backtest.py` 的 `run_backtest`(用 `daily_by_code` 预分组)、`_period_return`、`compute_metrics`;6 张表;router `_resolve_params`。
- 加权只作用于**策略组合**;基准(CSI300 等权)不变。
- `compute_weights` 任意失败(奇异 cov / N<4 / SLSQP 不收敛 / 窗口不足)→ equal,绝不抛。
- min_var:long-only,Σw=1,0≤w≤max_w;risk_parity:ERC(SLSQP)不收敛→逆波动率。
- 命令:后端 `cd backend && python -m pytest tests/<file> -v`(无 .venv,全局 python3.12);前端 `npm run test:run -- <pattern>` + `npm run typecheck`。
- 新依赖:`backend/requirements.txt` 加 `scipy`(Docker 重建带上)。
- 镜像现有 BacktestPanel/CandidatePanel 暖色风。

## File Structure

**新建:**
- `backend/scripts/weighting.py` — equal/min_variance/risk_parity/_cap/compute_weights
- `backend/tests/test_weighting.py`

**修改:**
- `backend/scripts/backtest.py` — run_backtest 加 weighting/opt_window/max_w + _holdings_cov/_stock_return + 加权 port_ret
- `backend/routers/candidates.py` — /candidates/backtest 透传 weighting
- `backend/runtime/tools/candidates.py` — RunBacktestTool 透传 weighting
- `src/services/dbApi.ts` — runBacktest payload 加 weighting
- `src/components/agentRuntime/BacktestPanel.tsx` — 加权下拉
- `backend/requirements.txt` — +scipy
- `项目执行跟踪矩阵.md` — +RQ-102

---

## Task 1: weighting.py 纯优化模块

**Files:** Create `backend/scripts/weighting.py` + `backend/tests/test_weighting.py`
**Interfaces:** Produces `equal(n)`, `min_variance(cov, max_w=0.3)`, `risk_parity(cov, max_w=0.3)`, `compute_weights(method, cov, max_w=0.3)`, `_cap(w, max_w)`。

- [ ] **Step 1: 写失败测试** `backend/tests/test_weighting.py`

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import numpy as np


def test_equal():
    from weighting import equal
    w = equal(4)
    assert len(w) == 4 and abs(sum(w) - 1.0) < 1e-9 and all(x == 0.25 for x in w)


def test_min_variance_respects_constraints_and_beats_equal():
    from weighting import min_variance, equal
    # 3 只? N<4 → equal(本测试用 N=5 满足 max_w=0.3 可行:5×0.3=1.5≥1)
    cov = np.array([[0.04, 0.01, 0.0, 0.0, 0.0],
                    [0.01, 0.09, 0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.01, 0.0, 0.0],
                    [0.0, 0.0, 0.0, 0.02, 0.0],
                    [0.0, 0.0, 0.0, 0.0, 0.05]])
    w = min_variance(cov, max_w=0.3)
    assert abs(sum(w) - 1.0) < 1e-6                      # Σw=1
    assert all(-1e-9 <= x <= 0.3 + 1e-6 for x in w)      # 0≤w≤max_w
    # 最小方差应 ≤ 等权方差
    ew = equal(5)
    assert w @ cov @ w <= ew @ cov @ ew @ np.array(ew)[:, None] @ np.array([ew]) + 1e-9 or \
           w @ cov @ w <= np.array(equal(5)) @ cov @ np.array(equal(5))


def test_risk_parity_sum_one_bounded():
    from weighting import risk_parity
    cov = np.diag([0.04, 0.09, 0.01, 0.02, 0.05])        # 对角(相关=0,逆波动率即 ERC)
    w = risk_parity(cov, max_w=0.3)
    assert abs(sum(w) - 1.0) < 1e-6 and all(0 <= x <= 0.3 + 1e-6 for x in w)


def test_compute_weights_unknown_method_falls_back_equal():
    from weighting import compute_weights, equal
    cov = np.eye(5) * 0.04
    w = compute_weights("nonsense", cov, max_w=0.3)
    assert w == equal(5)


def test_compute_weights_n_less_than_4_falls_back_equal():
    from weighting import compute_weights, equal
    cov = np.eye(3) * 0.04
    assert compute_weights("min_var", cov, max_w=0.3) == equal(3)
    assert compute_weights("risk_parity", cov, max_w=0.3) == equal(3)


def test_min_variance_singular_cov_falls_back_equal_no_raise():
    from weighting import min_variance, equal
    cov = np.ones((5, 5)) * 0.04      # 全同(秩1,奇异)
    w = min_variance(cov, max_w=0.3)
    assert w == equal(5)              # 不抛,降级


def test_cap_truncates_max_w():
    from weighting import _cap
    w = _cap(np.array([0.5, 0.5, 0.0, 0.0, 0.0]), max_w=0.3)
    assert all(x <= 0.3 + 1e-6 for x in w) and abs(sum(w) - 1.0) < 1e-6
```

> test_min_variance 的方差断言写得啰嗦——简化意图:`assert np.array(w) @ cov @ np.array(w) <= np.array(equal(5)) @ cov @ np.array(equal(5)) + 1e-9`。实现者用这个简化版。

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_weighting.py -v` → FAIL(ModuleNotFoundError)。

- [ ] **Step 3: 实现** `backend/scripts/weighting.py`(spec §① 的完整代码,逐字):

```python
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
        rest = w[~over]
        if rest.sum() > 0:
            w[~over] = rest + excess * (rest / rest.sum())
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
    cov = np.array(cov, dtype=float)
    sigma = np.sqrt(np.diag(cov))
    if np.any(sigma <= 0):
        return equal(n)
    inv_vol = 1.0 / sigma
    inv_vol = inv_vol / inv_vol.sum()
    try:
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
        return _cap(inv_vol, max_w)


def compute_weights(method: str, cov: np.ndarray, max_w: float = 0.3) -> list[float]:
    n = len(cov)
    if n < 4 and method != "equal":
        return equal(n)
    if method == "min_var":
        return min_variance(cov, max_w)
    if method == "risk_parity":
        return risk_parity(cov, max_w)
    return equal(n)
```

- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_weighting.py -v` → PASS(7)。
- [ ] **Step 5: Commit** — `git add backend/scripts/weighting.py backend/tests/test_weighting.py && git commit -m "feat(weighting): min_var/risk_parity(scipy SLSQP)+ equal 兜底 (RQ-D1)"`

---

## Task 2: backtest.py 加权集成

**Files:** Modify `backend/scripts/backtest.py`;test `backend/tests/test_backtest.py`
**Interfaces:** Consumes `weighting.compute_weights`;改 `run_backtest(db, strategy_name, params, start_date, end_date, cadence, cost_single, weighting="equal", opt_window=60, max_w=0.3)`

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_backtest.py`,复用现有 `db`/`_seed_daily`/`_seed_constituent`)

```python
def test_run_backtest_min_var_runs_and_returns_weighting_in_params(db):
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331", "20200430", "20200531", "20200630"]
    for code in ["A", "B", "C", "D", "E"]:                       # 5 只满足 max_w=0.3 可行
        _seed_daily(db, code, [(d, 10.0 + i + hash(code) % 3) for i, d in enumerate(dates)], pe=10.0)
    _seed_constituent(db, "20200131", ["A", "B", "C", "D", "E"])
    res = run_backtest(db, params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                   "top_n": 5, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200630", cadence="monthly",
                       cost_single=0.0, weighting="min_var", opt_window=3, max_w=0.3)
    assert len(res["equity"]) == len(dates)
    assert res["params"]["weighting"] == "min_var"
    assert all(np.isfinite(e["strategy"]) for e in res["equity"])   # 无 NaN


def test_run_backtest_weighting_default_equal_matches_pillar_e(db):
    from backtest import run_backtest
    dates = ["20200131", "20200228", "20200331"]
    for code in ["A", "B"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B"])
    res = run_backtest(db, start_date="20200101", end_date="20200331", cost_single=0.0)  # weighting 默认 equal
    assert res["params"]["weighting"] == "equal"


def test_run_backtest_insufficient_window_falls_back_equal_no_raise(db):
    from backtest import run_backtest
    dates = ["20200131", "20200228"]                            # 仅 2 日,opt_window=60 不足
    for code in ["A", "B", "C", "D", "E"]:
        _seed_daily(db, code, [(d, 10.0 + i) for i, d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A", "B", "C", "D", "E"])
    res = run_backtest(db, params={"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                   "top_n": 5, "pe_filter": True, "roe_min": 0, "mom_top_pct": 100},
                       start_date="20200101", end_date="20200228", weighting="min_var", opt_window=60)
    assert len(res["equity"]) == 2                              # 窗口不足降级 equal,不崩
```

> test 顶部已 `import numpy as np`(若没有,加 `import numpy as np`)。`hash(code) % 3` 给 5 只略不同价格以避免完全同序列导致 cov 奇异——可选,实现者可换固定偏移 `[0,1,2,0,1]`。

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_backtest.py -v` → FAIL(weighting 参数不存在)。

- [ ] **Step 3: 实现** 改 `backend/scripts/backtest.py`:
  顶部 import 区加:
  ```python
  import numpy as np
  from weighting import compute_weights
  ```
  新增两个 helper(放在 `_period_return` 之后):
  ```python
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
  ```
  改 `run_backtest` 签名加 3 参数:
  ```python
  def run_backtest(db, strategy_name="rank_composite", params=None, start_date="20200101",
                   end_date=None, cadence="monthly", cost_single=0.001,
                   weighting="equal", opt_window=60, max_w=0.3):
  ```
  在循环里,把现有的 `port_ret = _period_return(daily_by_code, holdings, rb, next_rb)`(line ~193)替换为:
  ```python
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
        bench_ret = _period_return(daily_by_code, universe, rb, next_rb)   # 基准不变
  ```
  (删除原 `bench_ret = ...` 行,用上面这行;保留 cost/eq append 不变。)
  在返回的 `params` 里加 weighting 信息——找到构造返回 dict 的地方,把 `params` 改为 `{**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w}`(或在调用处包一层)。具体:run_backtest 末尾 `return {..., "params": params, ...}` → 改 `"params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w}`。

- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_backtest.py -v` → PASS(pillar E 14 + 新 3 = 17)。
- [ ] **Step 5: Commit** — `git add backend/scripts/backtest.py backend/tests/test_backtest.py && git commit -m "feat(weighting): run_backtest 加权集成(min_var/risk_parity,窗口不足降级) (RQ-D2)"`

---

## Task 3: router /candidates/backtest 透传 weighting

**Files:** Modify `backend/routers/candidates.py`;test `backend/tests/test_candidates_router.py`
**Interfaces:** `/candidates/backtest` body 加 `weighting` → run_backtest。

- [ ] **Step 1: 写失败测试**(追加到 test_candidates_router.py,复用 client fixture)

```python
def test_backtest_weighting_passes_through(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20200131", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    captured = {}
    def fake(db, strategy_name=None, params=None, **k):
        captured["weighting"] = k.get("weighting"); captured["opt_window"] = k.get("opt_window")
        return {"equity": [], "drawdown": [], "metrics": {}, "as_of": None, "params": params, "caveats": []}
    monkeypatch.setattr(cands, "run_backtest", fake)
    r = client.post("/api/db/candidates/backtest",
                    json={"strategy": "rank_composite", "weighting": "min_var", "opt_window": 30})
    assert r.status_code == 200
    assert captured["weighting"] == "min_var" and captured["opt_window"] == 30
```

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_candidates_router.py::test_backtest_weighting_passes_through -v` → FAIL(weighting 没透传)。
- [ ] **Step 3: 实现** 在 `backend/routers/candidates.py` 的 `/candidates/backtest` 端点,把 `run_backtest(...)` 调用补 weighting/opt_window/max_w:
  ```python
    return run_backtest(db, strategy, params,
                        start_date=payload.get("start", "20200101"),
                        end_date=payload.get("end"),
                        cadence=payload.get("cadence", "monthly"),
                        cost_single=payload.get("cost", 0.001),
                        weighting=payload.get("weighting", "equal"),
                        opt_window=payload.get("opt_window", 60),
                        max_w=payload.get("max_w", 0.3))
  ```
- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_candidates_router.py -v` → PASS。
- [ ] **Step 5: Commit** — `git add backend/routers/candidates.py backend/tests/test_candidates_router.py && git commit -m "feat(weighting): /candidates/backtest 透传 weighting (RQ-D3)"`

---

## Task 4: RunBacktestTool 透传 weighting

**Files:** Modify `backend/runtime/tools/candidates.py`;test `backend/tests/test_candidates_tool.py`

- [ ] **Step 1: 写失败测试**(追加到 test_candidates_tool.py)

```python
@pytest.mark.asyncio
async def test_run_backtest_tool_passes_weighting(patch_session, monkeypatch):
    from runtime.tools import candidates as ct
    captured = {}
    def fake(db, strategy_name=None, params=None, **k):
        captured["weighting"] = k.get("weighting"); return {"metrics": {}, "caveats": [], "as_of": None}
    monkeypatch.setattr(ct, "run_backtest", fake)
    await ct.RunBacktestTool().execute(label="多因子平衡", weighting="risk_parity")
    assert captured["weighting"] == "risk_parity"
```

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_candidates_tool.py::test_run_backtest_tool_passes_weighting -v` → FAIL。
- [ ] **Step 3: 实现** 在 `backend/runtime/tools/candidates.py` `RunBacktestTool.execute` 的 `run_backtest(db, ...)` 调用补 `weighting=params.get("weighting", "equal")`;input_schema 加 `"weighting": {"type": "string", "description": "equal(默认)/min_var/risk_parity"}`。
- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_candidates_tool.py -v` → PASS。
- [ ] **Step 5: Commit** — `git add backend/runtime/tools/candidates.py backend/tests/test_candidates_tool.py && git commit -m "feat(weighting): run_backtest 工具透传 weighting (RQ-D4)"`

---

## Task 5: 前端 BacktestPanel 加权下拉

**Files:** Modify `src/services/dbApi.ts` + `src/components/agentRuntime/BacktestPanel.tsx`;test `BacktestPanel.test.tsx`

- [ ] **Step 1: 写失败测试**(追加到 BacktestPanel.test.tsx,复用其 vi.mock recharts + dbApi mock)

```tsx
  it('weighting select passes through to runBacktest', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.runBacktest as any).mockResolvedValue({ equity: [], drawdown: [], metrics: {}, caveats: [] });
    const { container } = render(<BacktestPanel />);
    await waitFor(() => expect(screen.getByTestId('backtest-weighting-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('backtest-weighting-select'), { target: { value: 'min_var' } });
    fireEvent.click(screen.getByTestId('backtest-run-btn'));
    await waitFor(() => {
      const call = (dbApi.runBacktest as any).mock.calls[0][0];
      expect(call.weighting).toBe('min_var');
    });
  });
```

- [ ] **Step 2: 跑确认失败** — `npm run test:run -- BacktestPanel` → FAIL(no backtest-weighting-select)。
- [ ] **Step 3: 实现**
  - `dbApi.ts`:`runBacktest` payload 类型加 `weighting?: 'equal' | 'min_var' | 'risk_parity'`(在 payload 对象类型里)。
  - `BacktestPanel.tsx`:加 state `const [weighting, setWeighting] = useState('equal');`;控制栏加下拉:
    ```tsx
    <span style={{ fontSize: 12, color: '#6b6155' }}>加权</span>
    <select data-testid="backtest-weighting-select" value={weighting} onChange={(e) => setWeighting(e.target.value)}
      style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
      <option value="equal">等权</option><option value="min_var">最小方差</option><option value="risk_parity">风险平价</option>
    </select>
    ```
    `handleRun` 的 payload 加 `weighting`(在 `const payload: any = { strategy, label, cadence, start, weighting };`)。
- [ ] **Step 4: 跑确认通过** — `npm run test:run -- BacktestPanel && npm run typecheck` → PASS + clean。
- [ ] **Step 5: Commit** — `git add src/services/dbApi.ts src/components/agentRuntime/BacktestPanel.tsx src/components/agentRuntime/BacktestPanel.test.tsx && git commit -m "feat(weighting): BacktestPanel 加权下拉(equal/min_var/risk_parity) (RQ-D5)"`

---

## Task 6: scipy 依赖 + 跟踪矩阵 + 全量验证

**Files:** Modify `backend/requirements.txt` + `项目执行跟踪矩阵.md`

- [ ] **Step 1: 加 scipy** 在 `backend/requirements.txt` 末尾加 `scipy>=1.11.0`(版本下限,与 numpy 2.x 兼容)。本地 `pip install scipy`(若未装)。
- [ ] **Step 2: 全量后端测试** — `cd backend && python -m pytest tests/test_weighting.py tests/test_backtest.py tests/test_candidate_model.py tests/test_screener.py tests/test_candidates_router.py tests/test_candidates_tool.py tests/test_invest_agent.py -v` → 全 PASS。
- [ ] **Step 3: 前端** — `npm run typecheck && npm run test:run -- BacktestPanel CandidatePanel TabsWorkspace` → PASS。
- [ ] **Step 4: 跟踪矩阵** 加 RQ-102(pillar D 加权)条目,沿用格式。
- [ ] **Step 5: Commit** — `git add backend/requirements.txt 项目执行跟踪矩阵.md && git commit -m "feat(weighting): scipy 依赖 + 跟踪矩阵 RQ-102 + 验证 (RQ-D6)"`

---

## Self-Review

- **Spec 覆盖**:weighting.py 三方法(Task1)✓;backtest 加权集成(Task2)✓;router/工具/前端 weighting 透传(Task3/4/5)✓;scipy 依赖(Task6)✓;基准不变(Task2 bench_ret 等权)✓;降级兜底(Task1 compute_weights + Task2 窗口不足)✓;ERC 不收敛→逆波动率(Task1 risk_parity)✓;仅回测(候选池不动)✓。
- **占位符**:无 TBD;Task1 test_min_variance 方差断言给了简化版注;Task2 `hash(code)` 注明可换固定偏移。
- **类型一致**:`compute_weights(method, cov, max_w)` Task1 定义,Task2 调用一致;`run_backtest(..., weighting, opt_window, max_w)` Task2 定义,Task3/4 透传一致;`weighting` 值域 equal/min_var/risk_parity 全 plan 一致。
- **风险**:① scipy 需 `pip install`(Task6);② `_holdings_cov` 用 `np.cov`(样本协方差,无 shrinkage——v1 接受,降级兜底);③ risk_parity ERC 在病态 cov 上可能 SLSQP 不收敛→已降级逆波动率。

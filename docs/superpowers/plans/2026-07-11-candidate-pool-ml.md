# 候选池 pillar C(ML walk-forward + IC)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Checkbox (`- [ ]`) tracking.

**Goal:** ML 选股(Ridge + LightGBM)接入策略注册表 + 候选池(按需)+ 回测(walk-forward load-once)+ IC/ICIR/胜率。6 因子(现有底座)。

**Architecture:** 新增 `backend/scripts/ml_strategy.py`(load-once 因子+标签面板 + 缓存 + MlStrategy[Ridge/LightGBM] + predict_all);`run_backtest` 加 ML 分支(`_run_ml_backtest`,MlStrategy.run 每 rb + predict_all 算 IC);screener 注册 ml_*;router 放开 strategy 白名单;前端 ML 选项 + IC 面板。新依赖 sklearn + lightgbm。

**Tech Stack:** Python + scikit-learn(Ridge)+ lightgbm + pandas/scipy(已有);前端 React + Recharts。

**Spec:** `docs/superpowers/specs/2026-07-11-candidate-pool-ml-design.md`

## Global Constraints

- 复用:A+B `Strategy`/`Candidate`/`DEFAULT_PARAMS`/`compute_candidates`;pillar E `run_backtest`/`_load_panel`/`_rebalance_dates`/`_universe_as_of`;pillar D `weighting.compute_weights`;6 张表。
- **PIT 命脉**:面板因子 as-of date(`trade_date≤date`/`ann_date≤date`);训练只用 `date≤as_of` 且 `fwd_ret.notna()`(未来 label 不入训练)。
- IC **仅 ML 回测**返回;rank-composite 回测不变(无 ic 字段,pillar E/D 不回归)。
- 面板模块级缓存 + `clear_panel_cache()`(测试);ML 回测分支不影响 rank-composite 路径。
- 新依赖:`backend/requirements.txt` + `scikit-learn>=1.3` + `lightgbm>=4.0`(实现前 `pip install`)。
- 命令:后端 `cd backend && python -m pytest tests/<file> -v`(无 .venv,全局 python3.12);前端 `npm run test:run -- <pattern>` + `npm run typecheck`。
- ML Candidate 的 pe_rank/roe_rank/momentum_rank 填 0(无意义);前端 ML 时隐藏三秩列。

## File Structure

**新建:** `backend/scripts/ml_strategy.py` + `backend/tests/test_ml_strategy.py`
**修改:**
- `backend/scripts/backtest.py` — run_backtest 加 ML 分支(`_run_ml_backtest` + IC)
- `backend/scripts/screener.py` — STRATEGIES 注册 ml_ridge/ml_lightgbm
- `backend/routers/candidates.py` — strategy 白名单{rank_composite, ml_ridge, ml_lightgbm}
- `backend/runtime/tools/candidates.py` — 工具 strategy 透传
- `src/services/dbApi.ts` — BacktestResult 加 ic?/icir?/ic_win_rate?
- `src/components/agentRuntime/CandidatePanel.tsx` — ML 选项 + 隐藏三秩
- `src/components/agentRuntime/BacktestPanel.tsx` — IC 面板
- `backend/agents/invest_agent.py` — prompt ML 段
- `backend/requirements.txt` — +scikit-learn +lightgbm
- `项目执行跟踪矩阵.md` — +RQ-103

---

## Task 1: ml_strategy.py 面板 + 特征 + 缓存

**Files:** Create `backend/scripts/ml_strategy.py`(本 Task 只写面板/特征/缓存) + `backend/tests/test_ml_strategy.py`
**Interfaces:** Produces `FACTORS`, `_build_panel(db,start,end)`, `_get_panel(db,start,end)`, `clear_panel_cache()`, `_prep_features(df, method)`。

- [ ] **Step 1: 写失败测试** `backend/tests/test_ml_strategy.py`

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__, models.IndexConstituentModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


def _seed(db, code, offs, fund=None):
    for i, (td, c) in enumerate([("20200131",10),("20200228",11),("20200331",12),("20200430",13),("20200531",14),("20200630",15),("20200731",16),("20200831",17),("20200930",18),("20201031",19),("20201130",20),("20201231",21),("20210131",22)]):
        if i < len(offs):
            db.add(models.StockDailyModel(code=code, trade_date=td, close=c+offs[i], adj_factor=1.0, pe_ttm=10.0+offs[i], total_mv=1e5+offs[i]*1e3))
    if fund:
        db.add(models.FundamentalPitModel(code=code, end_date="20191231", ann_date="20200101", roe=fund.get("roe",15), grossprofit_margin=fund.get("gpm",30), debt_to_assets=fund.get("da",40)))
    db.commit()


def test_build_panel_has_factors_and_fwd_ret(db):
    from ml_strategy import _build_panel, clear_panel_cache
    clear_panel_cache()
    for code, off in zip(["A","B","C"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1],[2,0,1,2,0,1,2,0,1,2,0,1,2]]):
        _seed(db, code, off, {"roe": 15+int(code[-1])*5})
    for code in ["A","B","C"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=1/3))
    db.commit()
    panel = _build_panel(db, "20200101", "20210131")
    assert set(["date","code","momentum","pe","roe","grossprofit_margin","debt_to_assets","total_mv","fwd_ret"]).issubset(panel.columns)
    assert panel["code"].nunique() == 3
    # 最新一期无下期 → fwd_ret NaN;早期有 fwd_ret
    last_date = panel["date"].max()
    assert panel[panel.date==last_date]["fwd_ret"].isna().all()
    assert panel[panel.date < last_date]["fwd_ret"].notna().any()


def test_build_panel_pit_future_fundamental_invisible(db):
    from ml_strategy import _build_panel, clear_panel_cache
    clear_panel_cache()
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    # 一份 ann_date=20210101 的财报(在多数 2020 调仓日之后)→ 不应进入那些日的因子
    db.add(models.FundamentalPitModel(code="A", end_date="20201231", ann_date="20210101", roe=99.0, grossprofit_margin=99, debt_to_assets=99))
    db.commit()
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    panel = _build_panel(db, "20200101", "20201231")
    a2020 = panel[(panel.code=="A") & (panel.date<"20210101")]
    # 2020 的 A 行 roe 不应是 99(那份 ann_date 2021 之后)
    assert (a2020["roe"] != 99.0).all()


def test_prep_features_rank_vs_winsorize():
    from ml_strategy import _prep_features
    import pandas as pd
    df = pd.DataFrame({"momentum":[0.1,0.2,0.3],"pe":[10,20,30],"roe":[5,10,15],
                       "grossprofit_margin":[30,40,50],"debt_to_assets":[40,30,20],"total_mv":[1,2,3],
                       "date":["20200131"]*3})
    Xr = _prep_features(df.copy(), "ridge")
    Xw = _prep_features(df.copy(), "lightgbm")
    assert Xr.shape == (3,6) and Xw.shape == (3,6)
    # ridge: rank pct → 单调;pe 列排名应与原 pe 反向相关(rank pct of pe: 10→0.33? 实际 rank(pct) 升序)
    # winsorize:clip 不改变中间值形状,只裁两端


def test_panel_cache(db):
    from ml_strategy import _get_panel, clear_panel_cache, _PANEL_CACHE
    clear_panel_cache()
    assert _PANEL_CACHE["df"] is None
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    p1 = _get_panel(db, "20200101", "20210131")
    assert _PANEL_CACHE["df"] is not None
    p2 = _get_panel(db, "20200101", "20210131")  # 缓存命中
    assert p1 is p2
    clear_panel_cache()
    assert _PANEL_CACHE["df"] is None
```

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_ml_strategy.py -v` → FAIL(ModuleNotFoundError)。
- [ ] **Step 3: 实现** `backend/scripts/ml_strategy.py`(本 Task 只写面板/特征/缓存):

```python
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
```

> `_load_panel`/`_rebalance_dates`/`_universe_as_of` 已在 backtest.py(Task E);`_latest_trade_date` 在 screener.py(A+B)。ml_strategy.py 顶部从它们 import。

- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_ml_strategy.py -v` → PASS(4)。
- [ ] **Step 5: Commit** — `git add backend/scripts/ml_strategy.py backend/tests/test_ml_strategy.py && git commit -m "feat(ml): 因子+标签面板 load-once + 特征(rank/winsorize) + 缓存 (RQ-C1)"`

---

## Task 2: MlStrategy(Ridge + LightGBM)+ 注册

**Files:** Modify `backend/scripts/ml_strategy.py`(追加 MlStrategy + predict_all)+ `backend/scripts/screener.py`(STRATEGIES 注册);test `backend/tests/test_ml_strategy.py`
**Interfaces:** Produces `MlRidgeStrategy`/`MlLightgbmStrategy`(Strategy.run + predict_all);STRATEGIES 加 ml_ridge/ml_lightgbm。
**Consumes:** Task 1 面板;sklearn.Ridge + lightgbm(先 `pip install scikit-learn lightgbm`)。

- [ ] **Step 1: 写失败测试**(追加到 test_ml_strategy.py)

```python
def test_ml_ridge_run_returns_topn(db):
    from ml_strategy import clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    for code, off in zip(["A","B","C","D","E"], [[i%3+k for i in range(13)] for k in range(5)]):
        _seed(db, code, off, {"roe": 10+k*5 for k in [0,1,2,3,4][["A","B","C","D","E"].index(code)]})
    for code in ["A","B","C","D","E"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.2))
    db.commit()
    cands = compute_candidates(db, "ml_ridge", {"top_n": 3, "ml_start": "20200101", "ml_end": "20210131"}, as_of_date="20201231")
    assert len(cands) <= 3 and len(cands) >= 1
    assert all(c.rank >= 1 for c in cands)


def test_ml_lightgbm_predict_all_covers_universe(db):
    from ml_strategy import clear_panel_cache, MlLightgbmStrategy
    clear_panel_cache()
    for code, off in zip(["A","B","C","D","E"], [[i%3+k for i in range(13)] for k in range(5)]):
        _seed(db, code, off, {"roe": 10+k*5})
    for code in ["A","B","C","D","E"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.2))
    db.commit()
    scores = MlLightgbmStrategy().predict_all(db, "20201231", {"ml_start": "20200101", "ml_end": "20210131"})
    assert set(scores) <= {"A","B","C","D","E"} and len(scores) >= 1


def test_ml_min_train_insufficient_returns_empty(db):
    from ml_strategy import clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    for code, off in zip(["A","B"], [[0,1,2,0,1,2,0,1,2,0,1,2,0],[1,2,0,1,2,0,1,2,0,1,2,0,1]]):
        _seed(db, code, off)
    for code in ["A","B"]:
        db.add(models.IndexConstituentModel(index_code="000300.SH", trade_date="20200131", code=code, weight=0.5))
    db.commit()
    # min_train=12,只有少量调仓日 → []
    cands = compute_candidates(db, "ml_ridge", {"top_n": 3, "ml_start": "20200101", "ml_end": "20200331"}, as_of_date="20200228")
    assert cands == []
```

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_ml_strategy.py -v` → FAIL(无 MlStrategy)。
- [ ] **Step 3: 实现**
  a) `pip install scikit-learn lightgbm`(若未装)。
  b) ml_strategy.py 顶部加 `from sklearn.linear_model import Ridge` + `import lightgbm as lgb` + `from screener import Strategy, Candidate, DEFAULT_PARAMS`;追加:
  ```python
  LGB_PARAMS = dict(num_leaves=31, learning_rate=0.05, n_estimators=100, min_data_in_leaf=50,
                    verbose=-1, n_jobs=1, random_state=42)

  class MlStrategy(Strategy):
      name = "ml"; method = "ridge"; min_train = 12
      def _fit(self, X, y):
          if self.method == "ridge":
              return Ridge(alpha=1.0).fit(X, y)
          return lgb.LGBMRegressor(**LGB_PARAMS).fit(X, y)
      def _train_panel(self, db, as_of, params):
          end = params.get("ml_end") or _latest_trade_date(db)
          panel = _get_panel(db, params.get("ml_start", "20200101"), end)
          if panel.empty:
              return None, None
          train = panel[(panel["date"] <= as_of) & panel["fwd_ret"].notna()].dropna(subset=FACTORS)
          if train["date"].nunique() < self.min_train:
              return None, None
          model = self._fit(_prep_features(train, self.method), train["fwd_ret"].values)
          cur = panel[panel["date"] == as_of].dropna(subset=FACTORS)
          return model, cur
      def run(self, db, as_of, params):
          model, cur = self._train_panel(db, as_of, params)
          if model is None or cur is None or cur.empty:
              return []
          scores = model.predict(_prep_features(cur, self.method))
          cur = cur.assign(_score=scores).sort_values("_score", ascending=False).head(int(params.get("top_n", 30)))
          out = []
          for i, (idx, r) in enumerate(cur.iterrows()):
              out.append(Candidate(ts_code=r["code"], name="", industry="",
                                   score=round(float(r["_score"]), 4),
                                   pe_rank=0.0, roe_rank=0.0, momentum_rank=0.0, rank=i + 1))
          return out
      def predict_all(self, db, as_of, params) -> dict:
          model, cur = self._train_panel(db, as_of, params)
          if model is None or cur is None or cur.empty:
              return {}
          scores = model.predict(_prep_features(cur, self.method))
          return {r["code"]: float(s) for r, s in zip(cur.itertuples(), scores)}

  class MlRidgeStrategy(MlStrategy):
      name = "ml_ridge"; method = "ridge"
  class MlLightgbmStrategy(MlStrategy):
      name = "ml_lightgbm"; method = "lightgbm"
  ```
  c) `backend/scripts/screener.py` STRATEGIES 行(line ~186)改为:
  ```python
  from ml_strategy import MlRidgeStrategy, MlLightgbmStrategy  # noqa: E402
  STRATEGIES: dict[str, Strategy] = {
      "rank_composite": RankCompositeStrategy(),
      "ml_ridge": MlRidgeStrategy(),
      "ml_lightgbm": MlLightgbmStrategy(),
  }
  ```
- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_ml_strategy.py tests/test_screener.py tests/test_backtest.py -v` → PASS(Task1 4 + Task2 3 + screener 11 + backtest 17)。
- [ ] **Step 5: Commit** — `git add backend/scripts/ml_strategy.py backend/scripts/screener.py backend/tests/test_ml_strategy.py && git commit -m "feat(ml): MlRidge/MlLightgbm Strategy + 注册(min_train PIT) (RQ-C2)"`

---

## Task 3: backtest ML 分支 + IC

**Files:** Modify `backend/scripts/backtest.py`(`run_backtest` 加 ML 分支 `_run_ml_backtest` + IC);test `backend/tests/test_backtest.py`
**Interfaces:** run_backtest 对 ml_* 走 `_run_ml_backtest`(MlStrategy.run 每 rb + predict_all 算 IC);返回加 `ic/icir/ic_win_rate`(仅 ML)。rank-composite 路径不变。

- [ ] **Step 1: 写失败测试**(追加到 test_backtest.py,复用 db/_seed_daily/_seed_constituent)

```python
def test_run_backtest_ml_returns_ic(db):
    from backtest import run_backtest
    from ml_strategy import clear_panel_cache
    clear_panel_cache()
    # 13 个月日 × 5 只,够 min_train(12)
    dates = ["20200131","20200228","20200331","20200430","20200531","20200630","20200731","20200831","20200930","20201031","20201130","20201231","20210131"]
    for code, off in zip(["A","B","C","D","E"], range(5)):
        _seed_daily(db, code, [(d, 10.0 + i + off) for i, d in enumerate(dates)], pe=10.0+off)
    _seed_constituent(db, "20200131", ["A","B","C","D","E"])
    res = run_backtest(db, strategy_name="ml_ridge", params={"top_n": 3, "ml_start":"20200101","ml_end":"20210131"},
                       start_date="20200101", end_date="20210131", cadence="monthly", cost_single=0.0)
    assert "ic" in res and "icir" in res and "ic_win_rate" in res
    assert isinstance(res["ic"], list)


def test_run_backtest_rank_composite_has_no_ic(db):
    """非 ML 回测不带 ic 字段(pillar E/D 不回归)。"""
    from backtest import run_backtest
    dates = ["20200131","20200228","20200331","20200430"]
    for code in ["A","B"]:
        _seed_daily(db, code, [(d, 10.0+i) for i,d in enumerate(dates)])
    _seed_constituent(db, "20200131", ["A","B"])
    res = run_backtest(db, start_date="20200101", end_date="20200430", cost_single=0.0)  # default rank_composite
    assert "ic" not in res
```

- [ ] **Step 2: 跑确认失败** — `cd backend && python -m pytest tests/test_backtest.py -v` → FAIL(ML 无 ic)。
- [ ] **Step 3: 实现** `backend/scripts/backtest.py`:
  顶部加 `from scipy.stats import spearmanr` + `from screener import STRATEGIES`(或 import MlStrategy)。在 run_backtest 开头(params 解析后)加 ML 分支:
  ```python
  if strategy_name in ("ml_ridge", "ml_lightgbm"):
      return _run_ml_backtest(db, strategy_name, params, start_date, end_date, cadence, cost_single, weighting, opt_window, max_w)
  ```
  新增 `_run_ml_backtest`(放在 run_backtest 前):
  ```python
  def _run_ml_backtest(db, strategy_name, params, start_date, end_date, cadence, cost_single, weighting, opt_window, max_w):
      from ml_strategy import _get_panel, clear_panel_cache
      import numpy as np
      strat = STRATEGIES[strategy_name]
      panel = _get_panel(db, params.get("ml_start", start_date), end_date)
      if panel.empty:
          return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0],[1.0], 12),
                  "as_of": end_date, "params": {**params, "weighting": weighting}, "caveats": ["ML 面板为空"]}
      rb_dates = sorted(panel["date"].unique().tolist())
      rb_dates = [d for d in rb_dates if start_date <= d <= end_date]
      if len(rb_dates) < 2:
          return {"equity": [], "drawdown": [], "metrics": compute_metrics([1.0],[1.0], 12),
                  "as_of": end_date, "params": {**params, "weighting": weighting}, "caveats": ["调仓日不足"]}
      daily_by_code = {c: g.sort_values("trade_date") for c, g in _load_panel(db, start_date, end_date)[0].groupby("code")}
      strat_eq, bench_eq, dates_out, ic_series = [1.0], [1.0], [rb_dates[0]], []
      prev_holdings = set()
      for i in range(len(rb_dates) - 1):
          rb, next_rb = rb_dates[i], rb_dates[i+1]
          cands = strat.run(db, rb, params)
          holdings = [c.ts_code for c in cands] or list(prev_holdings)
          universe = _universe_as_of(_load_panel(db, start_date, end_date)[2], rb)
          # 组合收益(加权/等权,同 D)
          if weighting == "equal" or len(holdings) < 2:
              port_ret = _period_return(daily_by_code, holdings, rb, next_rb)
          else:
              cov, ok = _holdings_cov(daily_by_code, holdings, rb, opt_window)
              if not ok:
                  port_ret = _period_return(daily_by_code, holdings, rb, next_rb)
              else:
                  w = compute_weights(weighting, cov, max_w)
                  port_ret = sum(wj * _stock_return(daily_by_code, holdings[j], rb, next_rb) for j, wj in enumerate(w))
          bench_ret = _period_return(daily_by_code, universe, rb, next_rb)
          cost = cost_single * _turnover(prev_holdings, set(holdings))
          strat_eq.append(strat_eq[-1]*(1+port_ret-cost)); bench_eq.append(bench_eq[-1]*(1+bench_ret))
          dates_out.append(next_rb); prev_holdings = set(holdings)
          # IC:scores vs 面板里该 rb 的实现 fwd_ret
          scores = strat.predict_all(db, rb, params)
          sub = panel[panel["date"]==rb]
          realized = {r["code"]: r["fwd_ret"] for _, r in sub.iterrows() if pd.notna(r["fwd_ret"])}
          common = [c for c in scores if c in realized]
          if len(common) >= 5:
              rho, _ = spearmanr([scores[c] for c in common], [realized[c] for c in common])
              if np.isfinite(rho):
                  ic_series.append({"date": rb, "ic": round(float(rho), 4)})
      metrics = compute_metrics(strat_eq, bench_eq, 12)
      equity = [{"date": d, "strategy": round(s,4), "benchmark": round(b,4)} for d,s,b in zip(dates_out, strat_eq, bench_eq)]
      peak = strat_eq[0]; drawdown = []
      for d, s in zip(dates_out, strat_eq):
          peak = max(peak, s); drawdown.append({"date": d, "value": round(s/peak-1,4) if peak else 0.0})
      ics = [x["ic"] for x in ic_series]
      icir = round(float(np.mean(ics)/np.std(ics)), 4) if (len(ics) >= 2 and np.std(ics) > 0) else None
      ic_win = round(float(np.mean([i > 0 for i in ics])), 4) if ics else None
      return {"equity": equity, "drawdown": drawdown, "metrics": metrics, "as_of": end_date,
              "params": {**params, "weighting": weighting, "opt_window": opt_window, "max_w": max_w},
              "ic": ic_series, "icir": icir, "ic_win_rate": ic_win, "caveats": []}
  ```
  > 注:`_load_panel` 在循环里调多次(低效但 v1 可接受;优化=Task 外)。实现者可把 daily_df/const_df 提到循环外缓存一次。`compute_weights`/`_holdings_cov`/`_stock_return`/`_period_return`/`_turnover`/`_universe_as_of`/`compute_metrics` 已在 backtest.py(E/D)。
- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_backtest.py -v` → PASS(pillar E/D 17 + 新 2 = 19)。
- [ ] **Step 5: Commit** — `git add backend/scripts/backtest.py backend/tests/test_backtest.py && git commit -m "feat(ml): run_backtest ML 分支 + IC/ICIR/胜率 (RQ-C3)"`

---

## Task 4: router 白名单 + 工具 strategy 透传

**Files:** Modify `backend/routers/candidates.py`(strategy 白名单)+ `backend/runtime/tools/candidates.py`(工具 strategy);tests
**Interfaces:** `/candidates/run` + `/candidates/backtest` 接受 `rank_composite|ml_ridge|ml_lightgbm`;工具透传 strategy。

- [ ] **Step 1: 写失败测试**(追加到 test_candidates_router.py)
```python
def test_run_accepts_ml_ridge(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20200131", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: [])
    r = client.post("/api/db/candidates/run", json={"strategy": "ml_ridge"})
    assert r.status_code == 200   # 不再 400

def test_run_rejects_unknown_strategy(client):
    r = client.post("/api/db/candidates/run", json={"strategy": "momentum_x"})
    assert r.status_code == 400
```
- [ ] **Step 2: 跑确认失败** — FAIL(ml_ridge 被 400 拒)。
- [ ] **Step 3: 实现** `backend/routers/candidates.py`:把两处 `if strategy != "rank_composite":` 改为白名单:
```python
_ALLOWED = {"rank_composite", "ml_ridge", "ml_lightgbm"}
# /run 和 /backtest 里:
if strategy not in _ALLOWED:
    raise HTTPException(status_code=400, detail=f"v1 仅支持 {sorted(_ALLOWED)}: {strategy}")
```
工具 `RunScreenerTool`/`RunBacktestTool`:加 `strategy` 入参透传(默认 rank_composite);input_schema 加 strategy 字段。test_candidates_tool 加 strategy 透传断言。
- [ ] **Step 4: 跑确认通过** — `cd backend && python -m pytest tests/test_candidates_router.py tests/test_candidates_tool.py -v` → PASS。
- [ ] **Step 5: Commit** — `git add backend/routers/candidates.py backend/runtime/tools/candidates.py backend/tests/test_candidates_router.py backend/tests/test_candidates_tool.py && git commit -m "feat(ml): router strategy 白名单 + 工具透传 (RQ-C4)"`

---

## Task 5: 前端(ML 选项 + IC 面板)

**Files:** Modify `src/services/dbApi.ts`(BacktestResult +ic)+ `CandidatePanel.tsx`(ML 选项 + 隐藏三秩)+ `BacktestPanel.tsx`(IC 面板);tests

- [ ] **Step 1-5: TDD** — dbApi BacktestResult 加 `ic?: {date,ic}[]; icir?: number; ic_win_rate?: number`;CandidatePanel PRESET_LABELS 加「Ridge」「LightGBN」,ML 时(strategy 含 ml_)隐藏 PE秩/ROE秩/动量秩 三列只显示总分;BacktestPanel 结果含 `ic` 时渲染 IC 面板(Recharts IC 时序 + ICIR/胜率 tile,vi.mock recharts 已有)。测试:ML 选项在下拉;ML 候选无三秩;回测含 ic 时 IC 面板渲染(mock ic 数组 ≥2 点)。
  - typecheck 必过;镜像现有暖色风。
  - Commit: `feat(ml): 前端 ML 选项 + IC 面板 (RQ-C5)`

> 实现细节参考 CandidatePanel/BacktestPanel 现有结构(PRESET_LABELS / 指标 tile / Recharts)。ML 时三秩列条件渲染:`{!isML && <th>PE秩</th>...}`。

---

## Task 6: invest_agent prompt + 依赖 + 矩阵 + 验证

**Files:** Modify `backend/agents/invest_agent.py`(prompt ML 段)+ `backend/requirements.txt`(+scikit-learn +lightgbm)+ `项目执行跟踪矩阵.md`(RQ-103)

- [ ] **Step 1** invest_agent system_prompt 加【ML 选股】段(何时用 ml_ridge/ml_lightgbm 工具)。+ test。
- [ ] **Step 2** requirements.txt 加 `scikit-learn>=1.3` + `lightgbm>=4.0`(本地已 pip install)。
- [ ] **Step 3** 全量后端测试:`cd backend && python -m pytest tests/test_ml_strategy.py tests/test_backtest.py tests/test_weighting.py tests/test_screener.py tests/test_candidates_router.py tests/test_candidates_tool.py tests/test_invest_agent.py -v` → 全 PASS。
- [ ] **Step 4** 前端 typecheck + 测试:`npm run typecheck && npm run test:run -- CandidatePanel BacktestPanel` → PASS。
- [ ] **Step 5** 跟踪矩阵 +RQ-103。
- [ ] **Step 6** Commit: `feat(ml): invest_agent ML prompt + sklearn/lightgbm 依赖 + RQ-103 + 验证 (RQ-C6)`

---

## Self-Review

- **Spec 覆盖**:ml_strategy 面板+缓存(Task1)+ Ridge/LightGBM MlStrategy+注册(Task2)+ backtest ML+IC(Task3)+ router/工具白名单(Task4)+ 前端 ML 选项+IC 面板(Task5)+ prompt+依赖+矩阵(Task6)✓;6 因子✓;PIT(train date≤as_of + fwd_ret.notna)✓;IC 仅 ML(Task3 非 ML 无 ic 字段)✓;候选池+回测双用✓。
- **占位符**:无 TBD;Task5 前端略简(参考现有结构,实现者照 PRESET_LABELS/Recharts 模式)。
- **类型一致**:`MlStrategy.run/predict_all` Task2 定义,Task3 调用一致;`STRATEGIES` Task2 注册 ml_*,Task3/4 用;`ic/icir/ic_win_rate` Task3 返回,Task5 前端类型一致。
- **风险**:① sklearn/lightgbm 需 pip install(Task2/6);② `_run_ml_backtest` 里 `_load_panel` 多次调(低效,v1 接受,可缓存);③ ML 训练在 13 月 fixture 上 min_train=12 边界(测试用 ≥13 月);④ LightGBM 在小样本上可能 warning(verbose=-1 抑制)。

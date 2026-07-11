# 候选池 pillar C·ML walk-forward(Ridge + LightGBM)+ IC · 设计

> 2026-07-11 | 设计文档 | 多策略投研平台 pillar C-core(spec 4)
> 前置:pillar A+B(候选池 screener + Strategy 抽象)+ E(回测引擎)已合入 main。

## 概述

接入 **ML 选股策略**:Ridge + LightGBM 两个 `MlStrategy` 插入策略注册表。6 因子(动量/PE/ROE/毛利率/负债率/市值,底座已 ML-ready)。两种用法:
- **候选池**(按需):train 全历史 ≤ now → 预测当前截面 → top-N 候选。
- **回测**(walk-forward):pillar E 引擎每调仓日调 `MlStrategy.run`(切片缓存面板,train ≤rb,predict → top-N 组合)+ 逐期 IC(Spearman 预测分 vs 实现远期收益)→ ICIR/胜率。

这是平台第 5 个(最后一个)pillar。8 因子(北向/IVOL)作 follow-on。

### 关键决策(brainstorming 已确认)

| 维度 | 决策 |
|---|---|
| 因子集 | **6 因子**(动量/PE/ROE/毛利率/负债率/市值;现有底座,零新数据) |
| 方法 | **Ridge + LightGBM 都做** |
| Ridge 特征 | 横截面 rank 归一化(python-learning day11) |
| LightGBM 特征 | 原始值 + 1%/99% winsorize(day12);LGB_PARAMS {num_leaves:31,lr:0.05,n_estimators:100,min_data_in_leaf:50} |
| 训练 | expanding window,`min_train=12` 期;train 只用 `date < as_of`(PIT,未来 label 不入训练) |
| 标签 | 下一期远期收益(月频=下月,季频=下季);用 ≤as_of 的历史 (factor, fwd_ret) 对训练 |
| 回测 ML | walk-forward **load-once**(面板构建一次,模块级缓存,每 rb 切片 + train) |
| IC | Spearman(预测分, 实现远期收益)逐期 + ICIR(mean/std)+ IC 胜率(frac IC>0);**仅 ML 回测返回** |
| 候选池 ML | 按需(train 全历史 → 当前 top-N) |
| 面板缓存 | 模块级,`clear_panel_cache()` 测试用 |
| 新依赖 | `scikit-learn`(Ridge)+ `lightgbm` |

## 架构

新增 `backend/scripts/ml_strategy.py`(面板构建 + MlStrategy + predict_all)。复用 A+B 的 `Strategy` ABC + `STRATEGIES` 注册表 + `Candidate`;复用 pillar E 的 `run_backtest`(ML 时额外算 IC)。IC 是 ML 回测副产物,非 ML(rank-composite)回测不变、无 IC 字段。

## 数据流

```
候选池(按需):选「Ridge/LightGBM」→ POST /candidates/run {strategy:"ml_ridge", params}
 → compute_candidates(db, "ml_ridge", params, as_of=最新):
   MlRidgeStrategy.run(db, as_of, params):
     panel = _get_panel(db, start, end)  # 缓存;首次 _build_panel
     train = panel[panel.date ≤ as_of],dropna(label);len<min_train → []
     fit Ridge on (rank-features, fwd_ret)  # 或 LightGBM(winsorized raw)
     predict as_of 截面 scores → top-N Candidate

回测(walk-forward):POST /candidates/backtest {strategy:"ml_lightgbm", ...}
 → run_backtest(db, "ml_lightgbm", params, ..., weighting):
   每 rb: MlLightgbmStrategy.run(db, rb, params) → top-N → 加权/等权组合净值(同 pillar E/D)
   ML 专有:每 rb predict_all(db, rb) → {code:score};记录 (score, 实现远期收益[code@(rb,next_rb]])
   → 逐期 IC = spearman(scores, realized_fwd_rets);ICIR = mean(IC)/std(IC);ic_win = frac(IC>0)
   → 返回 {...pillar E/D 字段, ic: [{date, ic}], icir, ic_win_rate}

前端:候选池下拉加 Ridge/LightGBm;回测 ML 时 BacktestPanel 显示 IC 面板(Recharts IC 时序 + ICIR/胜率 tile)
```

## 组件

### ① `backend/scripts/ml_strategy.py`(新)

```python
# 伪码
import numpy as np, pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import Ridge
import lightgbm as lgb
from screener import Strategy, Candidate, DEFAULT_PARAMS

FACTORS = ["momentum", "pe", "roe", "grossprofit_margin", "debt_to_assets", "total_mv"]
_PANEL_CACHE = {"key": None, "df": None}

def clear_panel_cache(): _PANEL_CACHE.update(key=None, df=None)

def _build_panel(db, start, end) -> pd.DataFrame:
    """load-once:每个 (date, code) 的 6 因子(PIT as-of date)+ fwd_ret(下一期远期收益)。
    复用 backtest 的 _load_panel / _factor_rows_as_of 思路:逐调仓日截面因子 + shift(-1) 远期收益。"""
    # daily/fund/const → 调仓日序列(月频)→ 每 (date,code) 因子 + 下一调仓日远期收益(adj_close)
    ...

def _get_panel(db, start, end):
    key = (start, end)
    if _PANEL_CACHE["key"] != key:
        _PANEL_CACHE.update(key=key, df=_build_panel(db, start, end))
    return _PANEL_CACHE["df"]

def _prep_features(df: pd.DataFrame, method: str) -> pd.DataFrame:
    """Ridge=横截面 rank(逐 date groupby rank);LightGBM=raw + 1%/99% winsorize(逐 date)。"""
    ...

class MlStrategy(Strategy):
    name = "ml"   # 子类 ml_ridge / ml_lightgbm 覆盖
    method = "ridge"
    min_train = 12
    def run(self, db, as_of, params) -> list[Candidate]:
        panel = _get_panel(db, params.get("ml_start","20200101"), as_of or _latest_trade_date(db))
        train = panel[(panel.date < as_of) & panel.fwd_ret.notna()]
        if len(train.date.unique()) < self.min_train: return []
        Xtr = _prep_features(train[FACTORS], self.method); ytr = train.fwd_ret
        model = self._fit(Xtr, ytr)
        cur = panel[panel.date == as_of]
        if cur.empty: return []
        scores = self._predict(model, _prep_features(cur[FACTORS], self.method))
        cur = cur.assign(score=scores).sort_values("score", ascending=False).head(params["top_n"])
        return [Candidate(ts_code=r.code, name="", industry="", score=float(r.score),
                          pe_rank=0, roe_rank=0, momentum_rank=0, rank=i+1) for i,r in enumerate(cur.itertuples())]
    def predict_all(self, db, as_of, params) -> dict:
        """全 universe 预测分(IC 用)。同 run 但不截 top_n。"""
        ...
    def _fit(self, X, y): ...      # Ridge(alpha=1.0) / LGBMRegressor(LGB_PARAMS)
    def _predict(self, model, X): ...

class MlRidgeStrategy(MlStrategy): name="ml_ridge"; method="ridge"
class MlLightgbmStrategy(MlStrategy): name="ml_lightgbm"; method="lightgbm"
```

> `Candidate` 的 pe_rank/roe_rank/momentum_rank 对 ML 无意义 → 填 0(score 是 ML 预测分,前端 ML 时只显示 score/总分,不显示三秩)。前端按 strategy 判断是否显示三秩列。

### ② `backend/scripts/backtest.py` 加 IC(ML 时)

- `run_backtest` 检测 `strategy_name` 是否 ML(`ml_ridge`/`ml_lightgbm`);若是,每 rb 额外 `strat.predict_all(db, rb, params)` + 记录 (score, 实现远期收益),期末算 `ic`(逐期 Spearman)/`icir`/`ic_win_rate`,加入返回 dict。非 ML → 不加 ic 字段(保持 pillar E/D 兼容)。
- 需要把 `strategy_name` 透传到 run_backtest(现签名第一参已是 `strategy_name`,但 pillar E 未用;ML 时用它选 strategy + 算 IC)。

### ③ `backend/scripts/screener.py`

`STRATEGIES` 注册:
```python
from ml_strategy import MlRidgeStrategy, MlLightgbmStrategy
STRATEGIES = {"rank_composite": RankCompositeStrategy(),
              "ml_ridge": MlRidgeStrategy(), "ml_lightgbm": MlLightgbmStrategy()}
```
`compute_candidates(db, strategy_name, params, as_of)` 已支持任意注册策略(A+B 已有)。

### ④ Router + 工具

- `backend/routers/candidates.py`:`/candidates/run` 与 `/candidates/backtest` 放开 `strategy` 接受 `rank_composite | ml_ridge | ml_lightgbm`(原来硬限 rank_composite → 改校验白名单)。`/run` 空 DB → 409 不变。
- `backend/runtime/tools/candidates.py`:`RunScreenerTool`/`RunBacktestTool` 的 strategy 透传(默认 rank_composite)。

### ⑤ 前端

- `src/services/dbApi.ts`:`BacktestResult` 加可选 `ic?: {date,ic}[]; icir?: number; ic_win_rate?: number`。
- `src/components/agentRuntime/CandidatePanel.tsx`:策略下拉 `PRESET_LABELS` 加「Ridge」「LightGBM」(ML 选项);ML 时隐藏三秩列(只显示总分)。
- `src/components/agentRuntime/BacktestPanel.tsx`:结果含 `ic` 时显示 IC 面板(Recharts IC 时序 Bar/Line + ICIR/胜率 tile)。
- `invest_agent` system_prompt 加【ML 选股】段(何时用 ML 工具)。

### ⑥ 依赖

`backend/requirements.txt` + `scikit-learn>=1.3` + `lightgbm>=4.0`。

## 测试(TDD)

| 文件 | 关键用例 |
|---|---|
| `test_ml_strategy.py`(新) | `_build_panel` PIT(因子 as-of date)+ fwd_ret 方向(下期);Ridge/LightGBM `run` 产出 top-N(Candidate 结构);`predict_all` 全 universe 长度;train `date ≤ as_of`(PIT:未来 label 不入训练,强测试);`len<min_train` → [];`_prep_features`(rank vs winsorize);`clear_panel_cache` |
| `test_backtest.py` 加 | ML 回测跑通 + 返回 `ic/icir/ic_win_rate`;IC=Spearman(已知 fixture,预测分与实现收益同向 → IC>0);非 ML 回测**无** ic 字段(pillar E/D 不回归) |
| `test_candidates_router.py` 加 | `/run` + `/backtest` 接受 `ml_ridge`/`ml_lightgbm`;非白名单 → 400 |
| `test_candidates_tool.py` 加 | 工具 strategy 透传 ml_* |
| 前端 `CandidatePanel/BacktestPanel.test.tsx` 加 | ML 选项在下拉;ML 候选隐藏三秩;回测含 ic 时 IC 面板渲染 |

## 不包含(v1 / follow-on)

- 8 因子(北向 northbound_hold + IVOL)—— follow-on spec(扩一张表 + 抓取)
- ML 超参网格寻优 / 自动调参
- 模型持久化(每次重训,不存模型文件)
- IC 衰减 / 分位单调性图 / 多模型对比叠图
- 季频标签(月频先行;季频 label=下季,留参数)

## 关联

- 前置/复用:`docs/superpowers/specs/2026-07-11-invest-candidate-pool-design.md`(A+B Strategy 抽象 + STRATEGIES + compute_candidates)、`-backtest-design.md`(E run_backtest,ML 接入 + IC)、`-weighting-design.md`(D 加权,ML 回测也支持加权)
- ML 参考:`python-learning/notebooks/day11_ml_select.ipynb`(Ridge walk-forward,rank 特征,Spearman IC)、`day12_lightgbm_select.ipynb`(LightGBM,winsorize,LGB_PARAMS)
- 新依赖:scikit-learn(Ridge)、lightgbm

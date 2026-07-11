# 候选池(策略选股)· 设计(spec 1 = 数据底座 + rank-composite 选股器)

> 2026-07-11 | 设计文档 | invest agent · 多策略投研平台 pillar A+B

## 概述

invest agent 新增「候选池」tab:一个**策略选股器**——跑策略 → 产出 top-N 候选池快照(保留历史)→ 可一键晋升到自选股。镜像现有 watchlist 全栈(模型/router/前端 tab/工具)。

打分引擎**复用 python-learning `notebooks/day7_three_factor.ipynb::backtest_mf3`** 的**横截面 rank-composite**(PE/ROE/动量 → 序数秩 → 加权求和 → `nlargest`),量纲安全。

### 平台定位与拆解(重要上下文)

这是「多策略投研平台」的第 1 个 spec。python-learning 的 11 个策略分 3 家族(rank-composite / ML walk-forward / 组合优化),依赖驱动拆成 4 个 pillar:

| Pillar | 内容 | 状态 |
|---|---|---|
| **A. 数据底座** | 4 张 MySQL 表 + 抓取脚本 + PIT 读取器(**ML-ready**) | **本 spec** |
| **B. rank-composite 选股器 + 候选池 UI** | 策略抽象 + 预设/自定义 + 快照/晋升 + 前端 | **本 spec** |
| C. ML walk-forward(Ridge/LightGBM)+ IC 评估 | 插入 B 的 Strategy 接口 | 后续 spec |
| D. 组合优化加权(min_var/risk_parity, SLSQP) | 叠加在 B/C 选出的标的上 | 后续 spec |

**本 spec = A + B**。`Strategy` 抽象和表结构按"以后能插 ML/优化器"设计,但**不实现** C/D(YAGNI:接口预留,不写空壳)。

### 关键决策(brainstorming 已确认)

| 维度 | 决策 |
|---|---|
| 打分范式 | **横截面 rank-composite**(复用 day7),非 z-score/winsorize/banded |
| 「PE分位」语义 | **横截面 PE 秩**(越便宜秩越高),非历史分位 —— 三因子同范式才相干 |
| 快照生命周期 | **保留历史**(candidate_snapshot + candidate_pool 外键),非覆盖 |
| 因子复合量纲 | 全部转横截面 `.rank()`,缺失填最差秩 `fillna(max+1)` |
| 策略范围(v1) | rank-composite 家族:4 预设 + 自定义;ML/优化器 = pillar C/D |
| 动量窗默认 | **252d**(1y,适配 on-demand/季度节奏;可调 20/60/120/252) |
| tushare token | **agentlab `settings.tushare_token`**(付费 token);禁用 python-learning 旧 file token `a63a…226a` |
| top_n / 再平衡 | 默认 top30;**on-demand** 点按钮跑(季度是预期节奏,非 cron) |

## 数据流

```
[离线/手动] python backend/scripts/fetch_candidates_data.py
   → index_weight(000300.SH) → index_constituent
   → 逐股 daily+daily_basic+adj_factor → stock_daily
   → 逐股 fina_indicator(不传 fields) → fundamental_pit
   → 回写 fetch_log

[在线/秒级] 用户在候选池 tab 选策略 + 调参 → 点【跑策略】
   → POST /api/db/candidates/run {strategy, params}
   → RankCompositeStrategy.run(读 stock_daily/fundamental_pit/index_constituent, PIT)
   → 横截面 rank-composite 打分 → 过滤 → top30
   → 写 candidate_snapshot(含 strategy_name+params) + candidate_pool
   → 返回 snapshot_id

[查看] GET /candidates/snapshots(历史下拉) + GET /candidates?snapshot_id=latest(列表)
[晋升] POST /candidates/{snapshot_id}/promote/{ts_code} → INSERT watchlist(防重)+ 标 promoted
[对话] invest agent 工具 run_screener/list_candidates/promote_candidate 直接调同款逻辑
```

## ① 数据底座

### 新表(`backend/models.py`,挨着 `WatchlistModel`)

```python
class StockDailyModel(Base):
    """日频主表(行情+估值+复权)。主键 (code, trade_date)。"""
    __tablename__ = "stock_daily"
    code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)      # YYYYMMDD
    close = Column(Float)
    adj_factor = Column(Float)        # 复权价 = close × adj_factor(动量用)
    pe_ttm = Column(Float)            # 价值因子
    total_mv = Column(Float)          # 规模(pillar C ML 用;v1 展示)


class FundamentalPitModel(Base):
    """季频财务(PIT 命脉,按 ann_date 对齐)。主键 (code, end_date, ann_date)。
    ML-ready:除 brief 的 roe,顺手存 grossprofit_margin/debt_to_assets
    (同一次 fina_indicator 调用带回,pillar C 不用迁移 schema)。"""
    __tablename__ = "fundamental_pit"
    code = Column(String(12), primary_key=True)
    end_date = Column(String(8), primary_key=True)        # 报告期
    ann_date = Column(String(8), primary_key=True)        # 公告日,PIT 对齐
    roe = Column(Float)                                    # 质量因子(v1 用)
    grossprofit_margin = Column(Float)                     # ML 用(pillar C)
    debt_to_assets = Column(Float)                         # ML 用(pillar C)


class IndexConstituentModel(Base):
    """指数成分(PIT 时变成分)。主键 (index_code, trade_date, code)。"""
    __tablename__ = "index_constituent"
    index_code = Column(String(12), primary_key=True)     # 000300.SH
    trade_date = Column(String(8), primary_key=True)      # 成分生效日
    code = Column(String(12), primary_key=True)
    weight = Column(Float)


class FetchLogModel(Base):
    """增量进度/可续抓。主键 source。"""
    __tablename__ = "fetch_log"
    source = Column(String(40), primary_key=True)
    last_anchor_date = Column(String(8))
    last_updated_at = Column(DateTime)
    rows_total = Column(BigInteger)
    note = Column(String(200))
```

### 抓取脚本 `backend/scripts/fetch_candidates_data.py`(挨着 `analyze.py`)

读 `settings.tushare_token`(付费 token)。全量抓(从 2020-01-01 起,够 252d 动量):

1. `index_weight(000300.SH)` → `index_constituent`(每个 trade_date 快照去重留最新;⚠️ 实测仅近 2 年 ~2024-07 起,够用)
2. 逐股:
   - `daily`(close/pct_chg)+ `daily_basic`(pe_ttm/total_mv)+ `adj_factor` → `stock_daily`
   - `fina_indicator()`(**不传 `fields=`,会静默丢 `ann_date`**)→ `fundamental_pit`(只取 roe/grossprofit_margin/debt_to_assets + ann_date + end_date;年报 end_date 末四位='1231' 去重留最新 ann_date)
3. 写库:每股 `DELETE WHERE code=?` + `bulk_insert`(幂等,重跑不重复);逐股 try/except 失败 `continue` 不整批崩;`time.sleep(0.3)` 限速;每 50 只打印进度;抓完回写 `fetch_log`

> 增量抓取(`fetch_log` 驱动只抓增量)= v2。v1 全量重抓 + fetch_log 记进度(可断点 续抓辅助)。

### PIT 读取器(screener 内联,不单独建 v_fundamentals_as_of)

取 roe 时:`fundamental_pit` 中 `code=?` 且 `ann_date ≤ as_of_date` 的最新一行(day7 / `data_loader.build_daily_panel` 命脉)。

## ② 策略抽象 + 选股引擎

### Strategy 接口(`backend/scripts/screener.py` 内,pillar C/D 的插槽)

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class Candidate:
    ts_code: str; name: str; industry: str
    score: float                       # composite(越高越好)
    pe_rank: float; roe_rank: float; momentum_rank: float   # 分项秩(透明)

class Strategy(ABC):
    name: str                          # 'rank_composite' / 以后 'lightgbm' ...
    params_schema: dict                # JSON Schema,前端参数面板 + 校验复用
    @abstractmethod
    def run(self, db, as_of_date: str, params: dict) -> list[Candidate]: ...
```

pillar C = 新增 `MlStrategy(Strategy)`(可在 `screener.py` 同文件或新文件);pillar D = 加权层(正交,可叠加在任意 Strategy 输出上)。注册即接入,**快照/UI/晋升/工具链零改动**。pillar C 落地时再视复杂度拆 `strategies/` 子包(v1 不预拆)。

### RankCompositeStrategy(`backend/scripts/screener.py` 内,复用 day7)

```python
# 伪码,体现 day7 的 rank-composite 形态
def run(self, db, as_of_date, params):
    universe = index_constituent 最新快照(≤ as_of_date)的 code 集
    rows = []
    for code in universe:
        adj_close = stock_daily[code].close × adj_factor      # 复权价序列
        momentum  = adj_close[-1] / adj_close[-1-window] - 1  # 默认 window=252
        pe        = stock_daily[code] 最新 pe_ttm
        roe       = fundamental_pit PIT(ann_date ≤ as_of_date) 最新 roe
        rows.append({code, pe, roe, momentum, name, industry})

    # 硬过滤(三过滤均基于 universe 横截面,阈值来自 params):
    #   PE>0(绝对)、ROE≥roe_min(绝对)、动量 ≥ universe 动量 (1-mom_top_pct) 分位数
    mom_cut = quantile([r.momentum for r in rows], 1 - params['mom_top_pct']/100)
    surv = [r for r in rows if r.pe > 0 and r.roe >= params['roe_min'] and r.momentum >= mom_cut]

    # 对 survivors 横截面 rank(PE 负向:越便宜越高;缺失/被过滤不参与,秩仅在 survivors 内)
    pe_rank  = (-surv_pe).rank();  roe_rank = surv_roe.rank();  mom_rank = surv_mom.rank()
    composite = (w_pe*pe_rank + w_roe*roe_rank + w_mom*mom_rank)   # 权重和=1,某项 0=退出
    return composite.nlargest(params['top_n']) → [Candidate(...)]
```

**过滤顺序已定**:三硬过滤并行施加于 universe → survivors 交集 → 对 survivors 做横截面 rank-composite → top_n。「动量前 40%」= universe 动量的 top-40% 下沿(非 survivors 内)。

**PIT 安全**:roe 只取 `ann_date ≤ as_of_date`;动量用 ≤ as_of_date 的复权价。survivors < top_n 时返回实际数。

### 策略预设 + 自定义(params 决定,同引擎)

| 策略 | w_pe | w_roe | w_mom | 说明 |
|---|---|---|---|---|
| 多因子平衡(默认) | 0.30 | 0.30 | 0.40 | brief 原方案 |
| 价值+质量 | 0.45 | 0.45 | 0.10 | 价值质量倾斜 |
| 纯动量 | 0 | 0 | 1.00 | 仅动量 |
| 价值+动量 | 0.40 | 0 | 0.60 | 价值+趋势 |
| 自定义 | 用户填 | 用户填 | 用户填 | 全旋钮可调 |

预设 = 服务端把预设名展开成 params;自定义 = 前端直接传 params。**同一个 `RankCompositeStrategy.run`**,区别仅在 params。

### 可调旋钮(rank-composite 家族,前端参数面板)

| 旋钮 | 默认 | 说明 |
|---|---|---|
| PE / ROE / 动量 权重 | 30/30/40 | 和=100%;某项 0=退出 |
| 动量窗 window | 252d | 可选 20/60/120/252 |
| top_n | 30 | 候选数 |
| 硬过滤 | PE>0 / ROE≥12% / 动量 top40% | 均可关/调阈值 |
| universe | 沪深300 | v1 固定 |

## ③ 候选池(模型 + router + 前端)

### 候选池表(保留历史快照)

```python
class CandidateSnapshotModel(Base):
    """一次跑策略 = 一行。保留全部历史(UI 默认显示最新,可切换)。"""
    __tablename__ = "candidate_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_at = Column(DateTime, default=datetime.utcnow)
    as_of_date = Column(String(8))                 # 打分数据日
    strategy_name = Column(String(32))             # 'rank_composite' / 以后 'lightgbm'
    strategy_label = Column(String(32))            # 展示名:'多因子平衡'/'自定义'
    universe = Column(String(12))                  # 000300.SH
    params = Column(MySQLJSON)                     # 完整参数 bundle(自描述/可复现)
    count = Column(Integer)


class CandidatePoolModel(Base):
    __tablename__ = "candidate_pool"
    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(ForeignKey("candidate_snapshots.id", ondelete="CASCADE"), index=True)
    rank = Column(Integer)                          # 1..top_n
    ts_code = Column(String(32)); name = Column(String(64)); industry = Column(String(40))
    score = Column(Float)                           # composite
    pe_rank = Column(Float); roe_rank = Column(Float); momentum_rank = Column(Float)
    promoted = Column(Boolean, default=False); promoted_at = Column(DateTime)
    __table_args__ = (Index("uniq_snap_code", "snapshot_id", "ts_code", unique=True),)
```

### Router `backend/routers/candidates.py`(prefix `/api/db`,镜像 watchlist)

- `POST /candidates/run` body `{strategy: "rank_composite", label?: "多因子平衡", params?: {...}}`
  - 数据底座空(stock_daily 无数据)→ **409**「先跑 `fetch_candidates_data.py`」
  - 否则调 `Strategy.run` → 落 snapshot+pool → 返回 `{snapshot_id, count, as_of_date}`
- `GET /candidates/snapshots` → 历史列表(run_at/as_of/strategy_label/count/params)
- `GET /candidates?snapshot_id=<latest>` → 该快照 pool 行(默认最新)
- `GET /candidates/strategies` → 可用策略 + params_schema(前端参数面板渲染用)
- `POST /candidates/{snapshot_id}/promote/{ts_code}` → INSERT watchlist(防重)+ 标 `promoted=True`

### 前端

- `CandidatePanel.tsx`(镜像 `WatchlistPanel.tsx`):
  - 顶栏:【策略】下拉(4 预设 + 自定义)+【🚀 跑策略】+ 历史快照下拉 +【全部晋升】
  - 参数面板:选预设→字段只读填入预设值;选自定义→权重(window/top_n/过滤)可编辑(权重实时校验和=100%)
  - 候选表:排名/代码/名称/行业/总分/PE秩/ROE秩/动量秩 + 每行【晋升】(已晋升→置灰) + 行点击 → `openStockTab`
  - 错误态:数据底座空 → 红字提示跑 fetch 脚本
- `invest_agent` 的 `workspace.tabs` 追加 `"候选池"`
- `TabsWorkspace.tsx` 加 `{activeStatic === '候选池' && <CandidatePanel />}`
- `dbApi` 加 `runCandidates / listCandidateSnapshots / listCandidates / listCandidateStrategies / promoteCandidate`
- mockup(v2)见 `.superpowers/brainstorm/1511-1783740493/content/candidate-panel-v2.html`

## ④ 集成(工具 + invest_agent)

`backend/runtime/tools/candidates.py`(镜像 `tools/watchlist.py`,用 `SessionLocal` + 直接调 strategy/查模型,不走 HTTP):

- `run_screener_tool`「跑一次策略选股,生成最新候选池」(默认多因子平衡,可传 strategy/params)
- `list_candidates_tool`「列出当前候选池 top30」
- `promote_candidate_tool`「把候选池某股晋升到自选股」

`invest_agent.tool_names` 追加这 3 个;system_prompt 加【候选池·策略选股】引导段(类比现有【自选股】段)。

## 测试(TDD,每个 Task 先写失败测试)

| 文件 | 关键用例 |
|---|---|
| `test_candidate_model.py` | 6 张表建表成功;snapshot↔pool FK + ondelete cascade;unique(snapshot_id,ts_code) |
| `test_screener.py` | 三因子秩方向(PE 负向/ROE 正向/动量正向);缺失填最差秩;权重和=1 且某项 0 退出;composite 计算;top_n 截断;**PIT**(ann_date≤as_of 才可见,未来报告期不算);survivors<top_n 退化;硬过滤(PE>0/ROE≥/动量top%,动量阈值基于 universe 非 survivors) |
| `test_fetch_candidates_data.py` | 逐股失败 continue 不整批崩;重跑幂等(DELETE+insert 不重复);fetch_log 回写;`fina_indicator` 不传 fields 保 ann_date(tushare mock) |
| `test_candidates_router.py` | run 空底座→409;run happy→落 snapshot(含 strategy_name+params)+pool;snapshots 列表;list 默认最新;promote→入 watchlist + 标 promoted + 防重;strategies 返回 schema |
| `test_candidates_tool.py` | 三工具返回结构正确;run_screener 默认多因子平衡 |
| 前端 `CandidatePanel.test.tsx` | 空态;策略切换(预设只读/自定义可编);跑策略 loading;快照切换;晋升后置灰;权重和校验 |

## 不包含(spec 1 范围外)

- **pillar C**:ML walk-forward(Ridge/LightGBM)、IC/ICIR 评估面板、特征工程 pipeline
- **pillar D**:组合优化加权(min_var/risk_parity, scipy SLSQP)
- 北向 `northbound_hold` 表、IVOL 因子(随 pillar C 引入)
- 增量抓取(fetch_log 驱动只抓增量)、自动调度(cron)
- 回测曲线 / OOS 评估 / 摩擦成本(涨停停牌印花税)—— 候选池只存快照,不做回测
- 周期股 PE 陷阱中性化、经营现金流门槛(python-learning 亦未做)

## 关联

- 打分参考:`python-learning/notebooks/day7_three_factor.ipynb::backtest_mf3`(cell `ec16859f`)
- PIT 命脉:`python-learning/scripts/data_loader.py::build_daily_panel`(`fina_indicator` 不传 fields、按 ann_date ffill)
- 数据模型/tushare 实测:`python-learning/docs/superpowers/specs/2026-07-11-数据层-design.md`(§3 字段表、§9 index_weight 仅近 2 年等天花板)
- 镜像对象:agentlab watchlist 全栈(`routers/watchlist.py`、`runtime/tools/watchlist.py`、`WatchlistPanel.tsx`、`invest_agent.py`、`models.py::WatchlistModel`)
- 平台后续:pillar C(ML)、pillar D(优化器)各自独立 spec

# 候选池(策略选股)Implementation Plan(spec 1 = pillar A+B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** invest agent 新增「候选池」tab:多策略选股器(数据底座 + rank-composite)→ top-N 快照(保留历史)→ 一键晋升自选股。

**Architecture:** 镜像 watchlist 全栈(MySQL 模型 + FastAPI router + 前端 tab + invest_agent 工具)。打分复用 python-learning day7 横截面 rank-composite(纯函数 `rank_composite_score` + DB 加载层分离,便于 TDD)。`Strategy` 抽象 + `STRATEGIES` 注册表预留 ML(pillar C)/优化器(pillar D)插槽,v1 只实现 rank-composite。

**Tech Stack:** 后端 Python FastAPI + SQLAlchemy + pandas + tushare;前端 React + TypeScript + Zustand;测试 pytest(后端,sqlite in-memory)+ Vitest + @testing-library/react(前端)。

**Spec:** `docs/superpowers/specs/2026-07-11-invest-candidate-pool-design.md`

## Global Constraints

- tushare token 用 **`settings.tushare_token`**(付费 token);**禁用** python-learning 旧 file token(`a63a…226a`)。
- `fina_indicator()` **绝不传 `fields=`**(会静默丢 `ann_date`);PIT 对齐用 `ann_date` 非 `end_date`。
- 命令:后端测试 `cd backend && .venv/Scripts/python.exe -m pytest <file> -v`;前端测试 `npm test -- <pattern>`;typecheck `npm run typecheck`。
- 镜像现有 watchlist 的代码风格(模型挨着 `WatchlistModel`、router prefix `/api/db`、工具 `SessionLocal`+`register_tool`)。
- **不要**实现 ML(pillar C)、组合优化(pillar D)、增量抓取、北向/IVOL 因子、回测曲线。
- 每张表由 `main.create_tables()` 自动建(无需手写迁移)。

## File Structure

**后端新建:**
- `backend/scripts/screener.py` — `Candidate` dataclass + `Strategy` ABC + `rank_composite_score`(纯)+ DB 加载 + `RankCompositeStrategy` + `STRATEGIES` 注册表 + `PRESETS` + `compute_candidates`
- `backend/scripts/fetch_candidates_data.py` — 批量抓取(index_weight/daily/daily_basic/adj_factor/fina_indicator)→ 4 张底座表
- `backend/routers/candidates.py` — `/candidates/run|snapshots|list|strategies|promote`
- `backend/runtime/tools/candidates.py` — 3 个工具(run_screener / list_candidates / promote_candidate)
- `backend/tests/test_candidate_model.py` / `test_screener.py` / `test_fetch_candidates_data.py` / `test_candidates_router.py` / `test_candidates_tool.py`

**后端修改:**
- `backend/models.py` — +6 模型
- `backend/main.py` — 注册 candidates router
- `backend/runtime/tools/__init__.py` — `from . import candidates`
- `backend/agents/invest_agent.py` — tabs 加「候选池」+ tool_names 加 3 工具 + system_prompt 段
- `backend/schemas.py` — +候选池 Pydantic schema(可选,响应整形)

**前端:**
- `src/services/dbApi.ts` — +候选池类型 + 5 个 API 方法
- `src/components/agentRuntime/CandidatePanel.tsx`(新)+ `CandidatePanel.test.tsx`(新)
- `src/components/agentRuntime/TabsWorkspace.tsx` — 渲染「候选池」tab

**文档:** `项目执行跟踪矩阵.md` — +RQ 条目

---

## Task 1: 数据模型(6 张表)

**Files:**
- Modify: `backend/models.py`(在 `BuffettAiCacheModel` 之后追加)
- Test: `backend/tests/test_candidate_model.py`

**Interfaces:**
- Produces: `StockDailyModel` / `FundamentalPitModel` / `IndexConstituentModel` / `FetchLogModel` / `CandidateSnapshotModel` / `CandidatePoolModel`(后续 Task 全靠这些表名与字段)

- [ ] **Step 1: 写失败测试** `backend/tests/test_candidate_model.py`

```python
def test_candidate_models_fields():
    from models import (StockDailyModel, FundamentalPitModel, IndexConstituentModel,
                        FetchLogModel, CandidateSnapshotModel, CandidatePoolModel)
    from sqlalchemy import inspect

    def cols(model):
        return {c.name: c for c in inspect(model).columns}

    sd = cols(StockDailyModel)
    assert set(sd) >= {"code", "trade_date", "close", "adj_factor", "pe_ttm", "total_mv"}
    assert sd["code"].primary_key and sd["trade_date"].primary_key

    fp = cols(FundamentalPitModel)
    assert set(fp) >= {"code", "end_date", "ann_date", "roe", "grossprofit_margin", "debt_to_assets"}
    assert fp["ann_date"].primary_key

    ic = cols(IndexConstituentModel)
    assert set(ic) >= {"index_code", "trade_date", "code", "weight"}

    fl = cols(FetchLogModel)
    assert "source" in fl and fl["source"].primary_key

    cs = cols(CandidateSnapshotModel)
    assert set(cs) >= {"id", "run_at", "as_of_date", "strategy_name", "strategy_label",
                       "universe", "params", "count"}

    cp = cols(CandidatePoolModel)
    assert set(cp) >= {"id", "snapshot_id", "rank", "ts_code", "name", "score",
                       "pe_rank", "roe_rank", "momentum_rank", "promoted"}
    # unique(snapshot_id, ts_code)
    tbl = CandidatePoolModel.__table__
    uniq_cols = {tuple(c.name for c in idx.columns) for idx in tbl.indexes if idx.unique}
    assert ("snapshot_id", "ts_code") in uniq_cols
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidate_model.py -v`
Expected: FAIL(`ImportError: cannot import name 'StockDailyModel'`)

- [ ] **Step 3: 实现** 在 `backend/models.py` 末尾(`BuffettAiCacheModel` 之后)追加:

```python
class StockDailyModel(Base):
    """日频主表(行情+估值+复权)。主键 (code, trade_date)。候选池数据底座。"""
    __tablename__ = "stock_daily"
    code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)      # YYYYMMDD
    close = Column(Float)
    adj_factor = Column(Float)
    pe_ttm = Column(Float)
    total_mv = Column(Float)


class FundamentalPitModel(Base):
    """季频财务(PIT 命脉,按 ann_date 对齐)。主键 (code, end_date, ann_date)。
    ML-ready:除 roe 顺手存 grossprofit_margin/debt_to_assets(pillar C 直接用)。"""
    __tablename__ = "fundamental_pit"
    code = Column(String(12), primary_key=True)
    end_date = Column(String(8), primary_key=True)
    ann_date = Column(String(8), primary_key=True)
    roe = Column(Float)
    grossprofit_margin = Column(Float)
    debt_to_assets = Column(Float)


class IndexConstituentModel(Base):
    """指数成分(PIT 时变成分)。主键 (index_code, trade_date, code)。"""
    __tablename__ = "index_constituent"
    index_code = Column(String(12), primary_key=True)
    trade_date = Column(String(8), primary_key=True)
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


class CandidateSnapshotModel(Base):
    """一次跑策略 = 一行。保留全部历史。"""
    __tablename__ = "candidate_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    as_of_date = Column(String(8))
    strategy_name = Column(String(32), nullable=False)
    strategy_label = Column(String(32))
    universe = Column(String(12), default="000300.SH")
    params = Column(MySQLJSON, nullable=False, default=dict)
    count = Column(Integer, nullable=False, default=0)


class CandidatePoolModel(Base):
    """候选池行。外键 snapshot_id。"""
    __tablename__ = "candidate_pool"
    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_id = Column(Integer, ForeignKey("candidate_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    ts_code = Column(String(32), nullable=False)
    name = Column(String(64))
    industry = Column(String(40))
    score = Column(Float)
    pe_rank = Column(Float)
    roe_rank = Column(Float)
    momentum_rank = Column(Float)
    promoted = Column(Boolean, nullable=False, default=False)
    promoted_at = Column(DateTime)
    __table_args__ = (
        Index("uniq_snap_code", "snapshot_id", "ts_code", unique=True),
    )
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidate_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_candidate_model.py
git commit -m "feat(candidate-pool): 数据底座 + 候选池 6 张表 (RQ-A1)"
```

---

## Task 2: 打分纯函数 `rank_composite_score`

**Files:**
- Create: `backend/scripts/screener.py`(本 Task 只写纯函数 + dataclass + ABC 骨架)
- Test: `backend/tests/test_screener.py`

**Interfaces:**
- Produces: `Candidate`(dataclass)、`Strategy`(ABC)、`rank_composite_score(rows, params) -> list[Candidate]`、`DEFAULT_PARAMS`、`PRESETS`
- params 形状(全 plan 统一):`{w_pe, w_roe, w_mom, window, top_n, pe_filter, roe_min, mom_top_pct}`
- Candidate 字段:`ts_code, name, industry, score, pe_rank, roe_rank, momentum_rank`(秩与 score 均 0-100,越高越好;score=加权复合秩)

- [ ] **Step 1: 写失败测试** `backend/tests/test_screener.py`

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

P = dict(w_pe=0.3, w_roe=0.3, w_mom=0.4, window=252, top_n=30,
         pe_filter=True, roe_min=12.0, mom_top_pct=40.0)


def _row(code, pe, roe, mom, name="N", industry="I"):
    return {"code": code, "name": name, "industry": industry,
            "pe": pe, "roe": roe, "momentum": mom}


def test_score_directions_pe_cheaper_higher():
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.1), _row("B", pe=40, roe=20, mom=0.1)]
    out = {c.ts_code: c for c in rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100})}
    assert out["A"].pe_rank > out["B"].pe_rank          # PE 更便宜 → 秩更高


def test_score_directions_roe_momentum_higher_better():
    from screener import rank_composite_score
    rows = [_row("A", pe=10, roe=25, mom=0.3), _row("B", pe=10, roe=10, mom=-0.1)]
    out = {c.ts_code: c for c in rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100})}
    assert out["A"].roe_rank > out["B"].roe_rank
    assert out["A"].momentum_rank > out["B"].momentum_rank


def test_hard_filter_pe_roe():
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.2),
            _row("B", pe=-5, roe=20, mom=0.2),    # PE<=0 滤掉
            _row("C", pe=10, roe=5, mom=0.2)]      # ROE<12 滤掉
    out = rank_composite_score(rows, P)
    assert {c.ts_code for c in out} == {"A"}


def test_momentum_top_pct_filter_uses_universe():
    """动量前40% 基于 universe(过滤前全体)的下沿,非 survivors 内。"""
    from screener import rank_composite_score
    # 10 只,动量 0..9;top40% 下沿 = quantile(0.6)=6 → 仅 mom>=6 留
    rows = [_row(str(i), pe=10, roe=20, mom=i * 0.01) for i in range(10)]
    out = rank_composite_score(rows, {**P, "roe_min": 0})
    assert {c.ts_code for c in out} == {"6", "7", "8", "9"}


def test_top_n_truncation_and_ranking():
    from screener import rank_composite_score
    rows = [_row(str(i), pe=10 + i, roe=20, mom=0.5 - i * 0.01) for i in range(10)]
    out = rank_composite_score(rows, {**P, "roe_min": 0, "mom_top_pct": 100, "top_n": 3})
    assert len(out) == 3
    assert out[0].score >= out[1].score >= out[2].score   # 按 score 降序
    assert out[0].rank == 1 and out[1].rank == 2


def test_weight_zero_exits_factor():
    """w_pe=0 → PE 不影响排序(纯动量+ROE)。"""
    from screener import rank_composite_score
    rows = [_row("A", pe=8, roe=20, mom=0.5), _row("B", pe=80, roe=20, mom=0.5)]
    out = rank_composite_score(rows, {**P, "w_pe": 0.0, "w_mom": 0.5,
                                      "roe_min": 0, "mom_top_pct": 100})
    # PE 差异巨大但权重 0 → 两只 score 应近似相等
    a = next(c for c in out if c.ts_code == "A")
    b = next(c for c in out if c.ts_code == "B")
    assert abs(a.score - b.score) < 1.0


def test_empty_rows_returns_empty():
    from screener import rank_composite_score
    assert rank_composite_score([], P) == []


def test_all_filtered_returns_empty():
    from screener import rank_composite_score
    rows = [_row("A", pe=-1, roe=20, mom=0.2)]
    assert rank_composite_score(rows, P) == []
```

> 注:`test_top_n_truncation_and_ranking` 用到 `Candidate.rank` —— 在 Step 3 实现里 `rank` 由调用方(列表下标)赋值还是函数内赋?**函数内赋**(`enumerate` 从 1)。测试断言 `out[0].rank==1`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_screener.py -v`
Expected: FAIL(`ModuleNotFoundError: screener`)

- [ ] **Step 3: 实现** `backend/scripts/screener.py`

```python
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_screener.py -v`
Expected: PASS(8 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/screener.py backend/tests/test_screener.py
git commit -m "feat(candidate-pool): rank-composite 打分纯函数 (RQ-A2)"
```

---

## Task 3: DB 加载层 + PIT + Strategy 注册

**Files:**
- Modify: `backend/scripts/screener.py`(追加 DB 加载 + `RankCompositeStrategy` + `STRATEGIES` + `compute_candidates`)
- Test: `backend/tests/test_screener.py`(追加 PIT 用例)

**Interfaces:**
- Consumes: Task 1 的 `StockDailyModel`/`FundamentalPitModel`/`IndexConstituentModel`
- Produces: `RankCompositeStrategy`、`STRATEGIES`、`compute_candidates(db, strategy_name, params, as_of_date=None) -> list[Candidate]`(router 与工具调这个;测试可 monkeypatch)

- [ ] **Step 1: 写失败测试**(追加到 `backend/tests/test_screener.py`)

```python
@pytest_warmup = None  # placeholder 删除
```
实际追加:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def memdb():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__])
    Session = sessionmaker(bind=eng)
    db = Session()
    yield db
    db.close()


def _seed(db, model, rows):
    for r in rows:
        db.add(model(**r))
    db.commit()


def test_pit_roe_uses_ann_date_le_as_of(memdb):
    """as_of_date 之后的财报不可见(防前视)。"""
    from screener import RankCompositeStrategy
    _seed(memdb, models.FundamentalPitModel, [
        {"code": "A", "end_date": "20231231", "ann_date": "20240301", "roe": 15.0},
        {"code": "A", "end_date": "20241231", "ann_date": "20250301", "roe": 25.0},
        {"code": "A", "end_date": "20251231", "ann_date": "20260301", "roe": 35.0},
    ])
    strat = RankCompositeStrategy()
    roe = strat._latest_roe(memdb, "A", as_of_date="20240601")   # 只能看 20240301 这期
    assert roe == 15.0
    roe2 = strat._latest_roe(memdb, "A", as_of_date="20250601")
    assert roe2 == 25.0


def test_compute_candidates_end_to_end(memdb):
    """3 只 universe,只 A 过滤+排序第一。"""
    from screener import compute_candidates
    _seed(memdb, models.IndexConstituentModel, [
        {"index_code": "000300.SH", "trade_date": "20260710", "code": "A", "weight": 0.4},
        {"index_code": "000300.SH", "trade_date": "20260710", "code": "B", "weight": 0.3},
        {"index_code": "000300.SH", "trade_date": "20260710", "code": "C", "weight": 0.3},
    ])
    _seed(memdb, models.StockDailyModel, [
        {"code": "A", "trade_date": "20260710", "close": 10.0, "adj_factor": 2.0, "pe_ttm": 8.0, "total_mv": 1e5},
        {"code": "B", "trade_date": "20260710", "close": 10.0, "adj_factor": 1.0, "pe_ttm": 40.0, "total_mv": 1e5},
        {"code": "C", "trade_date": "20260710", "close": 10.0, "adj_factor": 1.0, "pe_ttm": 10.0, "total_mv": 1e5},
    ])
    _seed(memdb, models.FundamentalPitModel, [
        {"code": "A", "end_date": "20251231", "ann_date": "20260301", "roe": 25.0},
        {"code": "B", "end_date": "20251231", "ann_date": "20260301", "roe": 5.0},   # ROE<12 滤掉
        {"code": "C", "end_date": "20251231", "ann_date": "20260301", "roe": 20.0},
    ])
    cands = compute_candidates(memdb, "rank_composite",
                               {"w_pe": 0.3, "w_roe": 0.3, "w_mom": 0.4, "window": 252,
                                "top_n": 10, "pe_filter": True, "roe_min": 12.0, "mom_top_pct": 100},
                               as_of_date="20260710")
    codes = [c.ts_code for c in cands]
    assert "B" not in codes
    assert cands[0].ts_code == "A"            # A: PE 最便宜+ROE 高 → 第一


def test_compute_candidates_unknown_strategy_raises(memdb):
    from screener import compute_candidates
    with pytest.raises(ValueError):
        compute_candidates(memdb, "nope", {}, as_of_date="20260710")
```

> 动量窗 252 但 seed 只有 1 天 → 动量算不出(历史不足)。实现里**历史不足时 momentum=None → 该股被 mom_top_pct 过滤**。为让 `test_compute_candidates_end_to_end` 可断言,该用例设 `mom_top_pct=100`(不过滤动量)且 `window` 在历史不足时退化为「有就取比值,不足 None」。实现需处理:`_momentum` 历史不足返回 None,`rank_composite_score` 里 None momentum 会被 `>= mom_cut` 判 False——但 mom_top_pct=100 时 mom_cut=最低分位,None 仍判 False。**所以历史不足的股都会被滤掉**。为让用例 A/C 存活,seed 需给 A/C 足够历史。**修正用例**:给 A/B/C 各 seed 253 天 close(或实现里 window 历史不足时 momentum=0.0 而非 None)。选**实现侧**:历史不足 → momentum=0.0(中性),这样 mom_top_pct=100 时不会因 None 被滤。更新 Step 3 实现与此一致。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_screener.py -v`
Expected: FAIL(`ImportError: cannot import name 'RankCompositeStrategy'`)

- [ ] **Step 3: 实现** 追加到 `backend/scripts/screener.py`:

```python
# ---- DB 加载层 + Strategy 实现 ----
from sqlalchemy.orm import Session


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
        adj = [c * (f or 1.0) for c, f in rows]
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


STRATEGIES: dict[str, Strategy] = {"rank_composite": RankCompositeStrategy()}


def compute_candidates(db: Session, strategy_name: str, params: dict,
                       as_of_date: str | None = None) -> list[Candidate]:
    strat = STRATEGIES.get(strategy_name)
    if not strat:
        raise ValueError(f"未知策略: {strategy_name}")
    return strat.run(db, as_of_date, params)
```

> `import models` 与 `DEFAULT_PARAMS` 已在文件顶部;`models` 在 `screener.py` 里需 import —— 在文件顶部加 `import models`(脚本经 sys.path 引入,见 router 的 path 注入)。`database.Base` 不需要(screener 不建表)。**在 Step 3 同时把 `import models` 加到 screener.py 顶部 import 区。**

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_screener.py -v`
Expected: PASS(11 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/screener.py backend/tests/test_screener.py
git commit -m "feat(candidate-pool): DB 加载层 + PIT + RankCompositeStrategy (RQ-A3)"
```

---

## Task 4: 批量抓取脚本

**Files:**
- Create: `backend/scripts/fetch_candidates_data.py`
- Test: `backend/tests/test_fetch_candidates_data.py`

**Interfaces:**
- Produces: `fetch_all(pro, db, index_code="000300.SH", start_date="20200101", sleep=0.3) -> dict`(返回各表写入行数),`__main__` 构造真实 `pro` + `SessionLocal` 调用它。测试用 fake `pro` + sqlite。

- [ ] **Step 1: 写失败测试** `backend/tests/test_fetch_candidates_data.py`

```python
import os, sys
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__,
                                          models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng)
    yield S()


class FakePro:
    """假 tushare pro。"""
    def index_weight(self, index_code, **_):
        import pandas as pd
        return pd.DataFrame([
            {"trade_date": "20260101", "code": "A.SH", "weight": 0.5},
            {"trade_date": "20260101", "code": "B.SH", "weight": 0.5},
        ])
    def daily(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "close": 10.0}])
    def daily_basic(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "pe_ttm": 12.0, "total_mv": 1e5}])
    def adj_factor(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260710", "adj_factor": 1.5}])
    def fina_indicator(self, ts_code):  # 注意:不传 fields
        import pandas as pd
        return pd.DataFrame([{"end_date": "20251231", "ann_date": "20260301",
                              "roe": 18.0, "grossprofit_margin": 40.0, "debt_to_assets": 30.0}])


class CrashPro:
    def index_weight(self, **_):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20260101", "code": "A.SH", "weight": 1.0}])
    def daily(self, **_):
        raise RuntimeError("tushare 500")
    def daily_basic(self, **_):
        raise RuntimeError("x")
    def adj_factor(self, **_):
        raise RuntimeError("x")
    def fina_indicator(self, **_):
        raise RuntimeError("x")


def test_fetch_writes_three_tables(db):
    from fetch_candidates_data import fetch_all
    counts = fetch_all(FakePro(), db, sleep=0)
    assert db.query(models.StockDailyModel).count() == 2          # A,B 各 1 行
    assert db.query(models.FundamentalPitModel).count() == 2
    assert db.query(models.IndexConstituentModel).count() == 2
    assert counts["stock_daily"] == 2


def test_fetch_idempotent_rerun_no_duplicate(db):
    from fetch_candidates_data import fetch_all
    fetch_all(FakePro(), db, sleep=0)
    fetch_all(FakePro(), db, sleep=0)
    assert db.query(models.StockDailyModel).count() == 2          # 重跑不重复
    assert db.query(models.FundamentalPitModel).count() == 2


def test_fetch_per_code_failure_continues(db):
    from fetch_candidates_data import fetch_all
    counts = fetch_all(CrashPro(), db, sleep=0)
    assert counts["stock_daily"] == 0                              # 全失败但没崩
    assert counts["index_constituent"] == 1                       # index_weight 没崩
    assert db.query(models.FetchLogModel).count() == 1            # 回写了 log
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_fetch_candidates_data.py -v`
Expected: FAIL(`ModuleNotFoundError: fetch_candidates_data`)

- [ ] **Step 3: 实现** `backend/scripts/fetch_candidates_data.py`

```python
"""候选池数据底座批量抓取。
run: cd backend && python scripts/fetch_candidates_data.py [--start 20200101]
读 settings.tushare_token(付费 token)。全量抓,逐股 try/except 不整批崩,重跑幂等。
"""
import os, sys, time, argparse
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))   # backend/ → config/database/models

import pandas as pd
from sqlalchemy.orm import Session

from config import settings
from database import SessionLocal
import models


def _fetch_constituents(pro, db, index_code):
    df = pro.index_weight(index_code=index_code)
    if df is None or df.empty:
        return 0
    db.query(models.IndexConstituentModel).delete()
    n = 0
    for _, r in df.iterrows():
        db.add(models.IndexConstituentModel(
            index_code=index_code, trade_date=str(r["trade_date"]),
            code=r["code"], weight=float(r.get("weight") or 0)))
        n += 1
    db.commit()
    return n


def _merge_daily(pro, ts_code, start_date, end_date):
    """合并 daily + daily_basic + adj_factor → stock_daily 行列表。"""
    daily = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
    basic = pro.daily_basic(ts_code=ts_code, start_date=start_date, end_date=end_date)
    adj = pro.adj_factor(ts_code=ts_code, start_date=start_date, end_date=end_date)
    if daily is None or daily.empty:
        return []
    d = daily.set_index("trade_date")
    b = basic.set_index("trade_date")[["pe_ttm", "total_mv"]] if basic is not None and not basic.empty else pd.DataFrame()
    a = adj.set_index("trade_date")[["adj_factor"]] if adj is not None and not adj.empty else pd.DataFrame()
    joined = d.join(b, how="left").join(a, how="left").reset_index()
    rows = []
    for _, r in joined.iterrows():
        rows.append({
            "code": ts_code, "trade_date": str(r["trade_date"]),
            "close": float(r.get("close") or 0),
            "adj_factor": float(r["adj_factor"]) if pd.notna(r.get("adj_factor")) else None,
            "pe_ttm": float(r["pe_ttm"]) if pd.notna(r.get("pe_ttm")) else None,
            "total_mv": float(r["total_mv"]) if pd.notna(r.get("total_mv")) else None,
        })
    return rows


def _fetch_fundamentals(pro, ts_code):
    """fina_indicator 不传 fields(保 ann_date)。年报(end_date 末四位=1231)去重留最新 ann_date。"""
    df = pro.fina_indicator(ts_code=ts_code)
    if df is None or df.empty or "ann_date" not in df.columns:
        return []
    df = df.dropna(subset=["ann_date"])
    annual = df[df["end_date"].astype(str).str.endswith("1231")] if "end_date" in df.columns else df
    annual = annual.sort_values(["end_date", "ann_date"]).drop_duplicates("end_date", keep="last")
    rows = []
    for _, r in annual.iterrows():
        rows.append({
            "code": ts_code, "end_date": str(r["end_date"]), "ann_date": str(r["ann_date"]),
            "roe": float(r["roe"]) if pd.notna(r.get("roe")) else None,
            "grossprofit_margin": float(r["grossprofit_margin"]) if pd.notna(r.get("grossprofit_margin")) else None,
            "debt_to_assets": float(r["debt_to_assets"]) if pd.notna(r.get("debt_to_assets")) else None,
        })
    return rows


def fetch_all(pro, db: Session, index_code="000300.SH", start_date="20200101",
              end_date=None, sleep=0.3) -> dict:
    """全量抓。逐股 try/except 失败 continue。幂等(每股 DELETE+INSERT)。"""
    end_date = end_date or datetime.now().strftime("%Y%m%d")
    counts = {"index_constituent": 0, "stock_daily": 0, "fundamental_pit": 0}
    fail = 0

    try:
        counts["index_constituent"] = _fetch_constituents(pro, db, index_code)
    except Exception as e:
        print(f"[warn] index_weight 失败: {e}")

    codes = [r.code for r in db.query(models.IndexConstituentModel.code).filter(
        models.IndexConstituentModel.index_code == index_code).distinct()]
    for i, code in enumerate(codes):
        try:
            # stock_daily
            sd = _merge_daily(pro, code, start_date, end_date)
            db.query(models.StockDailyModel).filter(models.StockDailyModel.code == code).delete()
            for r in sd:
                db.add(models.StockDailyModel(**r))
            # fundamental_pit
            fp = _fetch_fundamentals(pro, code)
            db.query(models.FundamentalPitModel).filter(models.FundamentalPitModel.code == code).delete()
            for r in fp:
                db.add(models.FundamentalPitModel(**r))
            db.commit()
            counts["stock_daily"] += len(sd)
            counts["fundamental_pit"] += len(fp)
        except Exception as e:
            fail += 1
            db.rollback()
            print(f"[warn] {code} 抓取失败: {e}")
        if sleep:
            time.sleep(sleep)
        if (i + 1) % 50 == 0:
            print(f"[progress] {i+1}/{len(codes)}")

    db.merge(models.FetchLogModel(
        source="stock_daily", last_anchor_date=end_date,
        last_updated_at=datetime.utcnow(),
        rows_total=db.query(models.StockDailyModel).count(),
        note=f"codes={len(codes)} fail={fail}"))
    db.commit()
    print(f"[done] {counts} codes={len(codes)} fail={fail}")
    return counts


if __name__ == "__main__":
    import tushare as ts
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="20200101")
    ap.add_argument("--end", default=None)
    args = ap.parse_args()
    token = settings.tushare_token.strip()
    if not token:
        sys.exit("tushare_token 未配置(settings.tushare_token)")
    pro = ts.pro_api(token)
    db = SessionLocal()
    try:
        fetch_all(pro, db, start_date=args.start, end_date=args.end)
    finally:
        db.close()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_fetch_candidates_data.py -v`
Expected: PASS(3 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/fetch_candidates_data.py backend/tests/test_fetch_candidates_data.py
git commit -m "feat(candidate-pool): 数据底座批量抓取脚本 (RQ-A4)"
```

---

## Task 5: 候选池 router

**Files:**
- Create: `backend/routers/candidates.py`
- Modify: `backend/main.py`(注册 router)
- Test: `backend/tests/test_candidates_router.py`

**Interfaces:**
- Consumes: `compute_candidates`、`PRESETS`、`DEFAULT_PARAMS`(from screener);Task 1 全部模型;`WatchlistModel`(promote)
- Produces: `POST /api/db/candidates/run`、`GET /api/db/candidates/strategies`、`GET /api/db/candidates/snapshots`、`GET /api/db/candidates`、`POST /api/db/candidates/{sid}/promote/{ts_code}`

- [ ] **Step 1: 写失败测试** `backend/tests/test_candidates_router.py`

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db
import models
from screener import Candidate


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.CandidateSnapshotModel.__table__,
                                          models.CandidatePoolModel.__table__,
                                          models.WatchlistModel.__table__])
    S = sessionmaker(bind=eng)
    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()
    main.app.dependency_overrides[get_db] = _db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_run_empty_data_returns_409(client):
    r = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"})
    assert r.status_code == 409
    assert "fetch" in r.json()["detail"]


def test_run_happy_creates_snapshot_and_pool(client, monkeypatch):
    # 假装底座有数据
    from routers import candidates as cands
    # 绕过空底座检查:直接塞一行 stock_daily
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()

    fake = [Candidate(ts_code="A.SH", name="甲", industry="I", score=90.0,
                      pe_rank=80.0, roe_rank=70.0, momentum_rank=95.0, rank=1)]
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: fake)

    r = client.post("/api/db/candidates/run", json={"strategy": "rank_composite",
                                                     "label": "多因子平衡"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    sid = body["snapshot_id"]
    # snapshot 落库
    snap = db.query(models.CandidateSnapshotModel).get(sid)
    assert snap.strategy_name == "rank_composite"
    assert snap.strategy_label == "多因子平衡"
    assert snap.params["w_pe"] == 0.3
    # pool 落库
    rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid).all()
    assert len(rows) == 1 and rows[0].ts_code == "A.SH" and rows[0].rank == 1


def test_run_custom_params_stored(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    captured = {}
    def fake(db, strategy, params, as_of_date=None):
        captured["params"] = params
        return []
    monkeypatch.setattr(cands, "compute_candidates", fake)
    r = client.post("/api/db/candidates/run", json={
        "strategy": "rank_composite", "label": "自定义",
        "params": {"w_pe": 0.5, "w_roe": 0.5, "w_mom": 0.0, "top_n": 10}})
    assert r.status_code == 200
    assert captured["params"]["w_pe"] == 0.5


def test_strategies_endpoint(client):
    r = client.get("/api/db/candidates/strategies")
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["strategies"]]
    assert "rank_composite" in names
    assert "多因子平衡" in r.json()["presets"]


def test_snapshots_list_and_candidates_default_latest(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: [
        Candidate(ts_code="A.SH", name="甲", industry="I", score=90, pe_rank=80, roe_rank=70, momentum_rank=95, rank=1)])
    sid = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"}).json()["snapshot_id"]

    snaps = client.get("/api/db/candidates/snapshots").json()
    assert len(snaps) == 1 and snaps[0]["id"] == sid

    lst = client.get("/api/db/candidates").json()       # 默认最新
    assert lst["snapshot_id"] == sid
    assert lst["items"][0]["ts_code"] == "A.SH"


def test_promote_inserts_watchlist_and_marks(client, monkeypatch):
    from routers import candidates as cands
    db = next(main.app.dependency_overrides[get_db]())
    db.add(models.StockDailyModel(code="A", trade_date="20260710", close=10, adj_factor=1, pe_ttm=10, total_mv=1e5))
    db.commit()
    monkeypatch.setattr(cands, "compute_candidates", lambda *a, **k: [
        Candidate(ts_code="A.SH", name="甲", industry="I", score=90, pe_rank=80, roe_rank=70, momentum_rank=95, rank=1)])
    sid = client.post("/api/db/candidates/run", json={"strategy": "rank_composite"}).json()["snapshot_id"]

    r = client.post(f"/api/db/candidates/{sid}/promote/A.SH")
    assert r.status_code == 200
    assert db.query(models.WatchlistModel).filter_by(ts_code="A.SH").count() == 1
    assert db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid, ts_code="A.SH").first().promoted is True

    # 防重:再 promote 不重复入 watchlist
    client.post(f"/api/db/candidates/{sid}/promote/A.SH")
    assert db.query(models.WatchlistModel).filter_by(ts_code="A.SH").count() == 1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidates_router.py -v`
Expected: FAIL(`ImportError: cannot import name 'candidates'` from routers 或 404)

- [ ] **Step 3: 实现** `backend/routers/candidates.py`

```python
import os, sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models

# 让 router 能 import screener(在 backend/scripts)
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS  # noqa: E402

router = APIRouter(prefix="/api/db", tags=["candidates"])


def _resolve_params(label: str | None, params: dict | None) -> dict:
    if params:                                  # 自定义优先
        return {**DEFAULT_PARAMS, **params}
    if label and label in PRESETS:              # 预设
        return dict(PRESETS[label])
    return dict(DEFAULT_PARAMS)


@router.get("/candidates/strategies")
def list_strategies():
    return {"strategies": [{"name": "rank_composite", "label": "rank-composite 横截面秩复合"}],
            "presets": {k: dict(v) for k, v in PRESETS.items()}}


@router.post("/candidates/run")
def run(payload: dict, db: Session = Depends(get_db)):
    strategy = payload.get("strategy", "rank_composite")
    if strategy != "rank_composite":
        raise HTTPException(status_code=400, detail=f"v1 仅支持 rank_composite: {strategy}")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(status_code=409, detail="数据底座为空,先跑 scripts/fetch_candidates_data.py")
    label = payload.get("label")
    params = _resolve_params(label, payload.get("params"))

    candidates = compute_candidates(db, strategy, params)        # as_of 默认最新交易日

    snap = models.CandidateSnapshotModel(
        run_at=datetime.utcnow(),
        strategy_name=strategy, strategy_label=label or "自定义",
        universe="000300.SH", params=params, count=len(candidates))
    db.add(snap)
    db.flush()
    for c in candidates:
        db.add(models.CandidatePoolModel(
            snapshot_id=snap.id, rank=c.rank, ts_code=c.ts_code, name=c.name,
            industry=c.industry, score=c.score, pe_rank=c.pe_rank,
            roe_rank=c.roe_rank, momentum_rank=c.momentum_rank))
    db.commit()
    return {"snapshot_id": snap.id, "count": snap.count, "as_of_date": snap.as_of_date}


@router.get("/candidates/snapshots")
def list_snapshots(db: Session = Depends(get_db)):
    rows = db.query(models.CandidateSnapshotModel).order_by(
        models.CandidateSnapshotModel.run_at.desc()).all()
    return [{"id": r.id, "run_at": r.run_at.isoformat() if r.run_at else None,
             "as_of_date": r.as_of_date, "strategy_name": r.strategy_name,
             "strategy_label": r.strategy_label, "count": r.count, "params": r.params}
            for r in rows]


@router.get("/candidates")
def list_candidates(snapshot_id: int | None = None, db: Session = Depends(get_db)):
    if not snapshot_id:
        last = db.query(models.CandidateSnapshotModel).order_by(
            models.CandidateSnapshotModel.run_at.desc()).first()
        if not last:
            return {"snapshot_id": None, "items": []}
        snapshot_id = last.id
    rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=snapshot_id).order_by(
        models.CandidatePoolModel.rank.asc()).all()
    return {"snapshot_id": snapshot_id,
            "items": [{"id": r.id, "rank": r.rank, "ts_code": r.ts_code, "name": r.name,
                       "industry": r.industry, "score": r.score, "pe_rank": r.pe_rank,
                       "roe_rank": r.roe_rank, "momentum_rank": r.momentum_rank,
                       "promoted": r.promoted} for r in rows]}


@router.post("/candidates/{snapshot_id}/promote/{ts_code}")
def promote(snapshot_id: int, ts_code: str, db: Session = Depends(get_db)):
    row = db.query(models.CandidatePoolModel).filter_by(snapshot_id=snapshot_id, ts_code=ts_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="该候选不在快照中")
    # 防重入 watchlist
    exists = db.query(models.WatchlistModel).filter_by(ts_code=ts_code).first()
    if not exists:
        db.add(models.WatchlistModel(ts_code=ts_code, name=row.name))
    row.promoted = True
    row.promoted_at = datetime.utcnow()
    db.commit()
    return {"promoted": ts_code, "already_in_watchlist": exists is not None}
```

注册到 `backend/main.py`:在 `from routers import sessions, migrate, files, settings, insights, watchlist` 改为加 `candidates`:
```python
from routers import sessions, migrate, files, settings, insights, watchlist, candidates
```
末尾加:
```python
app.include_router(candidates.router)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidates_router.py -v`
Expected: PASS(6 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/candidates.py backend/main.py backend/tests/test_candidates_router.py
git commit -m "feat(candidate-pool): 候选池 router (run/strategies/snapshots/list/promote) (RQ-B5)"
```

---

## Task 6: invest_agent 工具(3 个)

**Files:**
- Create: `backend/runtime/tools/candidates.py`
- Modify: `backend/runtime/tools/__init__.py`(加 `from . import candidates`)
- Test: `backend/tests/test_candidates_tool.py`

**Interfaces:**
- Consumes: `compute_candidates`(screener)、Task 1 模型
- Produces: 注册工具 `run_screener` / `list_candidates` / `promote_candidate`

- [ ] **Step 1: 写失败测试** `backend/tests/test_candidates_tool.py`

```python
import os, sys, json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base, SessionLocal
import database


@pytest.fixture
def patch_session(monkeypatch):
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.CandidateSnapshotModel.__table__,
                                          models.CandidatePoolModel.__table__,
                                          models.WatchlistModel.__table__])
    S = sessionmaker(bind=eng)
    monkeypatch.setattr(database, "SessionLocal", lambda: S())


@pytest.mark.asyncio
async def test_list_candidates_empty(patch_session):
    from runtime.tools.candidates import ListCandidatesTool
    out = await ListCandidatesTool().execute()
    body = json.loads(out)
    assert body["count"] == 0


@pytest.mark.asyncio
async def test_run_screener_uses_default_preset(patch_session, monkeypatch):
    from runtime.tools import candidates as ct
    called = {}
    def fake(db, strategy, params, as_of_date=None):
        called["strategy"] = strategy
        return []
    monkeypatch.setattr(ct, "compute_candidates", fake)
    out = await ct.RunScreenerTool().execute()
    body = json.loads(out)
    assert body["count"] == 0
    assert called["strategy"] == "rank_composite"


@pytest.mark.asyncio
async def test_promote_candidate(patch_session, monkeypatch):
    from runtime.tools import candidates as ct
    # 先塞一个候选池行
    db = database.SessionLocal()
    snap = models.CandidateSnapshotModel(strategy_name="rank_composite", params={}, count=1)
    db.add(snap); db.flush()
    db.add(models.CandidatePoolModel(snapshot_id=snap.id, rank=1, ts_code="A.SH", name="甲", score=90))
    db.commit(); db.close()
    out = await ct.PromoteCandidateTool().execute(ts_code="A.SH", snapshot_id=snap.id)
    assert "A.SH" in out
```

> 需 `pytest-asyncio`。确认 `backend/requirements.txt` 有;若无,加 `pytest-asyncio` 并 `conftest` 或 `pytest.ini` 设 `asyncio_mode=auto`。**先查 `backend/tests/test_watchlist_tool.py` 是否已用 async**——若有,沿用其模式(无需额外配置)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidates_tool.py -v`
Expected: FAIL(`ModuleNotFoundError`)

- [ ] **Step 3: 实现** `backend/runtime/tools/candidates.py`(镜像 `tools/watchlist.py`)

```python
"""候选池工具(invest agent):跑策略 / 列候选 / 晋升自选股。"""
from __future__ import annotations
import json, os, sys
from typing import Any

from database import SessionLocal
import models
from .registry import register_tool

# 引入 screener(backend/scripts)
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from screener import compute_candidates, PRESETS, DEFAULT_PARAMS  # noqa: E402


class RunScreenerTool:
    name = "run_screener"
    description = ("跑一次策略选股(默认「多因子平衡」rank-composite),生成最新候选池快照。"
                   "可选传 label(预设)或 params(自定义)。返回快照 id + 命中数。")
    input_schema = {
        "type": "object", "properties": {
            "label": {"type": "string", "description": "预设名:多因子平衡/价值+质量/纯动量/价值+动量"},
            "params": {"type": "object", "description": "自定义参数(覆盖预设)"},
        },
    }

    async def execute(self, **params: Any) -> str:
        label = params.get("label", "多因子平衡")
        custom = params.get("params")
        p = {**DEFAULT_PARAMS, **custom} if custom else dict(PRESETS.get(label, DEFAULT_PARAMS))
        db = SessionLocal()
        try:
            if db.query(models.StockDailyModel).count() == 0:
                return json.dumps({"error": "数据底座为空,先跑 fetch_candidates_data.py"}, ensure_ascii=False)
            cands = compute_candidates(db, "rank_composite", p)
            from datetime import datetime
            snap = models.CandidateSnapshotModel(run_at=datetime.utcnow(),
                strategy_name="rank_composite", strategy_label=label,
                universe="000300.SH", params=p, count=len(cands))
            db.add(snap); db.flush()
            for c in cands:
                db.add(models.CandidatePoolModel(snapshot_id=snap.id, rank=c.rank, ts_code=c.ts_code,
                    name=c.name, industry=c.industry, score=c.score, pe_rank=c.pe_rank,
                    roe_rank=c.roe_rank, momentum_rank=c.momentum_rank))
            db.commit()
            return json.dumps({"snapshot_id": snap.id, "count": snap.count,
                               "top": [{"code": c.ts_code, "name": c.name, "score": c.score} for c in cands[:5]]},
                              ensure_ascii=False)
        finally:
            db.close()


class ListCandidatesTool:
    name = "list_candidates"
    description = "列出最新候选池 top30(或指定 snapshot_id 的历史快照)。"
    input_schema = {"type": "object", "properties": {"snapshot_id": {"type": "integer"}}}

    async def execute(self, **params: Any) -> str:
        db = SessionLocal()
        try:
            sid = params.get("snapshot_id")
            if not sid:
                last = db.query(models.CandidateSnapshotModel).order_by(
                    models.CandidateSnapshotModel.run_at.desc()).first()
                sid = last.id if last else None
            if not sid:
                return json.dumps({"count": 0, "items": []}, ensure_ascii=False)
            rows = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid).order_by(
                models.CandidatePoolModel.rank.asc()).all()
            return json.dumps({"snapshot_id": sid, "count": len(rows), "items": [
                {"rank": r.rank, "ts_code": r.ts_code, "name": r.name, "score": r.score,
                 "pe_rank": r.pe_rank, "roe_rank": r.roe_rank, "momentum_rank": r.momentum_rank}
                for r in rows]}, ensure_ascii=False)
        finally:
            db.close()


class PromoteCandidateTool:
    name = "promote_candidate"
    description = "把候选池里的某只股票晋升到自选股(防重)。需 ts_code,可选 snapshot_id(默认最新)。"
    input_schema = {"type": "object", "properties": {"ts_code": {"type": "string"},
                                                     "snapshot_id": {"type": "integer"}},
                    "required": ["ts_code"]}

    async def execute(self, **params: Any) -> str:
        ts_code = params.get("ts_code", "")
        db = SessionLocal()
        try:
            sid = params.get("snapshot_id")
            if not sid:
                last = db.query(models.CandidateSnapshotModel).order_by(
                    models.CandidateSnapshotModel.run_at.desc()).first()
                sid = last.id if last else None
            row = db.query(models.CandidatePoolModel).filter_by(snapshot_id=sid, ts_code=ts_code).first() if sid else None
            exists = db.query(models.WatchlistModel).filter_by(ts_code=ts_code).first()
            if not exists and row:
                db.add(models.WatchlistModel(ts_code=ts_code, name=row.name))
            if row:
                row.promoted = True; row.promoted_at = datetime.utcnow()
            db.commit()
            return json.dumps({"promoted": ts_code, "already_in_watchlist": exists is not None}, ensure_ascii=False)
        finally:
            db.close()


def _register_default():
    register_tool(RunScreenerTool())
    register_tool(ListCandidatesTool())
    register_tool(PromoteCandidateTool())

_register_default()
```

> 顶部加 `from datetime import datetime`(`PromoteCandidateTool` 用到)——把它移到 import 区,别在函数内 import。

修改 `backend/runtime/tools/__init__.py`:在 `from . import watchlist` 后加一行:
```python
from . import candidates  # noqa: F401  候选池三件套
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_candidates_tool.py -v`
Expected: PASS(3 用例)

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/tools/candidates.py backend/runtime/tools/__init__.py backend/tests/test_candidates_tool.py
git commit -m "feat(candidate-pool): invest_agent 候选池三件套工具 (RQ-B6)"
```

---

## Task 7: invest_agent 配置(tabs + tool_names + prompt)

**Files:**
- Modify: `backend/agents/invest_agent.py`
- Test: `backend/tests/test_invest_agent.py`(追加断言)

**Interfaces:**
- Produces: invest agent 的 tabs 含「候选池」、tool_names 含 3 工具

- [ ] **Step 1: 写失败测试**(看 `test_invest_agent.py` 现有结构后追加;若已有 `test_invest_agent_has_tools` 类似用例则扩展)

```python
def test_invest_agent_has_candidate_pool_tab_and_tools():
    from agents.invest_agent import InvestAgent
    meta = InvestAgent.metadata
    assert "候选池" in (meta.workspace or {}).get("tabs", [])
    assert "run_screener" in InvestAgent.tool_names
    assert "list_candidates" in InvestAgent.tool_names
    assert "promote_candidate" in InvestAgent.tool_names
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_invest_agent.py -v`
Expected: FAIL(`AssertionError`,"候选池" not in tabs)

- [ ] **Step 3: 实现** 改 `backend/agents/invest_agent.py`:

`workspace` tabs 加 `"候选池"`:
```python
workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill", "自选股", "候选池"]},
```
`tool_names` 追加:
```python
tool_names = ["tushare", "Read", "Glob", "Grep",
              "suggest_pin_stock", "pin_stock", "unpin_stock", "list_watchlist",
              "run_screener", "list_candidates", "promote_candidate"]
```
`system_prompt` 在【自选股】段后追加:
```python
        "\n\n【候选池·策略选股】\n"
        "- 用户想「选股/筛一批股票/跑策略/找候选」时,调 run_screener(默认「多因子平衡」,或指定预设 label)生成最新候选池快照。\n"
        "- 用户问「当前候选池/选出了哪些」时调 list_candidates;「把候选的 X 加自选」时调 promote_candidate。\n"
        "- 策略为自研多因子:PE/ROE/动量 横截面秩复合,universe=沪深300,默认 top30。可解释打分逻辑。\n"
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_invest_agent.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/agents/invest_agent.py backend/tests/test_invest_agent.py
git commit -m "feat(candidate-pool): invest_agent 接入候选池 tab+工具 (RQ-B7)"
```

---

## Task 8: 前端 dbApi + CandidatePanel + 测试

**Files:**
- Modify: `src/services/dbApi.ts`(类型 + 5 方法)
- Create: `src/components/agentRuntime/CandidatePanel.tsx`
- Create: `src/components/agentRuntime/CandidatePanel.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 5 个端点
- Produces: `CandidatePanel` 组件(供 Task 9 TabsWorkspace 渲染)、`dbApi.runCandidates/listCandidateSnapshots/listCandidates/listCandidateStrategies/promoteCandidate`

- [ ] **Step 1: 写失败测试** `src/components/agentRuntime/CandidatePanel.test.tsx`

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CandidatePanel from './CandidatePanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    listCandidateStrategies: vi.fn(),
    listCandidateSnapshots: vi.fn(),
    listCandidates: vi.fn(),
    runCandidates: vi.fn(),
    promoteCandidate: vi.fn(),
  },
}));

describe('CandidatePanel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders empty hint when no snapshots', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [{ name: 'rank_composite', label: 'x' }], presets: { '多因子平衡': {} } });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: null, items: [] });
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-panel')).toBeTruthy());
    expect(screen.getByText(/还没跑过策略/)).toBeTruthy();
  });

  it('renders candidate rows from latest snapshot', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([{ id: 1, run_at: '2026-07-11', strategy_label: '多因子平衡', count: 1 }]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: 1, items: [
      { id: 1, rank: 1, ts_code: '600519.SH', name: '贵州茅台', industry: '食品饮料', score: 87.2, pe_rank: 45, roe_rank: 95, momentum_rank: 58, promoted: false },
    ]});
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    expect(screen.getByText('87.2')).toBeTruthy();
  });

  it('clicking run calls runCandidates', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: { '多因子平衡': {} } });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: null, items: [] });
    (dbApi.runCandidates as any).mockResolvedValue({ snapshot_id: 2, count: 3 });
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByTestId('candidate-run-btn')).toBeTruthy());
    fireEvent.click(screen.getByTestId('candidate-run-btn'));
    await waitFor(() => expect(dbApi.runCandidates).toHaveBeenCalled());
  });

  it('promoted row shows disabled 已晋升', async () => {
    (dbApi.listCandidateStrategies as any).mockResolvedValue({ strategies: [], presets: {} });
    (dbApi.listCandidateSnapshots as any).mockResolvedValue([{ id: 1, strategy_label: 'x', count: 1 }]);
    (dbApi.listCandidates as any).mockResolvedValue({ snapshot_id: 1, items: [
      { id: 1, rank: 1, ts_code: '600519.SH', name: '茅台', score: 80, pe_rank: 50, roe_rank: 90, momentum_rank: 50, promoted: true },
    ]});
    render(<CandidatePanel />);
    await waitFor(() => expect(screen.getByText('已晋升')).toBeTruthy());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- CandidatePanel`
Expected: FAIL(`Cannot find module './CandidatePanel'`)

- [ ] **Step 3a: 实现 dbApi** 在 `src/services/dbApi.ts` 的 `WatchlistQuoteItem` 之后加类型,并在 `dbApi` 对象(在 `aiDeepdive` 后)加方法:

```ts
export interface CandidateItem {
  id: number; rank: number; ts_code: string; name: string; industry?: string;
  score: number; pe_rank: number; roe_rank: number; momentum_rank: number;
  promoted: boolean;
}
export interface CandidateSnapshot {
  id: number; run_at?: string; as_of_date?: string;
  strategy_name: string; strategy_label?: string; count: number; params?: Record<string, unknown>;
}
export interface CandidateStrategies {
  strategies: { name: string; label: string }[];
  presets: Record<string, Record<string, unknown>>;
}
```
dbApi 内追加:
```ts
  listCandidateStrategies: () => req<CandidateStrategies>('/candidates/strategies'),
  listCandidateSnapshots: () => req<CandidateSnapshot[]>('/candidates/snapshots'),
  listCandidates: (snapshotId?: number) =>
    req<{ snapshot_id: number | null; items: CandidateItem[] }>(
      `/candidates${snapshotId ? `?snapshot_id=${snapshotId}` : ''}`),
  runCandidates: (payload: { strategy: string; label?: string; params?: Record<string, unknown> }) =>
    req<{ snapshot_id: number; count: number; as_of_date?: string }>(
      '/candidates/run', { method: 'POST', body: JSON.stringify(payload) }),
  promoteCandidate: (snapshotId: number, tsCode: string) =>
    req<{ promoted: string; already_in_watchlist: boolean }>(
      `/candidates/${snapshotId}/promote/${encodeURIComponent(tsTs(tsCode))}`, { method: 'POST' }),
```
> `tsTs` 不存在——直接内联 `encodeURIComponent(tsCode)`。删掉 `tsTs` 引用,改 `encodeURIComponent(tsCode)`。

- [ ] **Step 3b: 实现 CandidatePanel.tsx** `src/components/agentRuntime/CandidatePanel.tsx`(风格镜像 `WatchlistPanel.tsx`,布局对齐 v2 mockup):

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type CandidateItem, type CandidateSnapshot, type CandidateStrategies } from '../../services/dbApi';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, color: '#6b6155', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', color: '#1A1A1A', whiteSpace: 'nowrap' };

const PRESET_LABELS = ['多因子平衡', '价值+质量', '纯动量', '价值+动量', '自定义'] as const;

const CandidatePanel: React.FC = () => {
  const [strategies, setStrategies] = useState<CandidateStrategies | null>(null);
  const [snapshots, setSnapshots] = useState<CandidateSnapshot[]>([]);
  const [current, setCurrent] = useState<{ snapshot_id: number | null; items: CandidateItem[] }>({ snapshot_id: null, items: [] });
  const [label, setLabel] = useState<string>('多因子平衡');
  const [weights, setWeights] = useState({ w_pe: 30, w_roe: 30, w_mom: 40 });
  const [window, setWindow] = useState(252);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openStockTab = useAgentRuntimeStore(s => s.openStockTab);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, snaps, cur] = await Promise.all([
        dbApi.listCandidateStrategies(), dbApi.listCandidateSnapshots(), dbApi.listCandidates(),
      ]);
      setStrategies(s); setSnapshots(snaps); setCurrent(cur);
    } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const weightSum = weights.w_pe + weights.w_roe + weights.w_mom;
  const isCustom = label === '自定义';

  const buildParams = () => isCustom
    ? { w_pe: weights.w_pe / 100, w_roe: weights.w_roe / 100, w_mom: weights.w_mom / 100, window }
    : undefined;

  const handleRun = async () => {
    setRunning(true); setError(null);
    try {
      await dbApi.runCandidates({ strategy: 'rank_composite', label, params: buildParams() });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '跑策略失败'); }
    finally { setRunning(false); }
  };

  const handlePromote = async (it: CandidateItem) => {
    if (!current.snapshot_id) return;
    try { await dbApi.promoteCandidate(current.snapshot_id, it.ts_code); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : '晋升失败'); }
  };

  const handleSnapshotChange = async (sid: number) => {
    try { setCurrent(await dbApi.listCandidates(sid)); } catch (e) { setError('切换快照失败'); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="candidate-panel">
      {/* 顶栏 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#6b6155' }}>策略</span>
        <select data-testid="candidate-strategy-select" value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #2b6cb0', borderRadius: 6, background: '#fff', fontSize: 13, fontWeight: 600, color: '#2b6cb0' }}>
          {PRESET_LABELS.map(l => <option key={l} value={l}>{l}{l !== '自定义' ? ` (${(strategies?.presets[l] as any)?.w_pe ? Math.round((strategies.presets[l] as any).w_pe * 100) : 30}/…)` : ''}</option>)}
        </select>
        <button data-testid="candidate-run-btn" onClick={handleRun} disabled={running}
          style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: running ? '#8aa8c9' : '#2b6cb0', color: '#fff', fontSize: 13, cursor: running ? 'not-allowed' : 'pointer' }}>
          {running ? '跑策略中…' : '🚀 跑策略'}
        </button>
        <select data-testid="candidate-snapshot-select" value={current.snapshot_id ?? ''}
          onChange={(e) => handleSnapshotChange(Number(e.target.value))}
          style={{ padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', fontSize: 13 }}>
          <option value="">最新</option>
          {snapshots.map(s => <option key={s.id} value={s.id}>{s.run_at?.slice(0, 10)} · {s.strategy_label} · top{s.count}</option>)}
        </select>
      </div>

      {/* 参数面板 */}
      <div style={{ background: '#EFE7DA', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: '#6b6155' }}>
          <span>因子权重</span>
          {(['w_pe', 'w_roe', 'w_mom'] as const).map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {k === 'w_pe' ? 'PE' : k === 'w_roe' ? 'ROE' : '动量'}
              <input type="number" value={weights[k]} disabled={!isCustom}
                onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                style={{ width: 48, padding: '3px 6px', border: '1px solid #C9BFAE', borderRadius: 4 }} />%
            </label>
          ))}
          <span style={{ color: weightSum === 100 ? '#5cb85c' : '#d9534f' }}>合计 {weightSum}%</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: '#6b6155' }}>
          <span>动量窗</span>
          <select value={window} disabled={!isCustom} onChange={(e) => setWindow(Number(e.target.value))}
            style={{ padding: '3px 6px', border: '1px solid #C9BFAE', borderRadius: 4 }}>
            {[252, 120, 60, 20].map(w => <option key={w} value={w}>{w}d</option>)}
          </select>
          <span style={{ color: '#a89f93' }}>{isCustom ? '' : '（预设参数只读）'}</span>
        </div>
      </div>

      {error && <div style={{ color: 'var(--accent-red,#d9534f)', fontSize: 12 }}>{error}</div>}

      {!current.snapshot_id ? (
        <div style={{ color: '#888', fontSize: 13 }}>还没跑过策略。选好策略点【🚀 跑策略】生成候选池。</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead><tr style={{ background: '#F0E7DA' }}>
            <th style={th}>排名</th><th style={th}>代码</th><th style={th}>名称</th><th style={th}>行业</th>
            <th style={{ ...th, textAlign: 'right' }}>总分</th>
            <th style={{ ...th, textAlign: 'right' }}>PE秩</th>
            <th style={{ ...th, textAlign: 'right' }}>ROE秩</th>
            <th style={{ ...th, textAlign: 'right' }}>动量秩</th>
            <th style={{ ...th, textAlign: 'center' }}>操作</th>
          </tr></thead>
          <tbody>
            {current.items.map(it => (
              <tr key={it.ts_code} onClick={() => openStockTab(it.ts_code, it.name)}
                  style={{ borderBottom: '1px solid #E5DCC9', cursor: 'pointer' }}>
                <td style={td}>{it.rank}</td>
                <td style={td}>{it.ts_code}</td>
                <td style={td}>{it.name}</td>
                <td style={{ ...td, color: '#8a8178' }}>{it.industry || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#2b6cb0' }}>{it.score}</td>
                <td style={{ ...td, textAlign: 'right' }}>{it.pe_rank}</td>
                <td style={{ ...td, textAlign: 'right' }}>{it.roe_rank}</td>
                <td style={{ ...td, textAlign: 'right' }}>{it.momentum_rank}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {it.promoted ? (
                    <span style={{ padding: '3px 10px', border: '1px solid #E5DCC9', borderRadius: 5, background: '#ECE4D6', color: '#8a8178', fontSize: 12 }}>✓ 已晋升</span>
                  ) : (
                    <button data-testid={`candidate-promote-${it.ts_code}`} onClick={(e) => { e.stopPropagation(); handlePromote(it); }}
                      style={{ padding: '3px 10px', border: '1px solid #D6CFC4', borderRadius: 5, background: '#fff', fontSize: 12, cursor: 'pointer' }}>晋升</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
export default CandidatePanel;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- CandidatePanel`
Expected: PASS(4 用例)

- [ ] **Step 5: Commit**

```bash
git add src/services/dbApi.ts src/components/agentRuntime/CandidatePanel.tsx src/components/agentRuntime/CandidatePanel.test.tsx
git commit -m "feat(candidate-pool): CandidatePanel + dbApi (策略选择+参数面板+晋升) (RQ-B8)"
```

---

## Task 9: TabsWorkspace 接线

**Files:**
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`

**Interfaces:**
- Consumes: Task 8 的 `CandidatePanel`

- [ ] **Step 1: 改 `TabsWorkspace.tsx`** —— 顶部 import 加:
```tsx
import CandidatePanel from './CandidatePanel';
```
在渲染区(`{activeStatic === '自选股' && <WatchlistPanel />}` 之后)加:
```tsx
        {activeStatic === '候选池' && <CandidatePanel />}
```

> 这是接线,无独立单元测试(`invest_agent` 的 tabs 已在 Task 7 后端测试覆盖含「候选池」;前端 tab 出现由 `agent.workspace.tabs` 驱动,已在 `TabsWorkspace.test.tsx` 现有用例覆盖静态 tab 渲染逻辑)。若 `TabsWorkspace.test.tsx` 有「renders all static tabs」类用例,跑一遍确认「候选池」不破坏它。

- [ ] **Step 2: typecheck + 前端测试**

Run: `npm run typecheck && npm test -- TabsWorkspace`
Expected: typecheck PASS;测试 PASS(或仅因新增 tab 名变化的预期更新)

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/TabsWorkspace.tsx
git commit -m "feat(candidate-pool): TabsWorkspace 渲染候选池 tab (RQ-B9)"
```

---

## Task 10: 跟踪矩阵 + 端到端验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

**Interfaces:**
- Consumes: 全部前序 Task

- [ ] **Step 1: 更新跟踪矩阵** 在 `项目执行跟踪矩阵.md` 加 RQ 条目(沿用现有 RQ 编号风格),记录「候选池 spec 1 = pillar A+B」,状态完成。

- [ ] **Step 2: 全量后端测试**

Run: `cd backend && .venv/Scripts/python.exe -m pytest -v`
Expected: 全 PASS(含既有 watchlist 等用例不被破坏)

- [ ] **Step 3: 前端 typecheck + 全量测试**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: 端到端冒烟(手动)**

启动:`npm run dev` + `cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000`。
1. 抓数据(首次):`cd backend && .venv/Scripts/python.exe scripts/fetch_candidates_data.py`(确认 4 表有数据、fetch_log 回写)
2. 前端 invest agent → 候选池 tab → 选「多因子平衡」→【🚀 跑策略】→ 表格出现 top30
3. 切「自定义」→ 改权重 → 跑 → 快照下拉出现新快照
4. 点某行【晋升】→ 自选股 tab 出现该股;候选行变「已晋升」
5. 点候选行 → 打开个股详情 tab
6. 对话里说「跑一次选股」→ agent 调 `run_screener` 工具

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 跟踪矩阵补 候选池 spec 1 (pillar A+B) + 端到端验证通过"
```

---

## Self-Review(plan 写完自查)

- **Spec 覆盖**:① 数据底座 4 表(Task 1 模型 + Task 4 抓取)✓;② 选股引擎(Task 2 纯函数 + Task 3 DB/PIT/Strategy)✓;③ 候选池(模型 Task 1 + router Task 5 + 前端 Task 8 + tab Task 9)✓;④ 集成(工具 Task 6 + invest_agent Task 7)✓;Strategy 抽象(Task 2/3)预留 C/D ✓;ML-ready `fundamental_pit`(Task 1)✓;4 预设 + 自定义(Task 2 PRESETS + Task 8 面板)✓;PIT 命脉(Task 3 + 测试)✓;token 用 settings.tushare_token(Task 4)✓。
- **占位符扫描**:无 TBD/TODO;Task 3 Step1 有个 `pytest_warmup = None` 标注「删除」—— 已注明;dbApi 的 `tsTs` 笔误已注明改 `encodeURIComponent`。
- **类型一致**:`Candidate` 字段(ts_code/name/industry/score/pe_rank/roe_rank/momentum_rank/rank)在 Task 2 定义,Task 3/5/6 全用同名;`compute_candidates(db, strategy_name, params, as_of_date=None)` 签名 Task 3 定义,Task 5/6 一致;params 键 `w_pe/w_roe/w_mom/window/top_n/pe_filter/roe_min/mom_top_pct` 全 plan 统一;端点路径 `/candidates/run|strategies|snapshots|promote` 前后端一致;`PRESETS`/`DEFAULT_PARAMS` Task 2 定义、Task 5/6 import。
- **风险点(执行时留意)**:① `screener.py` 顶部需 `import models`(Task 3 注明);② `pytest-asyncio` 配置(Task 6 注明:先看 test_watchlist_tool.py 模式);③ 动量窗 252 首次抓数据需 ≥1 年历史(抓取 start=20200101 够);④ index_weight 仅近 2 年(universe 用最新快照即可,不影响 v1)。

# 股票基础信息表实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans,checkbox 跟踪。

**Goal:** 建 `StockBasicModel` 持久化基础信息,`screener`/`watchlist` 改查本地表(省 tushare 积分 + 加速)。

**Architecture:** `models.py` 加表 → `fetch_candidates_data` 抓 `stock_basic` 灌表(UPSERT)→ `screener._stock_names_map` / `watchlist.add_stock` 改查本地。

**Tech Stack:** SQLAlchemy + tushare `stock_basic`。

## Global Constraints

- `StockBasicModel` 字段:`ts_code`(PK)/ `name` / `industry` / `area` / `market` / `exchange` / `list_date` / `list_status` / `delist_date` / `fullname` / `enname`
- `_fetch_stock_basic(pro, db)`:调 `pro.stock_basic`,UPSERT(`db.merge`,PK `ts_code` 幂等)
- `screener._stock_names_map(db)` 加 `db` 参数,查本地表 → `{ts_code: {name, industry}}`;**删 tushare/httpx 缓存**
- `watchlist.add_stock` 先查本地,fallback tushare(渐进)
- **不改** `stock-detail`(`analyze_stock`)
- `main.py:create_tables` 自动建新表(`create_all`)
- exchange 从 ts_code 后缀映射(`.SH`→SSE/`.SZ`→SZSE/`.BJ`→BSE)

---

### Task 1: `StockBasicModel` + create_tables 自动建

**Files:** Modify `backend/models.py`

- [ ] **Step 1:** `models.py` 加模型(在 `IndexConstituentModel` 后)
```python
class StockBasicModel(Base):
    """股票基础信息(tushare stock_basic 持久化,避免每次候选池/自选股都查 tushare)。"""
    __tablename__ = "stock_basic"
    ts_code = Column(String(12), primary_key=True)
    name = Column(String(64))
    industry = Column(String(40))
    area = Column(String(20))
    market = Column(String(16))
    exchange = Column(String(8))
    list_date = Column(String(8))
    list_status = Column(String(2))
    delist_date = Column(String(8))
    fullname = Column(String(128))
    enname = Column(String(128))
```
- [ ] **Step 2:** 无单测(纯模型);`create_tables()` 自动建。Commit。

---

### Task 2: `_fetch_stock_basic` + `fetch_all` 调用(TDD)

**Files:** Modify `backend/scripts/fetch_candidates_data.py`; Test `backend/tests/test_stock_basic.py`

- [ ] **Step 1: 写测试** `test_stock_basic.py`
```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pandas as pd
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockBasicModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


class _FakePro:
    def stock_basic(self, **kwargs):
        return pd.DataFrame([
            {"ts_code": "600000.SH", "name": "浦发银行", "industry": "银行", "area": "上海",
             "market": "主板", "list_date": "19991110", "list_status": "L", "delist_date": None,
             "fullname": "上海浦东发展银行", "enname": "SPDB"},
        ])

def _exch(code):
    return {"SH": "SSE", "SZ": "SZSE", "BJ": "BSE"}.get(code[-2:], "")


def test_fetch_stock_basic_upserts(db, monkeypatch):
    from fetch_candidates_data import _fetch_stock_basic
    monkeypatch.setattr("fetch_candidates_data._exch_from_code", _exch, raising=False)
    n = _fetch_stock_basic(_FakePro(), db)
    assert n == 1
    row = db.query(models.StockBasicModel).first()
    assert row.ts_code == "600000.SH" and row.name == "浦发银行" and row.exchange == "SSE"
    # 幂等重跑
    _fetch_stock_basic(_FakePro(), db)
    assert db.query(models.StockBasicModel).count() == 1


def test_names_map_from_local(db):
    """screener._stock_names_map 查本地表。"""
    from screener import _stock_names_map
    db.add(models.StockBasicModel(ts_code="600000.SH", name="浦发银行", industry="银行"))
    db.commit()
    m = _stock_names_map(db)
    assert m == {"600000.SH": {"name": "浦发银行", "industry": "银行"}}
```

- [ ] **Step 2:** 跑失败(`_fetch_stock_basic` / `_stock_names_map(db)` 不存在)

- [ ] **Step 3:** 实现 `_fetch_stock_basic` + `_exch_from_code`(`fetch_candidates_data.py`)
```python
def _exch_from_code(code: str) -> str:
    return {"SH": "SSE", "SZ": "SZSE", "BJ": "BSE"}.get(code[-2:], "")


def _fetch_stock_basic(pro, db) -> int:
    """tushare stock_basic 全市场 → UPSERT stock_basic 表。"""
    df = pro.stock_basic()
    if df is None or df.empty:
        return 0
    n = 0
    for _, r in df.iterrows():
        ts_code = str(r.get("ts_code") or "")
        if not ts_code:
            continue
        db.merge(models.StockBasicModel(
            ts_code=ts_code,
            name=r.get("name") or "",
            industry=r.get("industry") or "",
            area=r.get("area") or "",
            market=r.get("market") or "",
            exchange=_exch_from_code(ts_code),
            list_date=str(r.get("list_date") or ""),
            list_status=r.get("list_status") or "",
            delist_date=str(r.get("delist_date") or "") if r.get("delist_date") else None,
            fullname=r.get("fullname") or "",
            enname=r.get("enname") or "",
        ))
        n += 1
    db.commit()
    return n
```
在 `fetch_all` 的 `_fetch_constituents` 后加:`counts["stock_basic"] = _try(_fetch_stock_basic, pro, db)`(或直接 try/except)。

- [ ] **Step 4:** 改 `screener._stock_names_map(db)` 查本地(删 tushare/httpx 缓存)
```python
def _stock_names_map(db) -> dict:
    rows = db.query(models.StockBasicModel).all()
    return {r.ts_code: {"name": r.name or "", "industry": r.industry or ""} for r in rows}
```
`compute_candidates` 调用点改 `_stock_names_map(db)`(已有 db 参数)。

- [ ] **Step 5:** 跑测试通过 → commit。

---

### Task 3: `watchlist.add_stock` 先查本地

**Files:** Modify `backend/routers/watchlist.py`

- [ ] **Step 1:** `add_stock` 里 `if not name:` 分支,先查本地 `StockBasicModel`,miss 再 `_tushare_post("stock_basic", ...)`
```python
if not name:
    basic = db.query(models.StockBasicModel).filter_by(ts_code=ts_code).first()
    if basic:
        name = basic.name or ""
    else:
        records = _tushare_post("stock_basic", {"ts_code": ts_code})
        if not records:
            raise HTTPException(status_code=404, detail=f"股票代码 {ts_code} 不存在")
        name = records[0].get("name", "")
```
- [ ] **Step 2:** Commit(改动小,复用现有测试或手动验证)。

---

### Task 4: 部署验证

- [ ] **Step 1:** rebuild backend(代码变了,daemon 抓完后)
- [ ] **Step 2:** `docker exec agentlab-backend python scripts/fetch_candidates_data.py --force-full`(或 data_fetch trigger)灌 stock_basic
- [ ] **Step 3:** `curl localhost:8080/api/db/candidates/run -d '{"strategy":"rank_composite"}'` → 候选 name 来自本地(非空,真实沪深300 名)
- [ ] **Step 4:** mysql 直连 `SELECT ts_code,name,industry FROM stock_basic LIMIT 5` 确认数据

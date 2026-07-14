# 个股详情 K 线图(收盘价折线 + MA,日/周/月)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个股详情页新增「📈 K线」tab,展示该股收盘价折线 + MA5/10/20,可切换日/周/月(默认日线)。

**Architecture:** 后端新增只读端点 `GET /api/db/watchlist/stock-detail/{ts_code}/kline?freq=&limit=`:本地 `stock_daily` 命中优先(有多少用多少、不补拉),完全 miss 才 tushare `daily+adj_factor` 兜底;统一管线 = 前复权 → 按周期聚合取各周期最后交易日 → 取最近 limit → 算 MA5/10/20 → 缓存 600s。前端新增 `<KlineChart>` 用 recharts 画 close + 3 条 MA,挂为 `StockDetailPanel` 第 8 个 tab。

**Tech Stack:** 后端 Python FastAPI + SQLAlchemy + pandas(≥2.0,版本无关写法);前端 React 18 + TypeScript + recharts(^2.10,已装) + Vitest + jsdom。

## Global Constraints

(从 spec `docs/superpowers/specs/2026-07-14-stock-kline-design.md` 逐条抄录,所有任务隐含遵守)

- pandas `>=2.0.0`(**版本未锁定**):禁止用 `resample('M')`/`resample('W')`(2.2 弃用、3.0 移除),改用 `df.groupby(df.index.to_period('M'|'W')).tail(1)` 取各周期最后交易日
- recharts `^2.10.0` **已装**,不引新前端依赖
- 复用后端现有 `_tushare_post(api_name, params)`、`_clean(obj)`、`get_db`、路由前缀 `/api/db`;**不新建后端模块**,管线函数加在 `backend/routers/watchlist.py`
- 缓存 TTL = 600s(与现有 `_DETAIL_TTL` 一致),key = `(ts_code, freq, limit)`
- 命中策略:本地 `stock_daily` 有任意一行 → `source="local"`,不补拉、不足 limit 就少给;本地零行 → tushare 兜底 `source="tushare"`
- 前复权:`close_qfq = close * adj_factor / 最新日 adj_factor`,**在聚合前做**
- 命名:组件文件 PascalCase(`KlineChart.tsx`),匹配现有风格
- 图表配色/对比度/色盲安全遵循 **dataviz skill**(Task 3 写图表代码前必须 invoke 并校准调色板)

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/routers/watchlist.py` | 改 | 加 `_build_kline_points()` 纯管线 + `_KLINE_CACHE` + `get_kline` 端点 |
| `backend/tests/test_kline.py` | 建后扩 | Task1 纯管线测试;Task2 追加 client fixture + 端点测试 |
| `src/services/dbApi.ts` | 改 | 加 `KlinePoint`/`KlineResult` 类型 + `getKline()` 方法 |
| `src/components/agentRuntime/KlineChart.tsx` | 建 | 折线+MA 图组件,日/周/月切换 |
| `src/components/agentRuntime/KlineChart.test.tsx` | 建 | 组件单测(mock dbApi + recharts) |
| `src/components/agentRuntime/StockDetailPanel.tsx` | 改 | `SUB_TABS` 加「📈 K线」+ 渲染分支 + import |
| `src/components/agentRuntime/StockDetailPanel.test.tsx` | 改 | dbApi mock 加 `getKline`;加 1 个集成测试(+recharts mock) |

---

## Task 1: 后端纯管线 `_build_kline_points`(前复权+聚合+MA)

**Files:**
- Modify: `backend/routers/watchlist.py`(在 `get_stock_detail` 函数之后、AI deepdive 注释 `# === RQ-093` 之前插入)
- Test: `backend/tests/test_kline.py`(新建)

**Interfaces:**
- Produces: `watchlist._build_kline_points(rows, freq, limit) -> list[dict]`
  - `rows`: iterable of `{trade_date:str(YYYYMMDD), close:float|None, adj_factor:float|None}`,任意顺序
  - `freq`: `'daily'|'weekly'|'monthly'`
  - `limit`: int,取最近 N 根
  - 返回升序 `[{date:str(YYYYMMMD), close:float, ma5, ma10, ma20}]`,MA 开头不足 N 根处为 `None`;非法 freq 或空输入返回 `[]`

- [ ] **Step 1: 写失败测试(新建 test_kline.py)**

新建 `backend/tests/test_kline.py`,写入纯管线测试(无需 DB):

```python
"""K 线管线 + 端点测试。纯管线测试不依赖 DB;端点测试用 sqlite in-memory。"""
from datetime import datetime, timedelta


def _rows(closes, start="20230103", adj=1.0):
    """造连续交易日(跳过周末)的 rows:close 来自列表,adj_factor 恒定。"""
    out = []
    d = datetime.strptime(start, "%Y%m%d")
    for c in closes:
        while d.weekday() >= 5:      # 跳过周六周日
            d += timedelta(days=1)
        out.append({"trade_date": d.strftime("%Y%m%d"), "close": float(c), "adj_factor": adj})
        d += timedelta(days=1)
    return out


def test_build_kline_daily_passthrough_and_ma():
    from routers import watchlist as wl
    rows = _rows([1, 2, 3, 4, 5, 6])
    pts = wl._build_kline_points(rows, "daily", 100)
    assert [p["close"] for p in pts] == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    assert pts[0]["ma5"] is None            # 不足 5 根
    assert pts[3]["ma5"] is None
    assert pts[4]["ma5"] == 3.0             # mean(1..5)
    assert pts[5]["ma5"] == 4.0             # mean(2..6)
    assert pts[5]["ma10"] is None           # 不足 10
    assert pts[5]["ma20"] is None


def test_build_kline_weekly_takes_last_trade_day_of_week():
    from routers import watchlist as wl
    # 2023-01-03(周二)起 10 个交易日:1/3,4,5,6 | 1/9,10,11,12,13 | 1/16
    rows = _rows([10, 11, 12, 13, 14, 15, 16, 17, 18, 19], start="20230103")
    pts = wl._build_kline_points(rows, "weekly", 100)
    assert [p["close"] for p in pts] == [13.0, 18.0, 19.0]   # 每周最后交易日 close
    assert [p["date"] for p in pts] == ["20230106", "20230113", "20230116"]


def test_build_kline_monthly_takes_last_trade_day_of_month():
    from routers import watchlist as wl
    rows = [
        {"trade_date": "20230130", "close": 30.0, "adj_factor": 1.0},
        {"trade_date": "20230131", "close": 31.0, "adj_factor": 1.0},
        {"trade_date": "20230201", "close": 1.0, "adj_factor": 1.0},
        {"trade_date": "20230228", "close": 28.0, "adj_factor": 1.0},
        {"trade_date": "20230301", "close": 1.0, "adj_factor": 1.0},
        {"trade_date": "20230331", "close": 31.0, "adj_factor": 1.0},
    ]
    pts = wl._build_kline_points(rows, "monthly", 100)
    assert [p["close"] for p in pts] == [31.0, 28.0, 31.0]
    assert [p["date"] for p in pts] == ["20230131", "20230228", "20230331"]


def test_build_kline_qfq_adjusts_by_latest_adj():
    from routers import watchlist as wl
    # adj 恒定 → 前复权=原值
    rows = [
        {"trade_date": "20230103", "close": 20.0, "adj_factor": 2.0},
        {"trade_date": "20230104", "close": 10.0, "adj_factor": 2.0},
    ]
    pts = wl._build_kline_points(rows, "daily", 100)
    assert pts[0]["close"] == 20.0 and pts[1]["close"] == 10.0
    # 早期 adj=1、最新 adj=2 → 历史 close 减半(前复权,基准=最新日)
    rows2 = [
        {"trade_date": "20230103", "close": 20.0, "adj_factor": 1.0},
        {"trade_date": "20230104", "close": 10.0, "adj_factor": 2.0},
    ]
    pts2 = wl._build_kline_points(rows2, "daily", 100)
    assert pts2[0]["close"] == 10.0   # 20 * 1 / 2
    assert pts2[1]["close"] == 10.0   # 10 * 2 / 2


def test_build_kline_empty():
    from routers import watchlist as wl
    assert wl._build_kline_points([], "daily", 100) == []
    assert wl._build_kline_points([{"trade_date": "x", "close": None, "adj_factor": 1}], "daily", 100) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_kline.py -v`
Expected: 5 个测试 FAIL(`AttributeError: module 'routers.watchlist' has no attribute '_build_kline_points'`)

- [ ] **Step 3: 实现管线函数**

在 `backend/routers/watchlist.py` 的 `get_stock_detail` 函数(以 `return _clean(data)` 结尾)之后、`# === RQ-093/094` 注释之前,插入:

```python
def _build_kline_points(rows, freq, limit):
    """K 线管线:前复权 → 按 freq 聚合(取各周期最后交易日)→ 取最近 limit → 算 MA5/10/20。
    rows: iterable of {trade_date(YYYYMMDD), close, adj_factor},任意顺序。返回升序 points 列表。"""
    import pandas as pd
    rows = list(rows)
    if not rows:
        return []
    df = pd.DataFrame([{
        "trade_date": str(r["trade_date"]),
        "close": r.get("close"),
        "adj_factor": r.get("adj_factor"),
    } for r in rows])
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d", errors="coerce")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["trade_date", "close"]).sort_values("trade_date").reset_index(drop=True)
    if df.empty:
        return []
    # 前复权:close * adj_factor / 最新日 adj_factor(消除除权除息假下跌)
    df["adj_factor"] = pd.to_numeric(df["adj_factor"], errors="coerce").ffill().bfill().fillna(1.0)
    df["close"] = df["close"] * df["adj_factor"] / float(df["adj_factor"].iloc[-1])
    df = df.set_index("trade_date")
    if freq == "daily":
        agg = df
    elif freq in ("weekly", "monthly"):
        per = "W" if freq == "weekly" else "M"        # to_period 版本无关,避免 resample 弃用
        agg = df.groupby(df.index.to_period(per)).tail(1)   # 各周期最后交易日(已升序)
    else:
        return []
    agg = agg.tail(int(limit))
    for n in (5, 10, 20):
        agg[f"ma{n}"] = agg["close"].rolling(n).mean()
    points = []
    for d, row in agg.iterrows():
        points.append({
            "date": d.strftime("%Y%m%d"),
            "close": float(row["close"]),
            "ma5": None if pd.isna(row["ma5"]) else float(row["ma5"]),
            "ma10": None if pd.isna(row["ma10"]) else float(row["ma10"]),
            "ma20": None if pd.isna(row["ma20"]) else float(row["ma20"]),
        })
    return points
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_kline.py -v`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/watchlist.py backend/tests/test_kline.py
git commit -m "feat(kline): 收盘价聚合+MA+前复权管线(TDD)"
```

---

## Task 2: 后端 `/kline` 端点(本地优先 + tushare 兜底 + 缓存)

**Files:**
- Modify: `backend/routers/watchlist.py`(在 `_build_kline_points` 之后加 `_KLINE_CACHE` + `get_kline` 端点)
- Test: `backend/tests/test_kline.py`(追加 client fixture + 端点测试)

**Interfaces:**
- Consumes: Task 1 的 `_build_kline_points`;现有 `_tushare_post`、`_clean`、`get_db`、`models.StockDailyModel`
- Produces: HTTP `GET /api/db/watchlist/stock-detail/{ts_code}/kline?freq=daily&limit=120`
  - 200 → `{ts_code, freq, source:"local"|"tushare", points:[...]}`(points 实际数 = min(limit, 可用))
  - 本地 miss 且 tushare 抛错 → 500 `{detail:"K线数据获取失败:..."}`

- [ ] **Step 1: 追加失败测试**

在 `backend/tests/test_kline.py` **末尾**追加(`import pytest` 等放文件顶部,与上面纯测试同文件):

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
from database import Base, get_db
import models


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__])
    S = sessionmaker(bind=eng)

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = _db
    from routers import watchlist as wl
    wl._KLINE_CACHE.clear()
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def _seed(client, code, rows):
    db = next(main.app.dependency_overrides[get_db]())
    for r in rows:
        db.add(models.StockDailyModel(code=code, trade_date=r["trade_date"],
                                      close=r["close"], adj_factor=r.get("adj_factor", 1.0)))
    db.commit()


def test_kline_local_hit(monkeypatch, client):
    _seed(client, "600519.SH", [
        {"trade_date": "20230103", "close": 1, "adj_factor": 1},
        {"trade_date": "20230104", "close": 2, "adj_factor": 1},
        {"trade_date": "20230105", "close": 3, "adj_factor": 1},
    ])
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("本地命中不应调 tushare")))
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "local"
    assert [p["close"] for p in body["points"]] == [1.0, 2.0, 3.0]


def test_kline_tushare_fallback(monkeypatch, client):
    from routers import watchlist as wl

    def fake_post(api_name, params):
        if api_name == "daily":
            return [{"trade_date": "20230103", "close": 100},
                    {"trade_date": "20230104", "close": 110}]
        if api_name == "adj_factor":
            return [{"trade_date": "20230103", "adj_factor": 1.0},
                    {"trade_date": "20230104", "adj_factor": 1.0}]
        return []

    monkeypatch.setattr(wl, "_tushare_post", fake_post)
    r = client.get("/api/db/watchlist/stock-detail/999999.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "tushare"
    assert [p["close"] for p in body["points"]] == [100.0, 110.0]


def test_kline_empty_when_both_miss(monkeypatch, client):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post", lambda *a, **k: [])
    r = client.get("/api/db/watchlist/stock-detail/999998.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["points"] == []
    assert body["source"] == "tushare"     # 走了兜底分支但空


def test_kline_tushare_error_returns_500(monkeypatch, client):
    from routers import watchlist as wl

    def boom(*a, **k):
        raise RuntimeError("token 未配置")

    monkeypatch.setattr(wl, "_tushare_post", boom)
    r = client.get("/api/db/watchlist/stock-detail/999997.SH/kline?freq=daily&limit=10")
    assert r.status_code == 500
    assert "K线数据获取失败" in r.json()["detail"]


def test_kline_freq_sanitize(client):
    _seed(client, "600519.SH", [{"trade_date": "20230103", "close": 5, "adj_factor": 1}])
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=bogus&limit=10")
    assert r.status_code == 200
    assert r.json()["freq"] == "daily"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_kline.py -v`
Expected: 新 5 个测试 FAIL(404 / `_KLINE_CACHE` 不存在);Task 1 的 5 个仍 PASS

- [ ] **Step 3: 实现端点**

在 `backend/routers/watchlist.py` 的 `_build_kline_points` 函数**之后**插入缓存与端点:

```python
_KLINE_TTL = 600.0
_KLINE_CACHE: dict = {}


@router.get("/watchlist/stock-detail/{ts_code}/kline")
def get_kline(ts_code: str, freq: str = "daily", limit: int = 120, db: Session = Depends(get_db)):
    freq = freq if freq in ("daily", "weekly", "monthly") else "daily"
    try:
        limit = max(1, min(int(limit or 120), 1000))
    except (TypeError, ValueError):
        limit = 120
    key = (ts_code, freq, limit)
    now = time.time()
    hit = _KLINE_CACHE.get(key)
    if hit and now - hit["ts"] < _KLINE_TTL:
        return hit["data"]

    rows_q = db.query(models.StockDailyModel.trade_date, models.StockDailyModel.close,
                      models.StockDailyModel.adj_factor).filter(models.StockDailyModel.code == ts_code).all()
    if rows_q:
        rows = [{"trade_date": r.trade_date, "close": r.close, "adj_factor": r.adj_factor} for r in rows_q]
        source = "local"
    else:
        try:
            daily = _tushare_post("daily", {"ts_code": ts_code})
            adj = _tushare_post("adj_factor", {"ts_code": ts_code})
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"K线数据获取失败:{e}")
        adj_map = {a["trade_date"]: a.get("adj_factor") for a in (adj or [])}
        rows = [{"trade_date": d["trade_date"], "close": d.get("close"),
                 "adj_factor": adj_map.get(d["trade_date"])} for d in (daily or [])]
        source = "tushare"

    points = _build_kline_points(rows, freq, limit)
    data = _clean({"ts_code": ts_code, "freq": freq, "source": source, "points": points})
    _KLINE_CACHE[key] = {"data": data, "ts": now}
    return data
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_kline.py -v`
Expected: 10 PASS(Task1 的 5 + Task2 的 5)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/watchlist.py backend/tests/test_kline.py
git commit -m "feat(kline): /kline 端点(本地优先+tushare兜底+缓存600s)"
```

---

## Task 3: 前端 `<KlineChart>` 组件 + dbApi.getKline

**Files:**
- Modify: `src/services/dbApi.ts`(加类型 + 方法)
- Create: `src/components/agentRuntime/KlineChart.tsx`
- Test: `src/components/agentRuntime/KlineChart.test.tsx`(新建)

**Interfaces:**
- Consumes: Task 2 的 `GET /kline` 端点
- Produces: `dbApi.getKline(ts_code, freq, limit=120): Promise<KlineResult>`;`<KlineChart ts_code={string} />` 组件

- [ ] **Step 0: 读 dataviz skill 并定调色板**

写图表代码前 **invoke dataviz skill**,按其方法选定 close/MA5/MA10/MA20 四色(色盲安全、浅深色一致)。下方 `COLORS` 为占位默认值,实施时以 dataviz 校准结果替换。

- [ ] **Step 1: 写 dbApi 类型与方法**

在 `src/services/dbApi.ts` 中:
(a) 在 `BacktestDetail` interface 之后(约 147 行后)加类型:
```ts
export interface KlinePoint {
  date: string;            // YYYYMMDD
  close: number;
  ma5: number | null; ma10: number | null; ma20: number | null;
}
export interface KlineResult {
  ts_code: string;
  freq: 'daily' | 'weekly' | 'monthly';
  source: 'local' | 'tushare';
  points: KlinePoint[];
}
```
(b) 在 `dbApi` 对象里(紧挨 `aiDeepdive` 之后)加方法:
```ts
  getKline: (ts_code: string, freq: 'daily' | 'weekly' | 'monthly', limit = 120) =>
    req<KlineResult>(`/watchlist/stock-detail/${encodeURIComponent(ts_code)}/kline?freq=${freq}&limit=${limit}`),
```

- [ ] **Step 2: 写失败测试(新建 KlineChart.test.tsx)**

新建 `src/components/agentRuntime/KlineChart.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KlineChart from './KlineChart';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { getKline: vi.fn() },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => <div data-testid="mock-chart" />,
  LineChart: () => <div />,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
}));

const POINTS = [
  { date: '20230103', close: 10, ma5: 9, ma10: null, ma20: null },
  { date: '20230104', close: 11, ma5: 10, ma10: null, ma20: null },
];

describe('KlineChart', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders chart when points present (defaults to daily)', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'daily', source: 'local', points: POINTS });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    expect(dbApi.getKline).toHaveBeenCalledWith('600519.SH', 'daily', 120);
  });

  it('switching to weekly calls getKline with freq=weekly', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'weekly', source: 'local', points: POINTS });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    fireEvent.click(screen.getByTestId('kline-freq-weekly'));
    await waitFor(() =>
      expect((dbApi.getKline as any).mock.calls.some((c: any[]) => c[1] === 'weekly')).toBe(true));
  });

  it('shows empty hint when points empty', async () => {
    (dbApi.getKline as any).mockResolvedValue(
      { ts_code: '600519.SH', freq: 'daily', source: 'tushare', points: [] });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/暂无K线数据/)).toBeTruthy());
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/components/agentRuntime/KlineChart.test.tsx`
Expected: FAIL(`Failed to resolve import './KlineChart'` 或模块不存在)

- [ ] **Step 4: 实现 KlineChart.tsx**

新建 `src/components/agentRuntime/KlineChart.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dbApi, type KlineResult } from '../../services/dbApi';

const FREQS = [
  { key: 'daily', label: '日' },
  { key: 'weekly', label: '周' },
  { key: 'monthly', label: '月' },
] as const;
type Freq = typeof FREQS[number]['key'];

// 注:实施时按 dataviz skill 校准;此处为色盲安全默认占位
const COLORS = { close: '#2b6cb0', ma5: '#e07b39', ma10: '#3a9d5d', ma20: '#9b59b6' };

const KlineChart: React.FC<{ ts_code: string }> = ({ ts_code }) => {
  const [freq, setFreq] = useState<Freq>('daily');
  const [data, setData] = useState<KlineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (f: Freq) => {
    setLoading(true); setError(null);
    dbApi.getKline(ts_code, f, 120)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };
  useEffect(() => load(freq), [ts_code, freq]);

  const fmtDate = (d: string) => `${d.slice(4, 6)}-${d.slice(6, 8)}`;

  return (
    <div data-testid="kline-chart" style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {FREQS.map(f => (
          <button key={f.key} data-testid={`kline-freq-${f.key}`} onClick={() => setFreq(f.key)}
            style={{
              padding: '4px 12px', cursor: 'pointer', borderRadius: 6, fontSize: 12,
              border: `1px solid ${freq === f.key ? 'var(--accent-blue,#2b6cb0)' : '#D6CFC4'}`,
              background: freq === f.key ? 'var(--accent-blue,#2b6cb0)' : '#fff',
              color: freq === f.key ? '#fff' : '#6b6155',
            }}>{f.label}</button>
        ))}
        <span style={{ fontSize: 11, color: '#aaa', alignSelf: 'center' }}>收盘价折线 + MA5/10/20(前复权)</span>
      </div>
      {loading && <div style={{ color: '#888' }}>加载中…</div>}
      {error && (
        <div style={{ color: 'var(--accent-red,#d9534f)' }}>
          {error}
          <button onClick={() => load(freq)} style={{ marginLeft: 8, padding: '2px 10px',
            border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
        </div>
      )}
      {!loading && !error && data && data.points.length === 0 && (
        <div style={{ color: '#888' }}>暂无K线数据(该股未在已抓取范围,且 tushare 兜底失败)</div>
      )}
      {!loading && !error && data && data.points.length > 0 && (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#F0E7DA" />
              <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} minTickGap={24} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip labelFormatter={fmtDate} />
              <Line type="monotone" dataKey="close" name="收盘" stroke={COLORS.close} dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="ma5" name="MA5" stroke={COLORS.ma5} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma10" name="MA10" stroke={COLORS.ma10} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma20" name="MA20" stroke={COLORS.ma20} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default KlineChart;
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/components/agentRuntime/KlineChart.test.tsx`
Expected: 3 PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/dbApi.ts src/components/agentRuntime/KlineChart.tsx src/components/agentRuntime/KlineChart.test.tsx
git commit -m "feat(kline): KlineChart 折线+MA 组件(日/周/月切换)"
```

---

## Task 4: 接入 StockDetailPanel「📈 K线」tab

**Files:**
- Modify: `src/components/agentRuntime/StockDetailPanel.tsx`(SUB_TABS + import + 渲染分支)
- Modify: `src/components/agentRuntime/StockDetailPanel.test.tsx`(mock 加 getKline + recharts mock + 1 集成测试)

**Interfaces:**
- Consumes: Task 3 的 `<KlineChart>`
- Produces: 详情页第 8 个 tab「📈 K线」

- [ ] **Step 1: 改 StockDetailPanel.tsx**

(a) 顶部 import 区加(第 2 行之后):
```tsx
import KlineChart from './KlineChart';
```
(b) 第 4 行 `SUB_TABS` 末尾加 tab:
```tsx
const SUB_TABS = ['总览', '成长', '盈利', '估值', '趋势', '安全', '🩺 巴菲特', '📈 K线'] as const;
```
(c) 渲染分支(原第 85-101 行的 `{sub === '总览' ? ... : ... : (<DimDetail .../>)}` 三元)在最后一个 `: (<DimDetail .../>)` **之前**插入 K 线分支:
```tsx
      {sub === '总览' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {dims.map(d => (
            <div key={d.key} style={{ background: '#fff', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: '#888' }}>{score.dim_labels[d.cn]} {d.cn}</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{score.dim_scores[d.cn]}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{score.dim_reasons[d.cn]}</div>
            </div>
          ))}
        </div>
      ) : sub === '🩺 巴菲特' ? (
        <BuffettView data={data} ts_code={ts_code} />
      ) : sub === '安全' ? (
        <SafeSection safety={data.safety} />
      ) : sub === '📈 K线' ? (
        <KlineChart ts_code={ts_code} />
      ) : (
        <DimDetail sub={sub} data={data} />
      )}
```
(只新增 `sub === '📈 K线' ? (<KlineChart .../>) :` 一层;`DimDetail` 的 TS 收窄到 4 维不受影响。)

- [ ] **Step 2: 改 StockDetailPanel.test.tsx**

(a) 顶部 import 后加 recharts mock + dbApi mock 补 getKline。把第 6-8 行的 dbApi mock 改为:
```tsx
vi.mock('../../services/dbApi', () => ({
  dbApi: { getStockDetail: vi.fn(), aiDeepdive: vi.fn(), getKline: vi.fn() },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => <div data-testid="mock-kline-chart" />,
  LineChart: () => <div />,
  Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null,
}));
```
(b) 在 `describe` 块末尾(`});` 之前)加集成测试:
```tsx
  it('renders KlineChart on 📈 K线 tab', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    (dbApi.getKline as any).mockResolvedValue({
      ts_code: '600519.SH', freq: 'daily', source: 'local',
      points: [{ date: '20230103', close: 10, ma5: null, ma10: null, ma20: null }],
    });
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    fireEvent.click(screen.getByText('📈 K线'));
    await waitFor(() => expect(dbApi.getKline).toHaveBeenCalledWith('600519.SH', 'daily', 120));
    await waitFor(() => expect(screen.getByTestId('mock-kline-chart')).toBeTruthy());
  });
```

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/components/agentRuntime/StockDetailPanel.test.tsx`
Expected: 全部 PASS(原 8 个 + 新 1 个)。recharts mock 保证 KlineChart 在 jsdom 不触发 ResizeObserver。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误(`SubTab` 联合自动扩展到含 `'📈 K线'`,渲染分支已显式处理)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/StockDetailPanel.tsx src/components/agentRuntime/StockDetailPanel.test.tsx
git commit -m "feat(kline): StockDetailPanel 新增📈K线 tab"
```

---

## 完成验证(全部 Task 后)

- [ ] 后端全量:`cd backend && python -m pytest tests/test_kline.py -v` → 10 PASS
- [ ] 前端单测:`npx vitest run src/components/agentRuntime/KlineChart.test.tsx src/components/agentRuntime/StockDetailPanel.test.tsx` → 全 PASS
- [ ] typecheck:`npm run typecheck` → 无错误
- [ ] 手动联调(需起后端 uvicorn:8000 + 前端 vite:5173):
  - 自选股点开一只沪深300成分股(如 600519.SH)→ 切「📈 K线」→ 看到折线 + 3 条 MA
  - 点「周/月」→ 图刷新、URL 不变、数据变
  - 点一只非沪深300股 → 走 tushare 兜底(首次略慢),仍能出图;兜底失败显示提示
  - 检查前复权:有除权除息的历史日期不应出现断崖式下跌
- [ ] 按 CLAUDE.md 更新 `项目执行跟踪矩阵.md`(若该需求有编号)

# K线图叠加沪深300基准对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个股 K线 tab 增加可开关的「沪深300 归一化对比」——开启时个股与沪深300 都归一到区间首日=100,共用百分比轴看相对强弱;关闭时保留现有绝对价格图。

**Architecture:** 后端 `/kline` 端点内合并 benchmark:取沪深300(`IndexDailyModel` 本地优先 → tushare `index_daily` 兜底)→ 按 freq 聚合 → 按个股 date 序列对齐 → 归一化(首日=100),响应加 `benchmark` 字段。前端 `KlineChart` 加开关,开时把个股 close/MA 前端归一 + 叠加后端给的 benchmark 归一序列到百分比轴。

**Tech Stack:** FastAPI + SQLAlchemy + pandas(后端);React + recharts + Vitest(前端)。

## Global Constraints

- 不破坏现有 kline 行为:**开关默认关**,关闭时与现状逐像素一致。
- benchmark 任何失败(本地无 + tushare 失败 / 对齐归一落空)→ `benchmark=null`,**不影响个股图**,不抛 500。
- 复用现有 `_tushare_post(api_name, params)` / `_clean()` / 测试 fixture 风格(sqlite in-memory + monkeypatch `_tushare_post`)。
- `IndexDailyModel` 字段:`ts_code`(PK, String12)、`trade_date`(PK, String8 YYYYMMDD)、`close`(Float)、`pct_chg`(Float)。**注意是 `ts_code`,不是 `StockDailyModel` 的 `code`**。
- 沪深300 代码常量 `_BENCHMARK_CODE = "000300.SH"`。
- 配色:新增沪深300 线需过 dataviz skill 校验第 5 色(现有 close/ma5/ma10/ma20 四色已 CVD 安全)。
- TDD:每 task 先写失败测试 → 跑红 → 实现 → 跑绿 → commit。
- 后端测试命令:`cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v`
- 前端测试命令:`npm test -- KlineChart`(项目根)

---

## File Structure

| 文件 | 责任 | 改动 |
|------|------|------|
| `backend/routers/watchlist.py` | 加 3 个函数:`_aggregate_close_by_freq` / `_build_benchmark_points` / `_get_benchmark_series` + `_build_benchmark_payload`;`get_kline` 端点整合;加 `_BENCHMARK_CACHE`/`_BENCHMARK_CODE` 常量 | Modify |
| `backend/tests/test_kline.py` | benchmark 纯函数 + 取数缓存 + 端点测试;`client` fixture 扩展 | Modify |
| `src/services/dbApi.ts` | `KlineResult` 加 `benchmark?` 字段及子类型 | Modify |
| `src/components/agentRuntime/KlineChart.tsx` | 加开关 + 归一化渲染逻辑 + bench 线 | Modify |
| `src/components/agentRuntime/KlineChart.test.tsx` | 开关切换 + disabled 测试 | Modify |

---

### Task 1: 后端 benchmark 纯函数(聚合 + 对齐归一)

**Files:**
- Modify: `backend/routers/watchlist.py`(在 `_build_kline_points` 函数之后、`_KLINE_TTL` 之前新增)
- Test: `backend/tests/test_kline.py`

**Interfaces:**
- Produces:
  - `_aggregate_close_by_freq(rows: list[dict], freq: str) -> list[tuple[str, float]]` —— rows: `[{trade_date, close}]`;返回升序 `[(date_str_YYYYMMDD, close)]`,已按 freq 聚合(daily 不变;weekly/monthly 取各周期最后交易日)。
  - `_build_benchmark_points(series: list[tuple[str, float]], ref_dates: list[str]) -> list[dict]` —— series 来自 `_aggregate_close_by_freq`;返回 `[{date, value}]`,长度同 ref_dates,value 已归一(首个有值日=100),缺值日 value=null。

- [ ] **Step 1: Write failing tests**(追加到 `test_kline.py` 末尾)

```python
def test_aggregate_close_daily_passthrough():
    from routers import watchlist as wl
    rows = [{"trade_date": "20230103", "close": 100},
            {"trade_date": "20230104", "close": 110}]
    assert wl._aggregate_close_by_freq(rows, "daily") == [("20230103", 100.0), ("20230104", 110.0)]


def test_aggregate_close_weekly_last_trade_day():
    from routers import watchlist as wl
    # 2023-01-03(周二)起 6 个交易日:1/3,4,5,6 | 1/9,10
    rows = [{"trade_date": "2023010%d" % d, "close": float(d)} for d in (3, 4, 5, 6)]
    rows += [{"trade_date": "20230109", "close": 9.0}, {"trade_date": "20230110", "close": 10.0}]
    assert wl._aggregate_close_by_freq(rows, "weekly") == [("20230106", 6.0), ("20230110", 10.0)]


def test_aggregate_close_empty():
    from routers import watchlist as wl
    assert wl._aggregate_close_by_freq([], "daily") == []


def test_build_benchmark_points_normalizes_first_day_to_100():
    from routers import watchlist as wl
    series = [("20230103", 4000.0), ("20230104", 4400.0), ("20230105", 3960.0)]
    ref = ["20230103", "20230104", "20230105"]
    out = wl._build_benchmark_points(series, ref)
    assert [p["date"] for p in out] == ref
    assert out[0]["value"] == 100.0
    assert out[1]["value"] == 110.0     # 4400/4000*100
    assert out[2]["value"] == 99.0      # 3960/4000*100


def test_build_benchmark_points_aligns_to_ref_dates_missing_null():
    from routers import watchlist as wl
    # series 缺 20230104;ref_dates 含它 → 该日 value=null
    series = [("20230103", 100.0), ("20230105", 120.0)]
    out = wl._build_benchmark_points(series, ["20230103", "20230104", "20230105"])
    assert out[0]["value"] == 100.0
    assert out[1]["value"] is None
    assert out[2]["value"] == 120.0


def test_build_benchmark_points_base_skips_missing_first_day():
    from routers import watchlist as wl
    # 首日 ref series 缺值 → 基准顺延到首个有值日(20230104=100)
    series = [("20230104", 100.0), ("20230105", 90.0)]
    out = wl._build_benchmark_points(series, ["20230103", "20230104", "20230105"])
    assert out[0]["value"] is None      # series 无 20230103
    assert out[1]["value"] == 100.0     # 基准
    assert out[2]["value"] == 90.0


def test_build_benchmark_points_empty_inputs():
    from routers import watchlist as wl
    assert wl._build_benchmark_points([], ["20230103"]) == []
    assert wl._build_benchmark_points([("20230103", 1.0)], []) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v -k "aggregate_close or build_benchmark"`
Expected: FAIL — `AttributeError: module has no attribute '_aggregate_close_by_freq' / '_build_benchmark_points'`

- [ ] **Step 3: Write minimal implementation**(插入 `watchlist.py`,在 `_build_kline_points` 之后、`_KLINE_TTL = 600.0` 之前)

```python
_BENCHMARK_TTL = 600.0
_BENCHMARK_CACHE: dict = {}
_BENCHMARK_CODE = "000300.SH"


def _aggregate_close_by_freq(rows, freq):
    """rows:[{trade_date, close}] → 按 freq 聚合(daily 不变;weekly/monthly 取各周期最后交易日)
    → 升序 [(date_str, close)]。指数无 adj_factor,close 直接用。"""
    import pandas as pd
    rows = list(rows)
    if not rows:
        return []
    df = pd.DataFrame([{"trade_date": str(r["trade_date"]), "close": r.get("close")} for r in rows])
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d", errors="coerce")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna(subset=["trade_date", "close"]).sort_values("trade_date").reset_index(drop=True)
    if df.empty:
        return []
    df = df.set_index("trade_date")
    if freq == "daily":
        agg = df
    elif freq in ("weekly", "monthly"):
        per = "W" if freq == "weekly" else "M"
        agg = df.groupby(df.index.to_period(per)).tail(1)
    else:
        return []
    return [(d.strftime("%Y%m%d"), float(c)) for d, c in zip(agg.index, agg["close"])]


def _build_benchmark_points(series, ref_dates):
    """series:升序 [(date_str, close)](已聚合)。ref_dates:个股 points 的 date 序列。
    按 ref_dates 对齐 + 归一化(首个有值日=100),返回 [{date, value}],长度同 ref_dates。"""
    if not ref_dates or not series:
        return []
    m = {d: c for d, c in series}
    base = None
    for d in ref_dates:
        c = m.get(d)
        if c is not None:
            base = float(c)
            break
    if base is None or base == 0:
        return []
    out = []
    for d in ref_dates:
        c = m.get(d)
        out.append({"date": d, "value": None if c is None else round(float(c) / base * 100, 4)})
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v -k "aggregate_close or build_benchmark"`
Expected: PASS(7 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/watchlist.py backend/tests/test_kline.py
git commit -m "feat(kline): 沪深300 benchmark 聚合+对齐归一纯函数"
```

---

### Task 2: 后端 `_get_benchmark_series`(取数 + 缓存)

**Files:**
- Modify: `backend/routers/watchlist.py`(接 Task 1 的常量之后新增)
- Test: `backend/tests/test_kline.py`(`client` fixture 扩展)

**Interfaces:**
- Consumes: `_aggregate_close_by_freq`(Task 1)、`_tushare_post`、`models.IndexDailyModel`、`_BENCHMARK_CACHE`、`_BENCHMARK_TTL`、`_BENCHMARK_CODE`
- Produces: `_get_benchmark_series(freq: str, db: Session) -> list[tuple[str, float]]` —— 返回沪深300 按 freq 聚合的升序 close 序列;本地 `IndexDailyModel` 优先,tushare `index_daily` 兜底;带 `(freq,)` 缓存。

- [ ] **Step 1: Extend `client` fixture to include `IndexDailyModel` table + clear benchmark cache**

在 `test_kline.py` 的 `client` fixture 中:

```python
@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr("main.init_database", lambda: None)
    monkeypatch.setattr("main.create_tables", lambda: None)
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool,
                        connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.IndexDailyModel.__table__])
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
    wl._BENCHMARK_CACHE.clear()
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
```

并加一个 seed helper(在 `_seed` 之后):

```python
def _seed_index(client, rows):
    db = next(main.app.dependency_overrides[get_db]())
    for r in rows:
        db.add(models.IndexDailyModel(ts_code="000300.SH", trade_date=r["trade_date"], close=r["close"]))
    db.commit()
```

- [ ] **Step 2: Write failing tests**(追加到 `test_kline.py` 末尾)

```python
def test_benchmark_series_local_hit(monkeypatch, client):
    _seed_index(client, [{"trade_date": "20230103", "close": 4000},
                         {"trade_date": "20230104", "close": 4400}])
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("本地命中不应调 tushare")))
    db = next(main.app.dependency_overrides[get_db]())
    assert wl._get_benchmark_series("daily", db) == [("20230103", 4000.0), ("20230104", 4400.0)]


def test_benchmark_series_tushare_fallback(monkeypatch, client):
    from routers import watchlist as wl

    def fake_post(api_name, params):
        assert api_name == "index_daily"
        return [{"trade_date": "20230103", "close": 4000},
                {"trade_date": "20230104", "close": 4200}]

    monkeypatch.setattr(wl, "_tushare_post", fake_post)
    db = next(main.app.dependency_overrides[get_db]())
    assert wl._get_benchmark_series("daily", db) == [("20230103", 4000.0), ("20230104", 4200.0)]


def test_benchmark_series_cache_hit_skips_db(monkeypatch, client):
    from routers import watchlist as wl
    db = next(main.app.dependency_overrides[get_db]())
    # 第一次走 tushare 兜底(本地空)
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: [{"trade_date": "20230103", "close": 4000}])
    s1 = wl._get_benchmark_series("daily", db)
    assert s1 == [("20230103", 4000.0)]
    # 第二次应命中缓存,即使 tushare 抛错也不调
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("不应再调")))
    s2 = wl._get_benchmark_series("daily", db)
    assert s2 == s1


def test_benchmark_series_weekly_aggregates():
    """纯聚合路径:不依赖 DB,_get_benchmark_series 内部调 _aggregate_close_by_freq。"""
    from routers import watchlist as wl
    # 用 monkeypatch 无法轻松造 db 命中,这里只验证 _aggregate_close_by_freq 已在 Task1 覆盖;
    # weekly 端到端在 Task3 端点测试覆盖。
    pass   # 占位:weekly 聚合在 Task1 test_aggregate_close_weekly_last_trade_day 已验证
```

> 删除上面的 `test_benchmark_series_weekly_aggregates` 占位(weekly 已在 Task1 覆盖),保留前 3 个测试。

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v -k "benchmark_series"`
Expected: FAIL — `AttributeError: module has no attribute '_get_benchmark_series'`

- [ ] **Step 4: Write minimal implementation**(插入 `watchlist.py`,在 `_build_benchmark_points` 之后)

```python
def _get_benchmark_series(freq, db):
    """取沪深300(000300.SH)按 freq 聚合的升序 close 序列。
    本地 IndexDailyModel 优先,tushare index_daily 兜底。带 (freq,) 缓存,TTL _BENCHMARK_TTL。"""
    freq = freq if freq in ("daily", "weekly", "monthly") else "daily"
    now = time.time()
    hit = _BENCHMARK_CACHE.get(freq)
    if hit and now - hit["ts"] < _BENCHMARK_TTL:
        return hit["series"]
    rows_q = db.query(models.IndexDailyModel.trade_date, models.IndexDailyModel.close).filter(
        models.IndexDailyModel.ts_code == _BENCHMARK_CODE).all()
    if rows_q:
        rows = [{"trade_date": r.trade_date, "close": r.close} for r in rows_q]
    else:
        items = _tushare_post("index_daily", {"ts_code": _BENCHMARK_CODE})
        rows = [{"trade_date": it["trade_date"], "close": it.get("close")} for it in (items or [])]
    series = _aggregate_close_by_freq(rows, freq)
    _BENCHMARK_CACHE[freq] = {"series": series, "ts": now}
    return series
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v -k "benchmark_series"`
Expected: PASS(3 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/routers/watchlist.py backend/tests/test_kline.py
git commit -m "feat(kline): 沪深300 benchmark 取数(本地优先+tushare兜底)+缓存"
```

---

### Task 3: 后端 `get_kline` 端点整合 benchmark

**Files:**
- Modify: `backend/routers/watchlist.py`(`get_kline` 函数 + 新增 `_build_benchmark_payload`)
- Test: `backend/tests/test_kline.py`

**Interfaces:**
- Consumes: `_get_benchmark_series`(Task 2)、`_build_benchmark_points`(Task 1)
- Produces: `/kline` 响应新增 `benchmark: {name:"沪深300", code:"000300.SH", points:[{date, value}]} | null`

- [ ] **Step 1: Write failing tests**(追加到 `test_kline.py` 末尾)

```python
def test_kline_returns_benchmark_local(monkeypatch, client):
    _seed(client, "600519.SH", [
        {"trade_date": "20230103", "close": 100, "adj_factor": 1},
        {"trade_date": "20230104", "close": 110, "adj_factor": 1},
    ])
    _seed_index(client, [{"trade_date": "20230103", "close": 4000},
                         {"trade_date": "20230104", "close": 4400}])
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    b = r.json()["benchmark"]
    assert b["name"] == "沪深300" and b["code"] == "000300.SH"
    assert [p["date"] for p in b["points"]] == ["20230103", "20230104"]
    assert b["points"][0]["value"] == 100.0
    assert b["points"][1]["value"] == 110.0     # 4400/4000*100


def test_kline_benchmark_null_when_tushare_fails(monkeypatch, client):
    _seed(client, "600519.SH", [{"trade_date": "20230103", "close": 100, "adj_factor": 1}])
    from routers import watchlist as wl
    # 本地指数空 + tushare 抛错 → benchmark 降级 null,个股正常
    monkeypatch.setattr(wl, "_tushare_post",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    r = client.get("/api/db/watchlist/stock-detail/600519.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["benchmark"] is None
    assert [p["close"] for p in body["points"]] == [100.0]   # 个股不受影响


def test_kline_benchmark_null_when_stock_points_empty(monkeypatch, client):
    from routers import watchlist as wl
    monkeypatch.setattr(wl, "_tushare_post", lambda *a, **k: [])   # 个股也空
    r = client.get("/api/db/watchlist/stock-detail/999996.SH/kline?freq=daily&limit=10")
    assert r.status_code == 200
    assert r.json()["benchmark"] is None     # 个股无 points → 不算 benchmark
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v -k "kline_returns_benchmark or kline_benchmark_null"`
Expected: FAIL — 响应无 `benchmark` 字段(`KeyError` 或 `None != {...}`)

- [ ] **Step 3: Write minimal implementation**

先加 payload helper(插入 `watchlist.py`,在 `_get_benchmark_series` 之后):

```python
def _build_benchmark_payload(freq, db, points):
    """返回 {name, code, points} 或 None。任何失败都降级 None,不影响个股图。"""
    ref_dates = [p["date"] for p in points]
    if not ref_dates:
        return None
    try:
        series = _get_benchmark_series(freq, db)
        bench_points = _build_benchmark_points(series, ref_dates)
        if not bench_points:
            return None
        return {"name": "沪深300", "code": _BENCHMARK_CODE, "points": bench_points}
    except Exception:
        return None
```

再改 `get_kline` 的返回段。找到现有:

```python
    points = _build_kline_points(rows, freq, limit)
    data = _clean({"ts_code": ts_code, "freq": freq, "source": source, "points": points})
    _KLINE_CACHE[key] = {"data": data, "ts": now}
    return data
```

替换为:

```python
    points = _build_kline_points(rows, freq, limit)
    benchmark = _build_benchmark_payload(freq, db, points)
    data = _clean({"ts_code": ts_code, "freq": freq, "source": source,
                   "points": points, "benchmark": benchmark})
    _KLINE_CACHE[key] = {"data": data, "ts": now}
    return data
```

- [ ] **Step 4: Run full test suite to verify pass + no regression**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_kline.py -v`
Expected: PASS(全部,含原有 + 新增)

- [ ] **Step 5: Commit**

```bash
git add backend/routers/watchlist.py backend/tests/test_kline.py
git commit -m "feat(kline): /kline 端点返回沪深300归一化benchmark(失败降级null)"
```

---

### Task 4: 前端 dbApi 类型 + KlineChart 开关 + 归一化渲染

**Files:**
- Modify: `src/services/dbApi.ts`(`KlineResult` 加 benchmark)
- Modify: `src/components/agentRuntime/KlineChart.tsx`(开关 + 归一化 + bench 线)
- Test: `src/components/agentRuntime/KlineChart.test.tsx`

**Interfaces:**
- Consumes: 后端 `KlineResult.benchmark`(Task 3)
- Produces: `KlineChart` 新增 `showBench` 开关(默认关),开时百分比归一化轴 + 沪深300 虚线。

- [ ] **Step 0: 配色 —— invoke dataviz skill 选第 5 色**

实现前先 `Skill(dataviz)`:在现有 4 色(`close #2a78d6` / `ma5 #008300` / `ma10 #4a3aa7` / `ma20 #eb6834`)基础上加沪深300 线第 5 色,要求与四色在白底均 ≥3:1、最差相邻 CVD ΔE ≥12。校验通过的颜色记入下方 `COLORS.bench`(默认候选 `#6b6155` 灰褐,若校验不通过则按 dataviz 输出替换)+ 用虚线 `strokeDasharray="5 3"` 与个股 MA 实线区分。

- [ ] **Step 1: Write failing tests**(追加到 `KlineChart.test.tsx` 的 describe 块内)

```typescript
  it('toggles benchmark normalization on click', async () => {
    (dbApi.getKline as any).mockResolvedValue({
      ts_code: '600519.SH', freq: 'daily', source: 'local', points: POINTS,
      benchmark: { name: '沪深300', code: '000300.SH',
        points: [{ date: '20230103', value: 100 }, { date: '20230104', value: 105 }] },
    });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    const toggle = screen.getByTestId('kline-bench-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('disables benchmark toggle when benchmark null', async () => {
    (dbApi.getKline as any).mockResolvedValue({
      ts_code: '600519.SH', freq: 'daily', source: 'local', points: POINTS, benchmark: null,
    });
    render(<KlineChart ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByTestId('mock-chart')).toBeTruthy());
    expect(screen.getByTestId('kline-bench-toggle')).toBeDisabled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- KlineChart`
Expected: FAIL — `Unable to find an element by [data-testid="kline-bench-toggle"]`

- [ ] **Step 3: Update `dbApi.ts` types**(在 `KlineResult` 之前加子类型,`KlineResult` 加字段)

```typescript
export interface KlineBenchmarkPoint { date: string; value: number | null }
export interface KlineBenchmark { name: string; code: string; points: KlineBenchmarkPoint[] }
export interface KlineResult {
  ts_code: string;
  freq: 'daily' | 'weekly' | 'monthly';
  source: 'local' | 'tushare';
  points: KlinePoint[];
  benchmark?: KlineBenchmark | null;
}
```

- [ ] **Step 4: Update `KlineChart.tsx`**

4a. 加 bench 配色(Step 0 dataviz 校验结果,默认候选):

```typescript
const COLORS = { close: '#2a78d6', ma5: '#008300', ma10: '#4a3aa7', ma20: '#eb6834', bench: '#6b6155' };
```

4b. 在组件内 `useState` 区加:

```typescript
  const [showBench, setShowBench] = useState(false);
```

4c. 在 `fmtDate` 之后加归一化与合并数据逻辑:

```typescript
  const bench = data?.benchmark ?? null;
  const baseClose = data && data.points.length ? data.points[0].close : 0;
  const norm = (v: number | null | undefined) =>
    v == null || !baseClose ? null : (v / baseClose) * 100;
  const chartData = (data?.points ?? []).map((p, i) => {
    if (showBench && bench) {
      return {
        date: p.date,
        close: norm(p.close), ma5: norm(p.ma5), ma10: norm(p.ma10), ma20: norm(p.ma20),
        bench: bench.points[i]?.value ?? null,
      };
    }
    return { date: p.date, close: p.close, ma5: p.ma5, ma10: p.ma10, ma20: p.ma20 };
  });
  const yFmt = (v: number) => (v == null ? '' : (v - 100).toFixed(1) + '%');
```

4d. 在 freq 按钮区的 `<span>` 提示之前插入开关按钮:

```tsx
        <button data-testid="kline-bench-toggle" aria-pressed={showBench}
          disabled={!bench} onClick={() => setShowBench(s => !s)}
          style={{
            marginLeft: 'auto', padding: '4px 12px', cursor: bench ? 'pointer' : 'not-allowed',
            borderRadius: 6, fontSize: 12,
            border: `1px solid ${showBench && bench ? 'var(--accent-blue,#2b6cb0)' : '#D6CFC4'}`,
            background: showBench && bench ? 'var(--accent-blue,#2b6cb0)' : '#fff',
            color: showBench && bench ? '#fff' : '#6b6155',
            opacity: bench ? 1 : 0.5,
          }}>叠加沪深300{showBench ? ' ✓' : ''}</button>
```

> 注:开关放 freq 按钮区,`marginLeft:'auto'` 推到右端;原 `<span>` 提示文字保留在开关之后。

4e. 把 `<LineChart data={data.points}>` 改为 `data={chartData}`,`YAxis` 与 `Tooltip` 加归一化模式格式,并加 bench 线(仅 showBench 时):

```tsx
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#F0E7DA" />
              <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} minTickGap={24} />
              <YAxis fontSize={11} domain={['auto', 'auto']}
                tickFormatter={showBench && bench ? yFmt : undefined} />
              <Tooltip labelFormatter={fmtDate}
                formatter={(v: any) => showBench && bench ? yFmt(v) : v} />
              <Line type="monotone" dataKey="close" name="收盘" stroke={COLORS.close} dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="ma5" name="MA5" stroke={COLORS.ma5} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma10" name="MA10" stroke={COLORS.ma10} dot={false} connectNulls />
              <Line type="monotone" dataKey="ma20" name="MA20" stroke={COLORS.ma20} dot={false} connectNulls />
              {showBench && bench && (
                <Line type="monotone" dataKey="bench" name="沪深300" stroke={COLORS.bench}
                  dot={false} strokeWidth={2} strokeDasharray="5 3" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
```

4f.(可选,benchmark=null 时小提示)在空数据提示附近,若 `!loading && !error && data && data.points.length > 0 && !bench` 不强求提示(开关已置灰 + opacity 表达)。YAGNI,跳过额外文案。

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- KlineChart`
Expected: PASS(原有 3 + 新增 2 = 5)

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 7: Commit**

```bash
git add src/services/dbApi.ts src/components/agentRuntime/KlineChart.tsx src/components/agentRuntime/KlineChart.test.tsx
git commit -m "feat(kline): 前端叠加沪深300归一化对比开关(默认关,百分比轴)"
```

---

## Self-Review

**1. Spec 覆盖**:
- 归一化叠加 + 开关默认关 → Task 4(默认 `useState(false)`)✅
- 数据来源 本地 IndexDailyModel + tushare index_daily 兜底 → Task 2 ✅
- 后端归一化/对齐(可测) → Task 1/2 ✅
- 首日基准 + 缺值顺延 → Task 1 `test_build_benchmark_points_base_skips_missing_first_day` ✅
- benchmark 失败降级 null → Task 3 `test_kline_benchmark_null_*` ✅
- 独立缓存 → Task 2 `_BENCHMARK_CACHE[(freq,)]` ✅
- 沪深300 不画 MA → Task 4 仅一条 bench 线 ✅
- 配色 dataviz → Task 4 Step 0 ✅
- TDD 测试清单(spec)→ Task 1-4 全覆盖 ✅

**2. Placeholder 扫描**:删除了 Task 2 的 `test_benchmark_series_weekly_aggregates` 占位(weekly 在 Task 1 已测);其余步骤均含完整代码/命令/预期。

**3. 类型一致性**:
- `_aggregate_close_by_freq(rows, freq) -> list[tuple]` 在 Task1 定义,Task2 `_get_benchmark_series` 调用 ✅
- `_build_benchmark_points(series, ref_dates)` Task1 定义,Task3 `_build_benchmark_payload` 调用 ✅
- `_get_benchmark_series(freq, db)` Task2 定义,Task3 调用 ✅
- `KlineResult.benchmark` 字段名前后端一致(`points[].{date, value}`)✅
- `data-testid="kline-bench-toggle"` 测试与实现一致 ✅
- `COLORS.bench` 实现与 Step 0 一致 ✅

**4. 缓存 key 细化**:spec 写 `(freq, limit)`,plan 细化为 `(freq,)`——沪深300 聚合序列与 limit 无关(对齐时按个股 ref_dates 取子集),更省且正确。

无遗留问题。

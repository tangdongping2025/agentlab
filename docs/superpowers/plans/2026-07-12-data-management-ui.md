# 数据管理 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans,checkbox 跟踪。

**Goal:** invest agent 加"数据管理" tab:UI 触发抓取(自动增量/全量)+ 进度轮询 + 数据状态;后端 daemon thread 异步跑、`fetch_candidates_data.py` 增量化。

**Architecture:** 前端新 `DataManagementPanel` + dbApi 三方法;后端新 `routers/data_fetch.py`(trigger/progress/status + daemon thread + 内存 `_JOB`);`fetch_candidates_data.py` 读 `FetchLog` 锚点做增量、daily 写入按日期区间 DELETE+INSERT、加 `progress_callback`。

**Tech Stack:** FastAPI + threading + SQLAlchemy;React + setInterval 轮询。

## Global Constraints

- 三表 PK:`stock_daily(code,trade_date)` / `fundamental_pit(code,end_date,ann_date)` / `index_constituent(index_code,trade_date,code)` —— 增量 daily 用 `(code, trade_date>=start_date)` 删除区间
- `FetchLogModel(source PK, last_anchor_date, last_updated_at, rows_total, note 200字符)` —— source="stock_daily" 记 daily 锚点
- tabs 数据驱动:`invest_agent.py:16` tabs 数组 → `TabsWorkspace.tsx:19` 读取 + `L65-73` switch 渲染
- `dbApi.ts` `req<T>(path, options)` helper(L5-15),`dbApi` 对象(L229+)
- `fetch_all` 是 sync + 持 Session,**必须** daemon thread 跑(不阻塞 FastAPI 事件循环)
- index_weight 必须**保历史全量**(PIT 依赖,不能只抓最新)

---

### Task 1: `fetch_candidates_data.py` 增量改造(TDD)

**Files:** Modify `backend/scripts/fetch_candidates_data.py`; Test `backend/tests/test_fetch_incremental.py`

**Interfaces:**
- Produces: `fetch_all(pro, db, index_code, start_date=None, end_date=None, sleep=0.3, force_full=False, progress_callback=None) -> dict` —— start_date=None 时读 FetchLog 推导(增量);progress_callback(done, total, current_code, fail)

- [ ] **Step 1: 写失败测试 `test_fetch_incremental.py`**

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from unittest.mock import MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__, models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


class _FakePro:
    """假 tushare pro:返回固定 DataFrame。"""
    def index_weight(self, index_code): 
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20200101", "con_code": "600000.SH", "weight": 1.0}])
    def daily(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20200101", "close": 10.0}, {"trade_date": "20200102", "close": 11.0}])
    def daily_basic(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20200101", "pe_ttm": 8.0, "total_mv": 1e5},
                             {"trade_date": "20200102", "pe_ttm": 9.0, "total_mv": 1.1e5}])
    def adj_factor(self, ts_code, start_date, end_date):
        import pandas as pd
        return pd.DataFrame([{"trade_date": "20200101", "adj_factor": 1.0}, {"trade_date": "20200102", "adj_factor": 1.0}])
    def fina_indicator(self, ts_code):
        import pandas as pd
        return pd.DataFrame([{"ts_code": ts_code, "end_date": "20191231", "ann_date": "20200330",
                              "roe": 15.0, "grossprofit_margin": 30.0, "debt_to_assets": 40.0}])


def test_fetch_full_when_no_fetchlog(db):
    from fetch_candidates_data import fetch_all
    counts = fetch_all(_FakePro(), db, start_date="20200101", end_date="20200102")
    assert db.query(models.StockDailyModel).count() == 2
    assert db.query(models.IndexConstituentModel).count() == 1
    # 成功后写 FetchLog
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    assert log and log.last_anchor_date == "20200102"


def test_fetch_incremental_uses_anchor(db):
    """有 FetchLog → start_date 推导为 anchor+1,只抓新日期。"""
    from fetch_candidates_data import fetch_all
    # 预置锚点 20200102(已抓到这天)
    db.add(models.FetchLogModel(source="stock_daily", last_anchor_date="20200102"))
    db.commit()
    pro = _FakePro()
    # daily 只返回 20200103(新日期)
    import pandas as pd
    pro.daily = lambda ts_code, start_date, end_date: pd.DataFrame(
        [{"trade_date": "20200103", "close": 12.0}])
    pro.daily_basic = lambda ts_code, start_date, end_date: pd.DataFrame(
        [{"trade_date": "20200103", "pe_ttm": 10.0, "total_mv": 1.2e5}])
    pro.adj_factor = lambda ts_code, start_date, end_date: pd.DataFrame(
        [{"trade_date": "20200103", "adj_factor": 1.0}])
    fetch_all(pro, db, end_date="20200103")  # start_date=None → 读 anchor
    # 旧日期(20200101/02)不被删(增量只删 >= start_date=20200103)
    dates = sorted(r.trade_date for r in db.query(models.StockDailyModel).all())
    assert dates == ["20200103"]  # 只有新日期(库原本空)


def test_progress_callback_invoked(db):
    from fetch_candidates_data import fetch_all
    calls = []
    fetch_all(_FakePro(), db, start_date="20200101", end_date="20200102",
              progress_callback=lambda done, total, cur, fail: calls.append((done, total, cur)))
    assert len(calls) >= 1 and calls[-1][0] == calls[-1][1]  # 最后 done==total
```

- [ ] **Step 2: 跑测试确认失败**

`cd backend && python -m pytest tests/test_fetch_incremental.py -v` → FAIL(signature 不匹配 / 功能缺失)

- [ ] **Step 3: 改造 `fetch_candidates_data.py`**

关键改动(基于现有 L78-123):
```python
def _resolve_start_date(db, force_full, explicit_start):
    """有锚点且非 force_full → 增量(anchor+1 日历日);否则全量(用 explicit_start 或默认)。"""
    if force_full or explicit_start:
        return explicit_start or "20200101"
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    if not log or not log.last_anchor_date:
        return "20200101"
    # anchor+1 日历日(tushare daily 会过滤非交易日)
    from datetime import datetime, timedelta
    d = datetime.strptime(log.last_anchor_date, "%Y%m%d") + timedelta(days=1)
    return d.strftime("%Y%m%d")


def fetch_all(pro, db, index_code="000300.SH", start_date=None, end_date=None,
              sleep=0.3, force_full=False, progress_callback=None):
    eff_start = _resolve_start_date(db, force_full, start_date)
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
            sd = _merge_daily(pro, code, eff_start, end_date)
            # 增量:只删 >= eff_start 的行(旧数据保留)
            db.query(models.StockDailyModel).filter(
                models.StockDailyModel.code == code,
                models.StockDailyModel.trade_date >= eff_start).delete()
            for r in sd:
                db.add(models.StockDailyModel(**r))
            fp = _fetch_fundamentals(pro, code)
            for r in fp:
                db.merge(models.FundamentalPitModel(**r))  # 全量 upsert(PK 幂等)
            db.commit()
            counts["stock_daily"] += len(sd)
            counts["fundamental_pit"] += len(fp)
        except Exception as e:
            fail += 1; db.rollback(); print(f"[warn] {code} 抓取失败: {e}")
        if progress_callback:
            progress_callback(i + 1, len(codes), code, fail)
        if sleep:
            time.sleep(sleep)
    db.merge(models.FetchLogModel(
        source="stock_daily", last_anchor_date=end_date,
        last_updated_at=datetime.utcnow(),
        rows_total=db.query(models.StockDailyModel).count(),
        note=f"start={eff_start} codes={len(codes)} fail={fail}"))
    db.commit()
    print(f"[done] {counts} start={eff_start} codes={len(codes)} fail={fail}")
    return counts
```

- [ ] **Step 4: 跑测试通过** → `4 passed`

- [ ] **Step 5: Commit**
```bash
git add backend/scripts/fetch_candidates_data.py backend/tests/test_fetch_incremental.py
git commit -m "feat(data): fetch_candidates_data 增量化(读 FetchLog 锚点 + progress_callback + force_full)"
```

---

### Task 2: `routers/data_fetch.py`(TDD)

**Files:** Create `backend/routers/data_fetch.py`; Test `backend/tests/test_data_fetch_router.py`

**Interfaces:** Produces `routers/data_fetch.py` with `router`(prefix `/api/db`),`main.py` 注册后端点:
- `GET /fetch/status` → `{stock_daily, fundamental_pit, index_constituent, last_anchor_date, last_updated_at}`
- `POST /fetch/trigger` `{force_full?:bool}` → `{job_id, state}`(running 时 409)
- `GET /fetch/progress` → `_JOB` dict

- [ ] **Step 1: 写失败测试 `test_data_fetch_router.py`**

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    # 跳过真 DB 连接,用 sqlite 内存 + 仅建需要的表
    import main as main_mod
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from database import Base, get_db
    import models
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__, models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__, models.FetchLogModel.__table__])
    S = sessionmaker(bind=eng)
    def _get_db():
        db = S(); try: yield db; finally: db.close()
    main_mod.app.dependency_overrides[get_db] = _get_db
    yield TestClient(main_mod.app)
    main_mod.app.dependency_overrides.clear()


def test_status_empty(client):
    r = client.get("/api/db/fetch/status")
    assert r.status_code == 200
    d = r.json()
    assert d["stock_daily"] == 0 and d["last_anchor_date"] is None


def test_trigger_then_progress(client):
    import routers.data_fetch as df
    df._reset_job()  # 测试前清状态
    # mock fetch_all 立即完成(不真抓)
    with patch("routers.data_fetch._run_fetch_job", lambda force_full: df._JOB.update(state="done", done=30, total=30)):
        r = client.post("/api/db/fetch/trigger", json={})
        assert r.status_code == 200 and r.json()["state"] in ("running", "done")
    # progress
    p = client.get("/api/db/fetch/progress").json()
    assert p["state"] == "done" and p["done"] == 30


def test_trigger_mutex_when_running(client):
    import routers.data_fetch as df
    df._reset_job()
    df._JOB.update(state="running")
    r = client.post("/api/db/fetch/trigger", json={})
    assert r.status_code == 409
```

- [ ] **Step 2: 跑测试确认失败**(无 data_fetch 模块)

- [ ] **Step 3: 写 `routers/data_fetch.py`**

```python
"""数据抓取管理:异步触发(daemon thread)+ 进度查询 + 状态查询。"""
import threading
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/db", tags=["data_fetch"])

# 进程内任务状态(backend 重启重置 idle)
_JOB: dict = {"state": "idle", "done": 0, "total": 0, "current_code": "",
              "fail": 0, "started_at": None, "finished_at": None, "error": None,
              "force_full": False}


def _reset_job():
    _JOB.update(state="idle", done=0, total=0, current_code="", fail=0,
                started_at=None, finished_at=None, error=None, force_full=False)


def _update_job(done, total, current_code, fail):
    _JOB["done"] = done; _JOB["total"] = total
    _JOB["current_code"] = current_code; _JOB["fail"] = fail


def _run_fetch_job(force_full: bool):
    import sys, os
    _SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
    if _SCRIPTS not in sys.path:
        sys.path.insert(0, _SCRIPTS)
    from database import SessionLocal
    from config import settings
    db = SessionLocal()
    try:
        token = (settings.tushare_token or "").strip()
        if not token:
            raise RuntimeError("tushare_token 未配置")
        import tushare as ts
        from fetch_candidates_data import fetch_all
        pro = ts.pro_api(token)
        fetch_all(pro, db, force_full=force_full, progress_callback=_update_job)
        _JOB["state"] = "done"; _JOB["finished_at"] = datetime.utcnow().isoformat()
    except Exception as e:
        _JOB["state"] = "failed"; _JOB["error"] = str(e)
        _JOB["finished_at"] = datetime.utcnow().isoformat()
    finally:
        db.close()


@router.get("/fetch/status")
def fetch_status(db: Session = Depends(get_db)):
    log = db.query(models.FetchLogModel).filter_by(source="stock_daily").first()
    return {
        "stock_daily": db.query(models.StockDailyModel).count(),
        "fundamental_pit": db.query(models.FundamentalPitModel).count(),
        "index_constituent": db.query(models.IndexConstituentModel).count(),
        "last_anchor_date": log.last_anchor_date if log else None,
        "last_updated_at": log.last_updated_at.isoformat() if log and log.last_updated_at else None,
    }


@router.post("/fetch/trigger")
def fetch_trigger(payload: dict):
    if _JOB.get("state") == "running":
        raise HTTPException(status_code=409, detail="已有抓取任务在跑")
    force_full = bool(payload.get("force_full", False))
    _reset_job()
    _JOB.update(state="running", started_at=datetime.utcnow().isoformat(), force_full=force_full)
    threading.Thread(target=_run_fetch_job, args=(force_full,), daemon=True).start()
    return {"job_id": "singleton", "state": "running"}


@router.get("/fetch/progress")
def fetch_progress():
    return dict(_JOB)
```

- [ ] **Step 4: `main.py` 注册 router**(`app.include_router(data_fetch.router)`)

- [ ] **Step 5: 跑测试通过** → `3 passed`

- [ ] **Step 6: Commit**
```bash
git add backend/routers/data_fetch.py backend/tests/test_data_fetch_router.py backend/main.py
git commit -m "feat(data): data_fetch router(异步触发+进度+状态,daemon thread)"
```

---

### Task 3: 前端 `dbApi.ts` 加方法

**Files:** Modify `src/services/dbApi.ts`

- [ ] **Step 1: 加类型 + 方法**(在 dbApi 对象末尾,`promoteCandidate` 后)
```typescript
export interface FetchStatus {
  stock_daily: number; fundamental_pit: number; index_constituent: number;
  last_anchor_date: string | null; last_updated_at: string | null;
}
export interface FetchProgress {
  state: 'idle' | 'running' | 'done' | 'failed';
  done: number; total: number; current_code: string; fail: number;
  started_at: string | null; finished_at: string | null; error: string | null;
}
// dbApi 对象内追加:
  getFetchStatus: () => req<FetchStatus>('/fetch/status'),
  triggerFetch: (force_full = false) =>
    req<{ job_id: string; state: string }>('/fetch/trigger', { method: 'POST', body: JSON.stringify({ force_full }) }),
  getFetchProgress: () => req<FetchProgress>('/fetch/progress'),
```

- [ ] **Step 2: typecheck** → `npm run typecheck` 通过

- [ ] **Step 3: Commit**

---

### Task 4: 前端 `DataManagementPanel.tsx`

**Files:** Create `src/components/agentRuntime/DataManagementPanel.tsx`

- [ ] **Step 1: 写组件**(参考 CandidatePanel 范式:顶栏 + running + error + 结果;加 setInterval 轮询)
```tsx
import React, { useEffect, useState, useRef } from 'react';
import { dbApi, type FetchStatus, type FetchProgress } from '../../services/dbApi';

const DataManagementPanel: React.FC = () => {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [progress, setProgress] = useState<FetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadStatus = async () => { try { setStatus(await dbApi.getFetchStatus()); } catch (e) { setError('状态加载失败'); } };
  useEffect(() => { loadStatus(); }, []);

  const stopPolling = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startPolling = () => {
    stopPolling();
    timerRef.current = window.setInterval(async () => {
      try {
        const p = await dbApi.getFetchProgress(); setProgress(p);
        if (p.state === 'done' || p.state === 'failed') { stopPolling(); loadStatus(); }
      } catch { /* 忽略轮询瞬时错误 */ }
    }, 2000);
  };
  useEffect(() => () => stopPolling(), []);

  const trigger = async (force_full: boolean) => {
    setError(null); setProgress({ state: 'running', done: 0, total: 0, current_code: '', fail: 0, started_at: null, finished_at: null, error: null });
    try { await dbApi.triggerFetch(force_full); startPolling(); }
    catch (e) { setError(e instanceof Error ? e.message : '触发失败'); setProgress(null); }
  };

  const mode = status?.last_anchor_date ? '增量' : '全量';
  const pct = progress && progress.total ? Math.round(progress.done / progress.total * 100) : 0;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#EFE7DA', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>数据状态</div>
        {status ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, color: '#6b6155' }}>
            <span>日线:<b>{status.stock_daily}</b> 行</span>
            <span>基本面:<b>{status.fundamental_pit}</b> 行</span>
            <span>成分:<b>{status.index_constituent}</b> 行</span>
            <span>锚点:<b>{status.last_anchor_date || '无(首次将全量)'}</b></span>
          </div>
        ) : <span>加载中…</span>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => trigger(false)} disabled={progress?.state === 'running'}
          style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: progress?.state === 'running' ? '#8aa8c9' : '#2b6cb0', color: '#fff', cursor: progress?.state === 'running' ? 'not-allowed' : 'pointer' }}>
          {progress?.state === 'running' ? '抓取中…' : `📡 抓取数据(${mode})`}
        </button>
        <button onClick={() => trigger(true)} disabled={progress?.state === 'running'}
          style={{ padding: '8px 16px', border: '1px solid #D6CFC4', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
          🔧 强制全量修复
        </button>
      </div>

      {error && <div style={{ color: '#d9534f', fontSize: 12 }}>{error}</div>}

      {progress && progress.state !== 'idle' && (
        <div style={{ background: '#fff', border: '1px solid #E5DCC9', borderRadius: 8, padding: 12, fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>状态:<b>{progress.state}</b> · {progress.done}/{progress.total}({pct}%) · 当前 {progress.current_code} · 失败 {progress.fail}</div>
          <div style={{ height: 8, background: '#E5DCC9', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#2b6cb0', transition: 'width 0.5s' }} />
          </div>
          {progress.state === 'done' && <div style={{ color: '#5cb85c', marginTop: 8 }}>✓ 抓取完成</div>}
          {progress.state === 'failed' && <div style={{ color: '#d9534f', marginTop: 8 }}>✗ {progress.error}</div>}
        </div>
      )}
    </div>
  );
};
export default DataManagementPanel;
```

- [ ] **Step 2: typecheck** 通过

- [ ] **Step 3: Commit**

---

### Task 5: 挂载到 tabs

**Files:** Modify `backend/agents/invest_agent.py:16`; `src/components/agentRuntime/TabsWorkspace.tsx`

- [ ] **Step 1: invest_agent tabs 加"数据管理"**
`invest_agent.py:16` tabs 数组末尾追加 `"数据管理"` → `["对话", "文件", "Skill", "自选股", "候选池", "回测", "数据管理"]`

- [ ] **Step 2: TabsWorkspace switch 加 case**
`TabsWorkspace.tsx` import DataManagementPanel;L72 后加:
```tsx
{activeStatic === '数据管理' && <DataManagementPanel />}
```

- [ ] **Step 3: typecheck** 通过 + Commit

---

### Task 6: 部署 + 端到端验证

- [ ] **Step 1: rebuild backend + frontend**(代码变了)
`docker compose -f docker-compose.local.yml up -d --build backend frontend`
- [ ] **Step 2: API 验证**
`curl localhost:8080/api/db/fetch/status` → `{"stock_daily":23490,...}`(当前合成数据)
`curl -X POST localhost:8080/api/db/fetch/trigger -d '{}'` → `{"job_id":"singleton","state":"running"}`(token 已配,真抓沪深300,后台跑)
`curl localhost:8080/api/db/fetch/progress` → 进度(若 tushare 积分够,逐步 done/total 增长)
- [ ] **Step 3: UI 验证**(用户)浏览器 localhost:8080 → 投资助手 → "数据管理" tab → 看状态 + 点抓取看进度条
- [ ] **Step 4: 增量验证**抓完一次后,再点抓取 → 显示"增量"(last_anchor_date 有值),start_date=anchor+1(快)

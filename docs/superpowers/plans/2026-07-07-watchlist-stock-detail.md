# 自选股股票详情页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自选股面板点股票 → 新增独立 tab → 展示该股 6 维度分析详情(公司画像+总分+成长/盈利/估值/趋势/安全)

**Architecture:** 后端搬 analyze/report/data_loader 三脚本 + 新端点返回结构化 JSON(10分钟缓存);前端 store 管 stockTabs,TabsWorkspace 渲染动态 tab,新组件 StockDetailPanel 渲染 6 子 tab

**Tech Stack:** Python FastAPI + tushare + pandas / React 18 + TypeScript + Zustand + Vitest

## Global Constraints

- 后端测试连 SQLite/memory(复用 conftest),tushare 调用全 mock,不真连
- 三个脚本(data_loader.py/analyze.py/report.py)从 python-learning 搬到 backend/scripts/,**不改脚本内部 import**(靠 sys.path 兼容)
- 重复点同股票不开新 tab(openStockTab 查重 → 只切 active)
- 端点返回 JSON 不走 generate_report(markdown),只用 analyze + score
- 缓存 TTL 10 分钟,失败不缓存
- 股票 tab 只在 invest agent 下出现(自选股是 invest 专属)

---

### Task 1: 后端 — 搬脚本 + stock-detail 端点 + 缓存

**Files:**
- Create: `backend/scripts/__init__.py`(空文件,标记为包)
- Copy: `python-learning/scripts/data_loader.py` → `backend/scripts/data_loader.py`
- Copy: `python-learning/scripts/analyze.py` → `backend/scripts/analyze.py`
- Copy: `python-learning/scripts/report.py` → `backend/scripts/report.py`
- Modify: `backend/routers/watchlist.py`(顶部加 sys.path + import;末尾加端点 + 缓存)
- Test: `backend/tests/test_stock_detail.py`

**Interfaces:**
- Consumes: `analyze.analyze_stock(ts_code, start_date, end_date, pro) -> dict`、`report.score(analysis) -> dict`(均来自脚本,签名不改)
- Produces: `GET /api/db/watchlist/stock-detail/{ts_code}` 返回 JSON(结构见 spec 第 3 节)

- [ ] **Step 1: 搬脚本**

```bash
mkdir -p backend/scripts && touch backend/scripts/__init__.py
cp ../python-learning/scripts/data_loader.py backend/scripts/data_loader.py
cp ../python-learning/scripts/analyze.py backend/scripts/analyze.py
cp ../python-learning/scripts/report.py backend/scripts/report.py
```

确认 3 个 .py + __init__.py 都在 backend/scripts/。

- [ ] **Step 2: 写后端失败测试**

创建 `backend/tests/test_stock_detail.py`:

```python
import time
import pandas as pd
from fastapi.testclient import TestClient
import main


def _fake_analysis():
    return {
        'basic': {'name': '贵州茅台', 'industry': '白酒', 'market': '主板', 'list_date': '20010827'},
        'panel': pd.DataFrame([{
            'close': 1212.1, 'pe_ttm': 18.4, 'pb': 5.59,
            'total_mv': 1.5e12, 'dv_ttm': 2.5,
        }]),
        'growth': {'rev_cagr_2y': 18.5, 'np_yoy': 22.3},
        'profit': {'roe': 30.0, 'gross_margin': 91.0, 'net_margin': 50.0, 'cash_ratio': 1.2},
        'value':  {'pe_now': 18.4, 'pe_pct': 0.35, 'peg': 0.8},
        'trend':  {'ret_1y': 0.15, 'above_ma60': True},
        'safety': {'debt_ratio': 25.0, 'current_ratio': 3.5, 'max_dd': -0.3},
    }


def _fake_score(a):
    return {
        'dim_scores':  {'成长性': 95, '盈利质量': 95, '估值': 70, '趋势': 90, '安全': 85},
        'dim_labels':  {'成长性': '🟢', '盈利质量': '🟢', '估值': '🟡', '趋势': '🟢', '安全': '🟢'},
        'dim_reasons': {'成长性': '均值高增长', '盈利质量': 'ROE 30%', '估值': 'PE分位35%',
                        '趋势': '站上MA60', '安全': '财务稳健'},
        'total': 88.5,
        'verdict': '通过初筛,值得深入研究',
    }


def test_stock_detail_returns_json(monkeypatch):
    """端点返回结构化 JSON(含 basic/quotes/score/5 维度)"""
    from routers import watchlist as wl
    calls = {'n': 0}
    def mock_analyze(ts_code, **kw):
        calls['n'] += 1
        return _fake_analysis()
    monkeypatch.setattr(wl, 'analyze_stock', mock_analyze)
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    r = client.get('/api/db/watchlist/stock-detail/600519.SH')
    assert r.status_code == 200
    body = r.json()
    assert body['basic']['name'] == '贵州茅台'
    assert body['quotes']['close'] == 1212.1
    assert body['quotes']['pe_ttm'] == 18.4
    assert body['score']['total'] == 88.5
    assert body['score']['verdict'] == '通过初筛,值得深入研究'
    assert body['score']['dim_scores']['成长性'] == 95
    assert body['growth']['rev_cagr_2y'] == 18.5
    assert body['trend']['above_ma60'] is True


def test_stock_detail_cache_hit(monkeypatch):
    """第二次调用命中缓存,不重复调 analyze"""
    from routers import watchlist as wl
    calls = {'n': 0}
    def mock_analyze(ts_code, **kw):
        calls['n'] += 1
        return _fake_analysis()
    monkeypatch.setattr(wl, 'analyze_stock', mock_analyze)
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    client.get('/api/db/watchlist/stock-detail/600519.SH')
    client.get('/api/db/watchlist/stock-detail/600519.SH')
    assert calls['n'] == 1  # 只调了一次


def test_stock_detail_error(monkeypatch):
    """analyze 抛错 → 500,不缓存"""
    from routers import watchlist as wl
    def boom(ts_code, **kw):
        raise RuntimeError('tushare 挂了')
    monkeypatch.setattr(wl, 'analyze_stock', boom)
    monkeypatch.setattr(wl, 'score', _fake_score)
    wl._DETAIL_CACHE.clear()

    client = TestClient(main.app)
    r = client.get('/api/db/watchlist/stock-detail/999999.SH')
    assert r.status_code == 500
    assert wl._DETAIL_CACHE.get('999999.SH') is None  # 失败不缓存
```

- [ ] **Step 3: 运行测试,验证失败**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_stock_detail.py -v
```

Expected: 3 FAIL(端点不存在 / analyze_stock 未 import)

- [ ] **Step 4: 实现 — watchlist.py 顶部加 import**

`backend/routers/watchlist.py` 顶部(import 段之后,router 定义之前)加:

```python
import os
import sys

# 把 backend/scripts 加到 path,让 analyze/report 能 import data_loader(脚本内部依赖)
_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)
os.environ.setdefault('TUSHARE_TOKEN', settings.tushare_token)

from analyze import analyze_stock  # noqa: E402
from report import score as score_stock  # noqa: E402
```

- [ ] **Step 5: 实现 — 末尾加端点 + 缓存**

`backend/routers/watchlist.py` 文件末尾加:

```python
_DETAIL_TTL = 600.0  # 10 分钟
_DETAIL_CACHE: dict = {}  # {ts_code: {"data": ..., "ts": float}}


@router.get("/watchlist/stock-detail/{ts_code}")
def get_stock_detail(ts_code: str):
    now = time.time()
    hit = _DETAIL_CACHE.get(ts_code)
    if hit and now - hit["ts"] < _DETAIL_TTL:
        return hit["data"]
    try:
        analysis = analyze_stock(ts_code)
        scored = score_stock(analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {e}")
    last = analysis["panel"].iloc[-1] if len(analysis["panel"]) else {}
    data = {
        "basic": analysis["basic"],
        "quotes": {
            "close": last.get("close"),
            "pe_ttm": last.get("pe_ttm"),
            "pb": last.get("pb"),
            "total_mv": last.get("total_mv"),
            "dv_ttm": last.get("dv_ttm"),
        },
        "score": {
            "total": scored["total"],
            "verdict": scored["verdict"],
            "dim_scores": scored["dim_scores"],
            "dim_labels": scored["dim_labels"],
            "dim_reasons": scored["dim_reasons"],
        },
        "growth": analysis["growth"],
        "profit": analysis["profit"],
        "value": analysis["value"],
        "trend": analysis["trend"],
        "safety": analysis["safety"],
    }
    _DETAIL_CACHE[ts_code] = {"data": data, "ts": now}
    return data
```

注意:测试里 `monkeypatch.setattr(wl, 'score', _fake_score)`,所以模块里要暴露 `score` 这个名字。上面 import 用了 `score as score_stock`,需补一个别名。把 import 改为:

```python
from report import score as score_stock  # noqa: E402
score = score_stock  # 测试 monkeypatch 目标
```

- [ ] **Step 6: 运行测试,验证通过**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_stock_detail.py -v
```

Expected: 3 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/ backend/routers/watchlist.py backend/tests/test_stock_detail.py
git commit -m "feat(watchlist): stock-detail 端点 + 搬 analyze/report 脚本(10min 缓存)"
```

---

### Task 2: 前端 store — stockTabs 状态 + open/close

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`(interface + 实现)
- Test: `src/stores/agentRuntimeStore.test.ts`

**Interfaces:**
- Produces: `stockTabs: {ts_code, name}[]`、`activeStockTab: string | null`、`openStockTab(ts_code, name)`、`closeStockTab(ts_code)`

- [ ] **Step 1: 写失败测试**

在 `src/stores/agentRuntimeStore.test.ts` 末尾追加:

```typescript
describe('stockTabs', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({ stockTabs: [], activeStockTab: null });
  });

  it('openStockTab adds new tab and sets active', () => {
    useAgentRuntimeStore.getState().openStockTab('600519.SH', '贵州茅台');
    const s = useAgentRuntimeStore.getState();
    expect(s.stockTabs).toEqual([{ ts_code: '600519.SH', name: '贵州茅台' }]);
    expect(s.activeStockTab).toBe('600519.SH');
  });

  it('openStockTab does NOT duplicate existing tab, only switches active', () => {
    useAgentRuntimeStore.getState().openStockTab('600519.SH', '贵州茅台');
    useAgentRuntimeStore.getState().openStockTab('600519.SH', '贵州茅台');
    expect(useAgentRuntimeStore.getState().stockTabs).toHaveLength(1);
    expect(useAgentRuntimeStore.getState().activeStockTab).toBe('600519.SH');
  });

  it('closeStockTab removes tab and clears active', () => {
    useAgentRuntimeStore.getState().openStockTab('600519.SH', '贵州茅台');
    useAgentRuntimeStore.getState().openStockTab('000001.SZ', '平安银行');
    useAgentRuntimeStore.getState().closeStockTab('600519.SH');
    const s = useAgentRuntimeStore.getState();
    expect(s.stockTabs).toEqual([{ ts_code: '000001.SZ', name: '平安银行' }]);
    expect(s.activeStockTab).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试,验证失败**

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts -t stockTabs --reporter verbose
```

Expected: FAIL(openStockTab 不是函数)

- [ ] **Step 3: 实现 store**

`src/stores/agentRuntimeStore.ts`:

interface 加(在 `pendingWatchlistSuggestion` 那块附近):
```typescript
stockTabs: { ts_code: string; name: string }[];
activeStockTab: string | null;
openStockTab: (ts_code: string, name: string) => void;
closeStockTab: (ts_code: string) => void;
```

初始 state 加(在 `pendingWatchlistSuggestion: null,` 附近):
```typescript
stockTabs: [],
activeStockTab: null,
```

实现方法(在 `clearWatchlistSuggestion` 后面):
```typescript
openStockTab: (ts_code, name) => {
  const exists = get().stockTabs.find(s => s.ts_code === ts_code);
  if (exists) {
    set({ activeStockTab: ts_code });
    return;
  }
  set({
    stockTabs: [...get().stockTabs, { ts_code, name }],
    activeStockTab: ts_code,
  });
},
closeStockTab: (ts_code) => {
  set({
    stockTabs: get().stockTabs.filter(s => s.ts_code !== ts_code),
    activeStockTab: null,
  });
},
```

- [ ] **Step 4: 运行测试,验证通过**

```bash
npx vitest run src/stores/agentRuntimeStore.test.ts -t stockTabs --reporter verbose
```

Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(watchlist): store stockTabs 状态 + open(查重)/close"
```

---

### Task 3: TabsWorkspace — 动态 tab 渲染 + 关闭

**Files:**
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Test: `src/components/agentRuntime/TabsWorkspace.test.tsx`(若不存在则创建)

**Interfaces:**
- Consumes: `stockTabs`、`activeStockTab`、`closeStockTab`(来自 Task 2)
- Produces: tab 栏渲染股票 tab(带 ×)+ 内容区切到 StockDetailPanel

- [ ] **Step 1: 写失败测试**

创建/追加 `src/components/agentRuntime/TabsWorkspace.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import TabsWorkspace from './TabsWorkspace';

vi.mock('../../services/agentRuntimeApi', () => ({
  listAgents: vi.fn().mockResolvedValue([
    { id: 'invest', name: '投资助手', workspace: { type: 'tabs', tabs: ['对话', '自选股'] } },
  ]),
  runAgent: vi.fn(),
}));

describe('TabsWorkspace dynamic stock tabs', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'invest', name: '投资助手', workspace: { type: 'tabs', tabs: ['对话', '自选股'] } }],
      currentAgentId: 'invest',
      stockTabs: [],
      activeStockTab: null,
    });
  });

  it('renders static tabs', () => {
    render(<TabsWorkspace />);
    expect(screen.getByText('自选股')).toBeTruthy();
  });

  it('renders stock tab with close button when stockTabs has item', () => {
    useAgentRuntimeStore.setState({
      stockTabs: [{ ts_code: '600519.SH', name: '贵州茅台' }],
      activeStockTab: '600519.SH',
    });
    render(<TabsWorkspace />);
    expect(screen.getByText('贵州茅台')).toBeTruthy();
    expect(screen.getByTestId('stock-tab-close-600519.SH')).toBeTruthy();
  });

  it('clicking close button calls closeStockTab', () => {
    useAgentRuntimeStore.setState({
      stockTabs: [{ ts_code: '600519.SH', name: '贵州茅台' }],
      activeStockTab: '600519.SH',
    });
    render(<TabsWorkspace />);
    fireEvent.click(screen.getByTestId('stock-tab-close-600519.SH'));
    expect(useAgentRuntimeStore.getState().stockTabs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试,验证失败**

```bash
npx vitest run src/components/agentRuntime/TabsWorkspace.test.tsx --reporter verbose
```

Expected: FAIL(没渲染股票 tab / 没关闭按钮)

- [ ] **Step 3: 实现 TabsWorkspace 动态 tab**

重写 `src/components/agentRuntime/TabsWorkspace.tsx`:

```tsx
import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import ChatWorkspace from './ChatWorkspace';
import FilesPanel from './FilesPanel';
import SkillPanel from './SkillPanel';
import McpPanel from './McpPanel';
import MemoryPanel from './MemoryPanel';
import WatchlistPanel from './WatchlistPanel';
import StockDetailPanel from './StockDetailPanel';

const TabsWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceCwd } = useAgentRuntimeStore();
  const stockTabs = useAgentRuntimeStore(s => s.stockTabs);
  const activeStockTab = useAgentRuntimeStore(s => s.activeStockTab);
  const closeStockTab = useAgentRuntimeStore(s => s.closeStockTab);
  const agent = agents.find(a => a.id === currentAgentId);
  const staticTabs = (agent?.workspace as any)?.tabs || ['对话'];
  const [staticActive, setStaticActive] = useState(staticTabs[0]);

  // active 优先级:activeStockTab(股票 tab)> staticActive(静态 tab)
  const activeStock = activeStockTab && stockTabs.find(s => s.ts_code === activeStockTab) ? activeStockTab : null;
  const activeStatic = activeStock ? null : staticActive;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
      <div data-testid="agent-runtime-tabbar" style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D6CFC4', padding: '0 16px', background: '#F5F1EB', overflowX: 'auto', minWidth: 0 }}>
        {staticTabs.map(t => (
          <button
            key={t}
            onClick={() => { useAgentRuntimeStore.setState({ activeStockTab: null }); setStaticActive(t); }}
            style={{
              padding: '10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: activeStatic === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeStatic === t ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, flexShrink: 0,
            }}
          >
            {t}
          </button>
        ))}
        {stockTabs.map(s => (
          <button
            key={s.ts_code}
            onClick={() => useAgentRuntimeStore.setState({ activeStockTab: s.ts_code })}
            style={{
              padding: '10px 12px 10px 16px', background: 'transparent', cursor: 'pointer',
              border: 'none', borderBottom: activeStock === s.ts_code ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeStock === s.ts_code ? 'var(--accent-blue)' : 'var(--text-tertiary)', fontSize: 13, fontWeight: 500, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {s.name}
            <span
              data-testid={`stock-tab-close-${s.ts_code}`}
              onClick={(e) => { e.stopPropagation(); closeStockTab(s.ts_code); }}
              style={{ cursor: 'pointer', color: '#aaa', paddingLeft: 2 }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {activeStatic === '对话' && <ChatWorkspace />}
        {activeStatic === '文件' && <FilesPanel />}
        {activeStatic === 'Skill' && <SkillPanel cwd={workspaceCwd} />}
        {activeStatic === 'MCP' && <McpPanel />}
        {activeStatic === '记忆' && <MemoryPanel cwd={workspaceCwd} />}
        {activeStatic === '自选股' && <WatchlistPanel />}
        {activeStock && <StockDetailPanel ts_code={activeStock} />}
      </div>
    </div>
  );
};

export default TabsWorkspace;
```

- [ ] **Step 4: 运行测试,验证通过**

```bash
npx vitest run src/components/agentRuntime/TabsWorkspace.test.tsx --reporter verbose
```

Expected: 3 PASS(注:StockDetailPanel 在 Task 4 才实现,此 Task 提交时若 TS 报 import 错,可先创建一个空的 StockDetailPanel 占位,Task 4 再填实现)

- [ ] **Step 5: 创建占位 StockDetailPanel(Task 4 会填实现)**

创建 `src/components/agentRuntime/StockDetailPanel.tsx`:

```tsx
import React from 'react';
const StockDetailPanel: React.FC<{ ts_code: string }> = ({ ts_code }) => (
  <div style={{ padding: 16 }} data-testid="stock-detail-panel">{ts_code}</div>
);
export default StockDetailPanel;
```

- [ ] **Step 6: typecheck + Commit**

```bash
npm run typecheck
```

```bash
git add src/components/agentRuntime/TabsWorkspace.tsx src/components/agentRuntime/TabsWorkspace.test.tsx src/components/agentRuntime/StockDetailPanel.tsx
git commit -m "feat(watchlist): TabsWorkspace 动态股票 tab(带×关闭)"
```

---

### Task 4: StockDetailPanel — 6 子 tab 详情组件

**Files:**
- Modify: `src/components/agentRuntime/StockDetailPanel.tsx`(填实现)
- Modify: `src/services/dbApi.ts`(加 getStockDetail)
- Test: `src/components/agentRuntime/StockDetailPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/db/watchlist/stock-detail/{ts_code}`(Task 1)
- Produces: 完整详情渲染(loading/data/error + 6 子 tab)

- [ ] **Step 1: dbApi 加方法**

`src/services/dbApi.ts` 的 dbApi 对象加(在 unpinWatchlist 后):

```typescript
getStockDetail: (ts_code: string) =>
  req<StockDetail>(`/watchlist/stock-detail/${encodeURIComponent(ts_code)}`),
```

并在文件类型定义区加 `StockDetail` 接口:

```typescript
export interface StockDetail {
  basic: { name: string; industry: string; market: string; list_date: string };
  quotes: { close: number | null; pe_ttm: number | null; pb: number | null; total_mv: number | null; dv_ttm: number | null };
  score: {
    total: number; verdict: string;
    dim_scores: Record<string, number>;
    dim_labels: Record<string, string>;
    dim_reasons: Record<string, string>;
  };
  growth: { rev_cagr_2y: number | null; np_yoy: number | null };
  profit: { roe: number | null; gross_margin: number | null; net_margin: number | null; cash_ratio: number | null };
  value:  { pe_now: number | null; pe_pct: number | null; peg: number | null };
  trend:  { ret_1y: number | null; above_ma60: boolean };
  safety: { debt_ratio: number | null; current_ratio: number | null; max_dd: number | null };
}
```

- [ ] **Step 2: 写失败测试**

创建 `src/components/agentRuntime/StockDetailPanel.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StockDetailPanel from './StockDetailPanel';
import { dbApi } from '../../services/dbApi';

vi.mock('../../services/dbApi', () => ({
  dbApi: { getStockDetail: vi.fn() },
}));

const MOCK = {
  basic: { name: '贵州茅台', industry: '白酒', market: '主板', list_date: '20010827' },
  quotes: { close: 1212.1, pe_ttm: 18.4, pb: 5.59, total_mv: 1.5e12, dv_ttm: 2.5 },
  score: {
    total: 88.5, verdict: '通过初筛,值得深入研究',
    dim_scores: { '成长性': 95, '盈利质量': 95, '估值': 70, '趋势': 90, '安全': 85 },
    dim_labels: { '成长性': '🟢', '盈利质量': '🟢', '估值': '🟡', '趋势': '🟢', '安全': '🟢' },
    dim_reasons: { '成长性': '均值高增长', '盈利质量': 'ROE 30%', '估值': 'PE分位35%', '趋势': '站上MA60', '安全': '财务稳健' },
  },
  growth: { rev_cagr_2y: 18.5, np_yoy: 22.3 },
  profit: { roe: 30, gross_margin: 91, net_margin: 50, cash_ratio: 1.2 },
  value:  { pe_now: 18.4, pe_pct: 0.35, peg: 0.8 },
  trend:  { ret_1y: 0.15, above_ma60: true },
  safety: { debt_ratio: 25, current_ratio: 3.5, max_dd: -0.3 },
};

describe('StockDetailPanel', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders loading then basic info + total score', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText('贵州茅台')).toBeTruthy());
    expect(screen.getByText(/白酒/)).toBeTruthy();
    expect(screen.getByText(/88.5/)).toBeTruthy();
  });

  it('renders 5 dimension cards on 总览 tab', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText('盈利质量')).toBeTruthy());
    expect(screen.getByText('95')).toBeTruthy();
  });

  it('switches to 成长 tab and shows growth detail', async () => {
    (dbApi.getStockDetail as any).mockResolvedValue(MOCK);
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText('盈利质量')).toBeTruthy());
    fireEvent.click(screen.getByText('成长'));
    await waitFor(() => expect(screen.getByText(/18.5/)).toBeTruthy());
  });

  it('renders error when fetch fails', async () => {
    (dbApi.getStockDetail as any).mockRejectedValue(new Error('分析失败'));
    render(<StockDetailPanel ts_code="600519.SH" />);
    await waitFor(() => expect(screen.getByText(/分析失败/)).toBeTruthy());
  });
});
```

- [ ] **Step 3: 运行测试,验证失败**

```bash
npx vitest run src/components/agentRuntime/StockDetailPanel.test.tsx --reporter verbose
```

Expected: FAIL(占位组件没渲染这些)

- [ ] **Step 4: 实现 StockDetailPanel**

重写 `src/components/agentRuntime/StockDetailPanel.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { dbApi, type StockDetail } from '../../services/dbApi';

const SUB_TABS = ['总览', '成长', '盈利', '估值', '趋势', '安全'] as const;
const DIM_MAP: Record<string, keyof StockDetail> = {
  '成长': 'growth', '盈利': 'profit', '估值': 'value', '趋势': 'trend', '安全': 'safety',
};

function pct(v: number | null, digits = 1): string {
  return v == null ? 'N/A' : `${v.toFixed(digits)}%`;
}
function num(v: number | null, digits = 2): string {
  return v == null ? 'N/A' : v.toFixed(digits);
}
function fmtMV(v: number | null): string {
  if (v == null) return 'N/A';
  return (v / 1e8).toFixed(1) + ' 亿';
}

const StockDetailPanel: React.FC<{ ts_code: string }> = ({ ts_code }) => {
  const [data, setData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<typeof SUB_TABS[number]>('总览');

  const load = () => {
    setLoading(true); setError(null);
    dbApi.getStockDetail(ts_code)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [ts_code]);

  if (loading) return <div style={{ padding: 24, color: '#888' }} data-testid="stock-detail-panel">分析中(5-15 秒)…</div>;
  if (error) return (
    <div style={{ padding: 24 }} data-testid="stock-detail-panel">
      <div style={{ color: 'var(--accent-red, #d9534f)', marginBottom: 8 }}>{error}</div>
      <button onClick={load} style={{ padding: '6px 14px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
    </div>
  );
  if (!data) return null;

  const { basic, quotes, score } = data;
  const dims: { cn: string; key: string }[] = [
    { cn: '成长性', key: 'growth' }, { cn: '盈利质量', key: 'profit' }, { cn: '估值', key: 'value' },
    { cn: '趋势', key: 'trend' }, { cn: '安全', key: 'safety' },
  ];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="stock-detail-panel">
      {/* 公司画像 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{basic.name} <span style={{ color: '#888', fontSize: 13 }}>{ts_code}</span></div>
        <div style={{ fontSize: 12, color: '#6b6155', marginTop: 4 }}>
          {basic.industry} · 上市 {basic.list_date}
        </div>
        <div style={{ fontSize: 13, marginTop: 6, color: '#1A1A1A' }}>
          现价 {num(quotes.close)} · 市值 {fmtMV(quotes.total_mv)} · PE {num(quotes.pe_ttm)} · PB {num(quotes.pb)} · 股息率 {pct(quotes.dv_ttm)}
        </div>
      </div>

      {/* 总分卡 */}
      <div style={{ background: '#fff', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-blue, #2b6cb0)' }}>{score.total}</div>
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{score.verdict}</div>
          <div style={{ color: '#888' }}>总分 / 100</div>
        </div>
      </div>

      {/* 子 tab 栏 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D6CFC4' }}>
        {SUB_TABS.map(t => (
          <button key={t} onClick={() => setSub(t)} style={{
            padding: '8px 14px', background: 'transparent', cursor: 'pointer',
            border: 'none', borderBottom: sub === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: sub === t ? 'var(--accent-blue)' : '#888', fontSize: 13, fontWeight: 500,
          }}>{t}</button>
        ))}
      </div>

      {/* 子 tab 内容 */}
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
      ) : (
        <DimDetail cn={sub} data={data} score={score} />
      )}
    </div>
  );
};

const DimDetail: React.FC<{ cn: string; data: StockDetail; score: StockDetail['score'] }> = ({ cn, data, score }) => {
  const key = DIM_MAP[cn];
  const d = (data as any)[key] as Record<string, number | null | boolean>;
  const rows: { label: string; val: string }[] = [];
  if (cn === '成长') {
    rows.push({ label: '营收 2 年 CAGR', val: pct(d.rev_cagr_2y) });
    rows.push({ label: '净利同比', val: pct(d.np_yoy) });
  } else if (cn === '盈利') {
    rows.push({ label: 'ROE', val: pct(d.roe) });
    rows.push({ label: '毛利率', val: pct(d.gross_margin) });
    rows.push({ label: '净利率', val: pct(d.net_margin) });
    rows.push({ label: '现金含量', val: num(d.cash_ratio) });
  } else if (cn === '估值') {
    rows.push({ label: 'PE-TTM', val: num(d.pe_now) });
    rows.push({ label: 'PE 分位', val: d.pe_pct == null ? 'N/A' : `${(d.pe_pct * 100).toFixed(0)}%` });
    rows.push({ label: 'PEG', val: num(d.peg) });
  } else if (cn === '趋势') {
    rows.push({ label: '近 1 年涨幅', val: d.ret_1y == null ? 'N/A' : `${(d.ret_1y * 100).toFixed(0)}%` });
    rows.push({ label: 'MA60', val: d.above_ma60 ? '站上' : '跌破' });
  } else if (cn === '安全') {
    rows.push({ label: '负债率', val: pct(d.debt_ratio) });
    rows.push({ label: '流动比率', val: num(d.current_ratio) });
    rows.push({ label: '历史最大回撤', val: d.max_dd == null ? 'N/A' : `${(d.max_dd * 100).toFixed(0)}%` });
  }
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{score.dim_scores[cn]}</span>
        <span style={{ fontSize: 16 }}>{score.dim_labels[cn]}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{cn}</span>
      </div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F0E7DA', fontSize: 13 }}>
          <span style={{ color: '#6b6155' }}>{r.label}</span>
          <span style={{ fontWeight: 500 }}>{r.val}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>理由:{score.dim_reasons[cn]}</div>
    </div>
  );
};

export default StockDetailPanel;
```

- [ ] **Step 5: 运行测试,验证通过**

```bash
npx vitest run src/components/agentRuntime/StockDetailPanel.test.tsx --reporter verbose
```

Expected: 4 PASS

- [ ] **Step 6: typecheck + Commit**

```bash
npm run typecheck && git add src/components/agentRuntime/StockDetailPanel.tsx src/components/agentRuntime/StockDetailPanel.test.tsx src/services/dbApi.ts && git commit -m "feat(watchlist): StockDetailPanel 6 子 tab 详情组件"
```

---

### Task 5: WatchlistPanel — 行点击触发 openStockTab

**Files:**
- Modify: `src/components/agentRuntime/WatchlistPanel.tsx`(行 onClick)
- Test: `src/components/agentRuntime/WatchlistPanel.test.tsx`(补一个点击测试)

- [ ] **Step 1: 写失败测试**

在 `WatchlistPanel.test.tsx` 的 `describe('WatchlistPanel manual add/delete'` 后追加 describe:

```typescript
describe('WatchlistPanel row click opens stock tab', () => {
  it('clicking a row calls openStockTab', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '茅台', close: 1200, pct_chg: 1, total_mv: 1.5e9 },
    ]);
    const openStockTab = vi.fn();
    const { useAgentRuntimeStore } = await import('../../stores/agentRuntimeStore');
    useAgentRuntimeStore.setState({ openStockTab });
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('茅台')).toBeTruthy());
    fireEvent.click(screen.getByText('茅台'));
    await waitFor(() => expect(openStockTab).toHaveBeenCalledWith('600519.SH', '茅台'));
  });
});
```

- [ ] **Step 2: 运行测试,验证失败**

```bash
npx vitest run src/components/agentRuntime/WatchlistPanel.test.tsx -t "row click" --reporter verbose
```

Expected: FAIL(行不可点)

- [ ] **Step 3: 实现 — 行 onClick**

`src/components/agentRuntime/WatchlistPanel.tsx` 组件顶部加:

```typescript
const openStockTab = useAgentRuntimeStore(s => s.openStockTab);
```

(import 加 `useAgentRuntimeStore`)

`<tr>` 标签加 onClick + style:

```tsx
<tr
  key={it.ts_code}
  onClick={() => openStockTab(it.ts_code, it.name)}
  title={`${note}${addTime}`}
  style={{ borderBottom: '1px solid #E5DCC9', cursor: 'pointer' }}
>
```

- [ ] **Step 4: 运行全部 watchlist 前端测试**

```bash
npx vitest run src/components/agentRuntime/WatchlistPanel.test.tsx src/components/agentRuntime/StockDetailPanel.test.tsx src/components/agentRuntime/TabsWorkspace.test.tsx src/stores/agentRuntimeStore.test.ts --reporter verbose
```

Expected: 全 PASS

- [ ] **Step 5: typecheck + Commit**

```bash
npm run typecheck && git add src/components/agentRuntime/WatchlistPanel.tsx src/components/agentRuntime/WatchlistPanel.test.tsx && git commit -m "feat(watchlist): 行点击触发 openStockTab 打开详情"
```

---

### Task 6: ECS 部署 + 端到端验证

**Files:**
- Create: `ecs_deploy_rq090.py`(参考 ecs_deploy_rq089.py)

- [ ] **Step 1: 构建前端**

```bash
npm run build
```

- [ ] **Step 2: 打包**

```bash
tar -czf backend-patch-rq090.tar.gz backend/scripts backend/routers/watchlist.py backend/tests/test_stock_detail.py
tar -czf dist-patch-rq090.tar.gz -C dist .
```

- [ ] **Step 3: 部署脚本(参考 ecs_deploy_rq089.py 改 tar 名)**

创建 `ecs_deploy_rq090.py`(复制 ecs_deploy_rq089.py,把文件名rq089→rq090,health 检查后加 stock-detail 端点验证)。

- [ ] **Step 4: 部署**

```bash
ECS_PWD="zPkooCua81lnfqD6" python ecs_deploy_rq090.py
```

- [ ] **Step 5: 端到端验证**

```bash
curl http://47.97.66.45/api/db/watchlist/stock-detail/600519.SH | head -c 500
```

Expected: 返回含 basic/quotes/score/growth 等字段的 JSON(首次 5-15s,二次秒回)

- [ ] **Step 6: Commit 部署脚本**

```bash
git add ecs_deploy_rq090.py && git commit -m "chore(watchlist): RQ-090 ECS 部署脚本"
```

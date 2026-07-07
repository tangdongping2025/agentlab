# 自选股手工添加与删除 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WatchlistPanel 增加输入股票代码添加 + 每行删除按钮

**Architecture:** 后端调 tushare stock_basic 自动补齐名称/后缀；前端只改 WatchlistPanel.tsx（复用现有 store 方法）

**Tech Stack:** Python FastAPI + Tushare API / React 18 + TypeScript + Vitest

## Global Constraints

- 后端测试用 SQLite in-memory（复用现有 fixture），tushare 调用需 mock
- `WatchlistIn.name` 改为 `Optional[str]`（向后兼容，带 name 的请求仍正常工作）
- 代码后缀推断规则：`6`→`.SH`、`0/3`→`.SZ`、`4/8`→`.BJ`；已有后缀的不处理
- 前端 `WatchlistPanel.tsx` 保持现有样式风格（内联 style），不加新依赖

---

### Task 1: 后端 — name 可选 + 自动补齐

**Files:**
- Modify: `backend/schemas.py:148`
- Modify: `backend/routers/watchlist.py:34-45`
- Test: `backend/tests/test_watchlist_router.py`

**Interfaces:**
- Consumes: `WatchlistIn(ts_code: str, name: Optional[str] = None, note: Optional[str] = None)`
- Produces: 自动推断后缀 + 补齐 name 的 WatchlistOut
- New helper: `_resolve_watchlist_params(ts_code: str, name: str | None) -> tuple[str, str]`

- [ ] **Step 1: 配置 TUSHARE_TOKEN**

```bash
echo 'TUSHARE_TOKEN=ea217535865d5881ce62dfe31a45dcf7372c967e29a019ca442e4176' >> backend/.env
```

- [ ] **Step 2: 改 WatchlistIn.name 为可选**

`backend/schemas.py:148`：
```python
class WatchlistIn(BaseModel):
    ts_code: str
    name: Optional[str] = None  # 改为可选
    note: Optional[str] = None
```

- [ ] **Step 3: 写后端失败测试**

在 `backend/tests/test_watchlist_router.py` 末尾追加：

```python
def test_watchlist_add_without_name_auto_fill(client, monkeypatch):
    """不传 name,由后端自动补齐"""
    from routers import watchlist as wl
    called = []
    def mock_post(api_name, params):
        called.append((api_name, params))
        if api_name == "stock_basic":
            assert params.get("ts_code") == "600519.SH"
            return [{"ts_code": "600519.SH", "name": "贵州茅台", "area": "贵州", "industry": "白酒", "list_date": "20010731"}]
        return []
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "600519"})
    assert r.status_code == 201
    body = r.json()
    assert body["ts_code"] == "600519.SH"
    assert body["name"] == "贵州茅台"
    assert called  # 确实调了 tushare


def test_watchlist_add_with_suffix_and_without_name(client, monkeypatch):
    """有后缀但不传 name"""
    from routers import watchlist as wl
    def mock_post(api_name, params):
        return [{"ts_code": "000001.SZ", "name": "平安银行", "area": "深圳", "industry": "银行", "list_date": "19910403"}]
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "000001.SZ"})
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "平安银行"


def test_watchlist_add_not_found(client, monkeypatch):
    """tushare 查不到该代码 → 404"""
    from routers import watchlist as wl
    def mock_post(api_name, params):
        return []  # 空结果
    monkeypatch.setattr(wl, "_tushare_post", mock_post)

    r = client.post("/api/db/watchlist", json={"ts_code": "999999"})
    assert r.status_code == 404
    assert "不存在" in r.json()["detail"]
```

- [ ] **Step 4: 运行测试，验证新测试失败**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_watchlist_router.py::test_watchlist_add_without_name_auto_fill tests/test_watchlist_router.py::test_watchlist_add_with_suffix_and_without_name tests/test_watchlist_router.py::test_watchlist_add_not_found -v
```

Expected: 3 FAIL（函数未实现逻辑）

- [ ] **Step 5: 实现 POST 端点自动补齐逻辑**

`backend/routers/watchlist.py`，在 `add_stock` 函数开头插入后缀推断 + name 补齐：

```python
@router.post("/watchlist", response_model=WatchlistOut, status_code=201)
def add_stock(payload: WatchlistIn, db: Session = Depends(get_db)):
    ts_code = payload.ts_code.strip()
    # 自动推断交易所后缀
    if "." not in ts_code:
        if ts_code.startswith("6"):
            ts_code += ".SH"
        elif ts_code.startswith(("0", "3")):
            ts_code += ".SZ"
        elif ts_code.startswith(("4", "8")):
            ts_code += ".BJ"
    # 不传 name 时从 tushare 补齐
    name = payload.name
    if not name:
        records = _tushare_post("stock_basic", {"ts_code": ts_code})
        if not records:
            raise HTTPException(status_code=404, detail=f"股票代码 {ts_code} 不存在")
        name = records[0].get("name", "")
    # 检查是否已存在
    existing = db.query(models.WatchlistModel).filter(
        models.WatchlistModel.ts_code == ts_code
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="ts_code 已存在")
    row = models.WatchlistModel(ts_code=ts_code, name=name, note=payload.note)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)
```

- [ ] **Step 6: 运行测试，验证全部通过**

```bash
cd backend && .venv/Scripts/python.exe -m pytest tests/test_watchlist_router.py -v
```

Expected: 新增的 3 个 + 原有 6 个，全部 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/schemas.py backend/routers/watchlist.py backend/tests/test_watchlist_router.py backend/.env
git commit -m "feat(watchlist): name 可选 + POST 自动补齐(tushare stock_basic)"
```

---

### Task 2: 前端 — WatchlistPanel 添加/删除 UI

**Files:**
- Modify: `src/components/agentRuntime/WatchlistPanel.tsx`
- Modify: `src/components/agentRuntime/WatchlistPanel.test.tsx`

**Interfaces:**
- Consumes: `dbApi.pinWatchlist(ts_code, name?, note?)`, `dbApi.unpinWatchlist(ts_code)`（已有）
- Produces: 用户在面板添加/删除的自选股操作

- [ ] **Step 1: 写前端失败测试**

在 `src/components/agentRuntime/WatchlistPanel.test.tsx` 末尾追加，删除同样要验证删除的测试，以及添加相关的测试

```typescript
import { dbApi } from '../../services/dbApi';
import userEvent from '@testing-library/user-event';

// ... 添加新的测试

describe('WatchlistPanel manual add/delete', () => {
  it('renders input field for adding stock code', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    expect(screen.getByTestId('watchlist-add-btn')).toBeTruthy();
  });

  it('add button is disabled when input is empty', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-add-btn')).toBeDisabled());
  });

  it('calls pinWatchlist when adding a code', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    (dbApi.pinWatchlist as any).mockResolvedValue({ ts_code: '000001.SZ', name: '平安' });
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    await userEvent.type(screen.getByTestId('watchlist-code-input'), '000001');
    fireEvent.click(screen.getByTestId('watchlist-add-btn'));
    await waitFor(() => expect(dbApi.pinWatchlist).toHaveBeenCalledWith('000001', undefined, undefined));
    // 添加后应刷新列表
    expect(dbApi.listWatchlistQuotes).toHaveBeenCalledTimes(2);
  });

  it('calls unpinWatchlist when clicking delete on a row', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([
      { id: 1, ts_code: '600519.SH', name: '茅台', close: 1200, pct_chg: 1, pe: 18, pb: 5, total_mv: 1.5e9 },
    ]);
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByText('茅台')).toBeTruthy());
    fireEvent.click(screen.getByTestId('watchlist-delete-600519.SH'));
    await waitFor(() => expect(dbApi.unpinWatchlist).toHaveBeenCalledWith('600519.SH'));
  });

  it('shows error message when pinWatchlist fails', async () => {
    (dbApi.listWatchlistQuotes as any).mockResolvedValue([]);
    (dbApi.pinWatchlist as any).mockRejectedValue(new Error('股票代码不存在'));
    render(<WatchlistPanel />);
    await waitFor(() => expect(screen.getByTestId('watchlist-code-input')).toBeTruthy());
    await userEvent.type(screen.getByTestId('watchlist-code-input'), '999999');
    fireEvent.click(screen.getByTestId('watchlist-add-btn'));
    await waitFor(() => expect(screen.getByText(/股票代码不存在/)).toBeTruthy());
  });
});
```

- [ ] **Step 2: 运行测试，验证新增测试失败**

```bash
cd D:/我的个人区间/Projects/context-lab && npx vitest run src/components/agentRuntime/WatchlistPanel.test.tsx --reporter verbose 2>&1 | head -60
```

Expected: 原有测试 PASS，新增 5 个 FAIL（组件未实现新 UI）

- [ ] **Step 3: 实现 WatchlistPanel 添加/删除 UI**

重写 `src/components/agentRuntime/WatchlistPanel.tsx`：

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import { dbApi, type WatchlistQuoteItem } from '../../services/dbApi';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b6155', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', color: '#1A1A1A', whiteSpace: 'nowrap' };

function fmtMV(v?: number | null): string {
  if (v == null) return '—';
  return (v / 10000).toFixed(1) + ' 亿';
}
function fmtNum(v?: number | null, digits = 2): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}
function pctColor(v?: number | null): string {
  if (v == null || v === 0) return '#888';
  if (v > 0) return '#d9534f';
  return '#5cb85c';
}

const WatchlistPanel: React.FC = () => {
  const [items, setItems] = useState<WatchlistQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setItems(await dbApi.listWatchlistQuotes(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      await dbApi.pinWatchlist(trimmed);
      setCode('');
      await load(true);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (ts_code: string) => {
    try {
      await dbApi.unpinWatchlist(ts_code);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="watchlist-panel">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          data-testid="watchlist-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入股票代码，如 600519"
          disabled={adding}
          style={{
            flex: 1, padding: '6px 10px', border: '1px solid #D6CFC4', borderRadius: 6,
            fontSize: 13, outline: 'none', background: '#fff',
          }}
        />
        <button
          data-testid="watchlist-add-btn"
          onClick={handleAdd}
          disabled={!code.trim() || adding}
          style={{
            padding: '6px 14px', border: 'none', borderRadius: 6, fontSize: 13,
            cursor: (!code.trim() || adding) ? 'not-allowed' : 'pointer',
            background: (!code.trim() || adding) ? '#E5DCC9' : '#2b6cb0',
            color: '#fff', whiteSpace: 'nowrap',
          }}
        >
          {adding ? '添加中…' : '📈 添加'}
        </button>
        <button
          onClick={() => load(true)}
          data-testid="watchlist-refresh-btn"
          style={{ padding: '4px 12px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
        >
          🔄
        </button>
      </div>
      {addError && (
        <div style={{ color: 'var(--accent-red, #d9534f)', fontSize: 12 }}>{addError}</div>
      )}
      {loading ? (
        <div style={{ padding: 16, color: '#888' }}>加载中…</div>
      ) : error ? (
        <div style={{ padding: 16 }}>
          <div style={{ color: 'var(--accent-red, #d9534f)', marginBottom: 8 }}>{error}</div>
          <button onClick={() => load()} style={{ padding: '6px 14px', border: '1px solid #D6CFC4', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>重试</button>
        </div>
      ) : items.length === 0 ? (
        <div style={{ color: '#888', fontSize: 13 }}>还没有自选股。输入股票代码添加，或在对话中让 AI 推荐。</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#F0E7DA' }}>
              <th style={th}>代码</th>
              <th style={th}>名称</th>
              <th style={{ ...th, textAlign: 'right' }}>现价</th>
              <th style={{ ...th, textAlign: 'right' }}>涨跌幅%</th>
              <th style={{ ...th, textAlign: 'right' }}>PE</th>
              <th style={{ ...th, textAlign: 'right' }}>PB</th>
              <th style={{ ...th, textAlign: 'right' }}>总市值</th>
              <th style={{ ...th, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => {
              const note = it.note ? `备注:${it.note}\n` : '';
              const addTime = it.add_time ? `加入:${it.add_time}` : '';
              return (
                <tr key={it.ts_code} title={`${note}${addTime}`} style={{ borderBottom: '1px solid #E5DCC9' }}>
                  <td style={td}>{it.ts_code}</td>
                  <td style={td}>{it.name}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.close)}</td>
                  <td style={{ ...td, textAlign: 'right', color: pctColor(it.pct_chg) }}>
                    {it.pct_chg == null ? '—' : (it.pct_chg > 0 ? '+' : '') + fmtNum(it.pct_chg)}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.pe)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtNum(it.pb)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{fmtMV(it.total_mv)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      data-testid={`watchlist-delete-${it.ts_code}`}
                      onClick={() => handleDelete(it.ts_code)}
                      title="删除"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#aaa', fontSize: 16, padding: 0 }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default WatchlistPanel;
```

- [ ] **Step 4: 运行前端测试，验证全部通过**

```bash
cd D:/我的个人区间/Projects/context-lab && npx vitest run src/components/agentRuntime/WatchlistPanel.test.tsx --reporter verbose 2>&1 | head -80
```

Expected: 原有测试 + 新增 5 个测试全部 PASS

- [ ] **Step 5: 修复原有测试中的渲染问题（若有）**

如果 Step 4 中原有某个测试因新 UI 布局变化而渲染失败（例如原先的 `container.firstChild` 测试），按实际 DOM 结构调整测试断言。预期只有渲染方式的轻微变化，不需要改动原有测试逻辑。

- [ ] **Step 6: Commit**

```bash
git add src/components/agentRuntime/WatchlistPanel.tsx src/components/agentRuntime/WatchlistPanel.test.tsx
git commit -m "feat(watchlist): WatchlistPanel 添加/删除 UI"
```

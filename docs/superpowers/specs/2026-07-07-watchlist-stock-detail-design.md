# RQ-090 自选股股票详情页(动态 tab + 6 维度评分)

> 2026-07-07 | 设计文档 | 关联 RQ-087 行情摘要 / RQ-089 手工添加删除

## 概述

在自选股面板点击某只股票 → 在当前 agent 的 tab 栏**新增一个以股票名命名的 tab** → 该 tab 内展示这只股票的多维度分析详情(公司画像 + 总分 + 5 维度评分)。数据由后端调 `analyze.py` + `report.py`(从 python-learning 搬来)产出,返回结构化 JSON。

## 数据流

```
用户在 WatchlistPanel 点某行(如贵州茅台)
 → store.openStockTab(ts_code, name)
   → 查重:已开则只切 active,不开新 tab
   → 未开则 push 到 stockTabs[],active = ts_code
 → TabsWorkspace 渲染新增 "贵州茅台 ×" tab
 → StockDetailPanel 挂载,GET /api/db/watchlist/stock-detail/{ts_code}
   → 后端 analyze_stock() + score()(命中缓存直接返回)
   → 返回结构化 JSON
 → 前端按 JSON 渲染 6 子 tab(总览 + 成长/盈利/估值/趋势/安全)
```

## 默认 UX 决策(spec 内定,review 可改)

1. **点自选股行** → 新增 `名称 ×` tab,自动切过去
2. **重复点已开的股票** → 直接切过去,**不开新 tab**(防重,用户明确要求)
3. **点 ×** → 关闭该 tab,active 切回「自选股」
4. **切换 agent 再切回** → 已开的股票 tab **保留**(状态在 store,不随 agent 切换丢)
5. **股票 tab 只在 invest agent 下出现**(自选股是 invest 专属)

## 后端变更

### 1. 搬脚本(3 个文件)

从 `python-learning/scripts/` 复制到 `backend/scripts/`:
- `data_loader.py`(`build_daily_panel`,纯函数,不写文件)
- `analyze.py`(`analyze_stock`)
- `report.py`(`score`,**不用 `generate_report`**——它出 markdown,前端要 JSON)

### 2. 新端点

`backend/routers/watchlist.py` 加:

```
GET /api/db/watchlist/stock-detail/{ts_code}
```

逻辑:
1. 设 `os.environ['TUSHARE_TOKEN'] = settings.tushare_token`(脚本从 env 读)
2. `from scripts.analyze import analyze_stock` + `from scripts.report import score`
3. 命中缓存(按 ts_code,TTL 10 分钟)→ 直接返回
4. 否则 `analysis = analyze_stock(ts_code)` + `scored = score(analysis)`
5. 组装 JSON 返回(不走 `generate_report`)

### 3. 返回 JSON 结构

```json
{
  "basic": {"name", "industry", "market", "list_date"},
  "quotes": {"close", "pe_ttm", "pb", "total_mv", "dv_ttm"},
  "score": {
    "total": 72.0,
    "verdict": "通过初筛,值得深入研究",
    "dim_scores":  {"成长性": 85, "盈利质量": 75, "估值": 55, "趋势": 70, "安全": 85},
    "dim_labels":  {"成长性": "🟢", ...},
    "dim_reasons": {"成长性": "均值20.4% 高增长", ...}
  },
  "growth": {"rev_cagr_2y", "np_yoy"},
  "profit": {"roe", "gross_margin", "net_margin", "cash_ratio"},
  "value":  {"pe_now", "pe_pct", "peg"},
  "trend":  {"ret_1y", "above_ma60"},
  "safety": {"debt_ratio", "current_ratio", "max_dd"}
}
```

(`quotes` 取自 `analysis.panel.iloc[-1]`,含 close/pe_ttm/pb/total_mv/dv_ttm)

### 4. 性能:缓存

- 模块级 dict:`_DETAIL_CACHE = {ts_code: {"data": ..., "ts": time.time()}`
- TTL 10 分钟(tushare 数据日频更新,10 分钟够用)
- 失败不缓存(避免错误结果卡住)

## 前端变更

### 1. store(agentRuntimeStore.ts)

新增状态和方法:
```typescript
stockTabs: { ts_code: string; name: string }[];      // 已开的股票 tab
openStockTab: (ts_code: string, name: string) => void;  // 查重→切或增
closeStockTab: (ts_code: string) => void;            // 移除+切回自选股
```
- `openStockTab`:已存在 → 不 push;否则 push。同时设 active(见下)
- active 的管理见 TabsWorkspace 改造

### 2. TabsWorkspace.tsx 改造(动态 tab)

当前:`tabs`(静态字符串)+ `active`(local state)。

改为:
```typescript
const staticTabs = agent?.workspace?.tabs || ['对话'];   // 对话/文件/Skill/自选股
const stockTabs = useAgentRuntimeStore(s => s.stockTabs); // 动态
const allTabs = [
  ...staticTabs.map(t => ({key: t, label: t, closable: false})),
  ...stockTabs.map(s => ({key: s.ts_code, label: s.name, closable: true, ts_code: s.ts_code})),
];
const [active, setActive] = useState(staticTabs[0]);      // active 可能是 static 名 或 ts_code
```

tab 栏渲染:股票 tab 后带 `×`(调 closeStockTab)。内容区:
```tsx
{active === '自选股' && <WatchlistPanel />}
{stockTabs.find(s => s.ts_code === active) && <StockDetailPanel ts_code={active} />}
// 其他 static tab 不变
```

### 3. 新组件 StockDetailPanel.tsx

Props: `{ ts_code: string }`
- 挂载时 `GET /api/db/watchlist/stock-detail/{ts_code}`,loading 态(骨架/转圈,因 5-15s)
- 内部 6 子 tab:`总览 | 成长 | 盈利 | 估值 | 趋势 | 安全`
- 顶部固定:公司画像 + 总分卡(大字分数 + verdict + 5 维度小卡)
- 子 tab:该维度大字分数 + 明细数字 + 评分理由
- 复用 WatchlistPanel 的红绿/格式化风格

### 4. WatchlistPanel.tsx 改造

表格行加 `onClick` → `openStockPanel(it.ts_code, it.name)`(光标变 pointer,hover 高亮)。

### 5. dbApi.ts

加 `getStockDetail(ts_code)` → `GET /watchlist/stock-detail/{ts_code}`。

## 测试

### 后端
- `test_stock_detail.py`:`analyze_stock`/`score` mock,验证端点返回 JSON 结构正确
- 缓存命中测试(第二次调不触发 analyze)

### 前端
- `TabsWorkspace`:点股票 → 出现新 tab + 切过去;重复点 → 不增只切;× → 关闭切回
- `StockDetailPanel`:loading → 数据渲染;6 子 tab 切换;错误态

## 不包含

- 对比视图(多股票并排对比)
- 历史走势图(后续可加 panel 数据画 K 线)
- 评分规则可配置(WEIGHTS 仍硬编码)
- `generate_report` 的 markdown 输出(后端不走,但 report.py 命令行仍保留)

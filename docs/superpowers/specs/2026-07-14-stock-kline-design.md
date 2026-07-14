# 个股详情 K 线图(收盘价折线 + MA,日/周/月)设计

- **日期**:2026-07-14
- **范围**:`StockDetailPanel` 新增「📈 K线」tab;后端新增只读 K 线端点
- **状态**:设计已与用户确认,待 review

## 1. 背景与目标

个股详情页(`StockDetailPanel.tsx`)目前有 7 个 tab(总览/成长/盈利/估值/趋势/安全/🩺 巴菲特),没有任何价格图表。用户希望加一张 K 线图,支持日/周/月切换。

**图表形态已定为「收盘价折线 + MA5/10/20 均线」**(非蜡烛图)。理由:折线只需 `close`,而 `stock_daily` 表已存 close,不必扩库、不必每次拉 tushare。

### 目标
- 详情页新增「📈 K线」tab,展示该股收盘价折线 + MA5/10/20 三条均线
- 顶部「日/周/月」切换,默认日线
- 本地 `stock_daily` 命中优先;完全 miss 时后端实时拉 tushare 兜底

### 非目标(YAGNI)
- 不做蜡烛图(OHLC)、成交量副图(已与用户确认折线)
- 不做技术指标面板(MACD/KDJ 等),只 MA5/10/20
- 不做本地数据的 tushare 增量补拉(本地有多少用多少)
- 不做用户自定义 MA 周期/范围滑块

## 2. 架构

```
前端 StockDetailPanel
  └─ 新增 tab「📈 K线」→ <KlineChart ts_code />
       ├─ 日/周/月 切换(默认日线)
       ├─ recharts LineChart:close 线 + MA5/MA10/MA20 三线
       └─ dbApi.getKline(ts_code, freq, limit)
                              │
后端 watchlist.py
  └─ GET /api/db/watchlist/stock-detail/{ts_code}/kline?freq=&limit=
       ├─ 查本地 stock_daily (code=ts_code) 的 (trade_date, close, adj_factor)
       ├─ 本地有数据 → 本地管线
       ├─ 本地完全 miss → tushare daily + adj_factor 兜底,同管线
       └─ 管线:前复权 → 按 freq 聚合 → 取最近 limit → 算 MA5/10/20 → 缓存 → 返回
```

**放置位置**:第 8 个 tab「📈 K线」,插在 SUB_TABS 末尾(巴菲特之后)。日/周/月切换按钮在图区右上角。

## 3. API 契约

### 请求
```
GET /api/db/watchlist/stock-detail/{ts_code}/kline?freq=daily&limit=120
```
- `freq`:`daily`(默认)/ `weekly` / `monthly`
- `limit`:可选,默认 120(月线数据不足时自动取实际可用数)

### 响应(200)
```json
{
  "ts_code": "600519.SH",
  "freq": "daily",
  "source": "local",          // local | tushare,标数据来源便于排查
  "points": [
    {"date": "20260104", "close": 1234.5, "ma5": 1230.1, "ma10": null, "ma20": null},
    {"date": "20260105", "close": 1240.2, "ma5": 1233.4, "ma10": null, "ma20": null}
  ]
}
```
响应不含 limit 字段;实际 points 数 = min(请求 limit, 可用数据),前端用 `points.length`。
- `points` 升序(旧→新)
- `date`:YYYYMMDD。日线=交易日;周线=该自然周最后交易日;月线=该自然月最后交易日
- `ma5/ma10/ma20`:开头不足 N 根处为 `null`,前端 MA 线在该处断开
- 本地 miss 且 tushare 兜底也失败 → HTTP 500 `{"detail":"K线数据获取失败:..."}`

## 4. 数据流(后端管线)

统一管线,本地和 tushare 兜底都走同一条:

1. **取日线序列** `(trade_date, close, adj_factor)` 升序
   - 本地:`SELECT trade_date, close, adj_factor FROM stock_daily WHERE code=:ts_code ORDER BY trade_date`
   - 兜底:`_tushare_post("daily", {ts_code})` + `_tushare_post("adj_factor", {ts_code})`,按 trade_date 合并
2. **前复权**:`close_qfq = close * adj_factor / adj_max`(adj_max = 序列最新日的 adj_factor),消除除权除息的假下跌。**复权在聚合前做**
3. **按 freq 聚合**(pandas,在前复权后的日线上):
   - daily:原样
   - weekly:`resample('W', on='trade_date').last()`(每自然周最后交易日 close)
   - monthly:`resample('M', on='trade_date').last()`(每自然月最后交易日 close)
4. **取最近 `limit` 根**(月线数据从 2020 起,最多 ~65 根,自动取 min(limit, 可用数))
5. **算 MA**:`ma5 = rolling(5).mean()`,`ma10/ma20` 同理(在聚合后序列上,开头不足处为 NaN→null)
6. **缓存**:key=`(ts_code, freq, limit)`,TTL 600s(与 `_DETAIL_TTL` 一致)
7. 返回 `{ts_code, freq, source, points}`,经现有 `_clean()` 转 JSON 安全类型(points 实际数 = min(limit, 可用))

### 命中判定
- 本地查询返回**任意一行** → `source="local"`,用本地数据(不补拉,不足 limit 就少给)
- 本地零行 → 走 tushare 兜底,`source="tushare"`

## 5. 前端组件

`<KlineChart ts_code />`(新文件,`src/components/agentRuntime/KlineChart.tsx`):
- state:`freq`(默认 `'daily'`)、`points`、`loading`、`error`
- 切换 freq → 调 `dbApi.getKline(ts_code, freq, 120)`
- recharts `<LineChart>`:X 轴 date(按 freq 格式化:日线 `MM-DD`,周/月按密度稀疏显示)、Y 轴 close;4 条 `<Line>`(close 实色 + MA5/10/20 区分色)
- `points` 为空 → 提示「暂无K线数据(该股未在已抓取范围,且 tushare 兜底失败)」
- error → 红字 + 重试按钮(复用现有 error 样式)
- 配色与可访问性遵循 **dataviz skill**(实现期读)

`StockDetailPanel` 改动:
- `SUB_TABS` 末尾加 `'📈 K线'`
- 渲染分支:`sub === '📈 K线'` → `<KlineChart ts_code={ts_code} />`

`dbApi.ts` 加方法:
```ts
getKline: (ts_code: string, freq: 'daily'|'weekly'|'monthly', limit = 120) =>
  req<KlineResult>(`/watchlist/stock-detail/${encodeURIComponent(ts_code)}/kline?freq=${freq}&limit=${limit}`),
```
+ `KlineResult` / `KlinePoint` 类型。

## 6. 边界与已知限制

| 场景 | 处理 |
|---|---|
| 非沪深300成分股(本地无数据) | tushare 兜底;兜底也失败 → 空 points + 前端提示 |
| 月线数据不足(2020 起最多 ~65 月) | 自动取实际可用数,不报错 |
| 上市不满 20 个交易日 | MA 对应位 null,close 照常画 |
| tushare token 未配置 | 兜底抛错 → 本地 miss 时 500,前端提示 |
| 本地有部分数据(如 60 天) | 用本地,不足 limit 不补拉 |

**已知限制**:本地 `stock_daily` 仅覆盖已抓取成分股(默认沪深300)+ 2020-01 至今。非覆盖股票依赖 tushare 兜底,首次访问多一次外部调用(已缓存)。

## 7. 测试计划

### 后端(pytest,连 my-mysql,自包含)
1. `test_kline_weekly_aggregation`:构造已知日线 → 周/月聚合取的是各周/月最后交易日 close
2. `test_kline_ma`:MA5/10/20 计算正确,开头不足处为 null
3. `test_kline_qfq`:前复权按最新 adj_factor 基准正确
4. `test_kline_local_hit`:本地有数据 → source=local,不打 tushare(mock `_tushare_post` 断言未调用)
5. `test_kline_tushare_fallback`:本地 miss → 调 tushare → source=tushare(mock `_tushare_post` 返回固定数据)
6. `test_kline_empty`:本地 miss + tushare 也空 → points=[]

### 前端(vitest,jsdom,mock recharts 响应容器)
1. `KlineChart` 能根据 points 渲染出线条(mock recharts,断言渲染调用)
2. 切换日/周/月触发对应 freq 的请求
3. 空 points 显示提示态,不崩

## 8. 实现期遵循

- 图表配色/对比度/色盲安全/浅深色一致遵循 **dataviz skill**(写第一行图表代码前读)
- 后端聚合用 pandas(项目已用),前端只渲染不算数
- 复用现有 `_tushare_post` / `_clean` / 路由前缀 `/api/db`

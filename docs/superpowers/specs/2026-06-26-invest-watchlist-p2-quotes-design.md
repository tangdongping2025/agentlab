# 自选股 P2-① 行情摘要 规格

> 2026-06-26 | invest agent P2 | brainstorm 已与用户对齐(用户选 ① 行情摘要)

## 背景
P1 watchlist 是只读列表(代码/名称/备注/加入时间)。自选股不看走势没意义 → P2-① 加行情摘要:每只现价/涨跌幅/PE/PB/总市值,tab 一眼瞰全局。

## 核心端点 GET /api/db/watchlist/quotes
- 查 watchlist ts_code 列表 → 调 tushare `daily_basic`(最新交易日,全市场)→ filter 自选股 → 合并返回 `{ts_code, name, note, add_time, close, pct_chg, pe, pb, total_mv}`
- **缓存**:行情 60s 内存缓存;最新交易日 1 天缓存(避免每次调 trade_cal)
- **降级**:行情失败(网络/token/空结果)→ 返基础信息(行情字段 null),不阻塞列表;空自选股 → 返 `[]`(不调 tushare)

## tushare 调用(实测确认 2026-06-26)
- **daily_basic 多 ts_code 逗号不支持**:实测 `ts_code="600519.SH,000001.SZ"` 返空,单 ts_code 返数据
- **方案**:
  1. `trade_cal`(exchange=SSE, is_open=1, cal_date<=today, order desc limit 1)→ 最新交易日(缓存 1 天)
  2. `daily_basic`(trade_date=最新交易日)→ 全市场 ~5000 行 → 后端 filter 自选股 ts_code
- 一次 trade_cal(1天缓存)+ 一次 daily_basic(60s缓存)= 每分钟最多 1 次 tushare 行情调用

## 前端
- `WatchlistPanel`:加载改 GET /api/db/watchlist/quotes;表格列 = 代码 / 名称 / 现价 / 涨跌幅% / PE / PB / 总市值(亿);备注/加入时间移到行 `title`(hover 显示)
- 右上角「🔄 刷新」按钮(绕缓存,带 `?refresh=1` 强制后端重新调 tushare)
- 涨跌幅红涨绿跌(颜色);无行情「—」;总市值格式化「XXXX.X 亿」(total_mv 单位千元 → /10000 亿)

## 范围
- **P2-①(本次)**:quotes 端点 + 行情列 + 刷新按钮 + 缓存 + 降级
- **P2-②③(不做)**:tab 内直接删除/编辑备注、分组/标签

## 测试
- backend:quotes 端点(mock httpx,验证 trade_cal→daily_basic→filter→合并 + 缓存命中 + 行情失败降级 + 空自选股)
- 前端:表格行情列渲染 + 涨跌幅颜色 + 刷新按钮调 API

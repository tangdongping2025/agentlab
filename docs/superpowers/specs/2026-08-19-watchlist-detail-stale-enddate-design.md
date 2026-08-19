# 自选股详情数据停在上月:end_date 硬编码修复

> 2026-08-19。现象:自选股点进个股详情,行情日期停在 2026-07-07,而数据表(stock_daily 到 20260818)与 K 线均最新。

## 根因

`backend/scripts/analyze.py` 的 `analyze_stock(ts_code, start_date='20210101', end_date='20260707')` —— **end_date 默认值硬编码为写代码当天的日期**。`watchlist.py` 详情端点(:216)与 ai-deepdive(:529)均用默认值调用,分析截面被永久截断在 20260707。线上验证:传 `end_date=20260819` 重调 → `as_of_date=2026-08-18`(最新交易日),证明修复有效。

## 方案(A)

默认值改 `end_date=None`,函数内动态取当天:`end_date = end_date or datetime.date.today().strftime('%Y%m%d')`。一处修复,两个调用点自动受益;显式传日期的调用(回测等)不受影响。`start_date='20210101'` 滚动 5 年窗口,不动。

## 非目标

- kline/quotes/backtest 数据链路(均正常,不受此 bug 影响)
- fundamental_pit 财报期滞后(20251231 为最新年报,属正常披露节奏)

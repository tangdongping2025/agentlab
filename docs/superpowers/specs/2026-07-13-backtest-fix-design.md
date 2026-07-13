# 2026-07-13 回测净值 bug 修复 + 沪深300真指数对比线

## 问题
1. **回测前 ~4.5 年净值恒 1.0**:rank_composite/ml 回测 2020-01~2024-07 期间 strategy 和 benchmark 全是 1.0(79 期里前 55 期)。
2. **沪深300对比线不准**:前端 BacktestPanel 已画 benchmark 线,但 benchmark 是「300 成分等权」proxy,非真·沪深300指数;且前段也平。

## 根因(已验证)
- `index_constituent` 表只有 **2024-07 后**数据(24 个月:2024×6 + 2025×12 + 2026×6)→ 2020-2024.06 期间 `_universe_as_of` 返回空 → holdings 空 + benchmark 空 → 收益全 0 → 净值恒 1.0。backtest.py 第 333 行 caveat 自述「universe 仅近 ~2 年有效」。
- 无沪深300指数日线数据(stock_daily 370 只全是个股,无 000300.SH)。

## 方案(用户确认:彻底修 + 新建 index_daily 表)
1. **补全 index_constituent 历史**:tushare `index_weight` 抓 000300.SH **2020-01~2024-07** 月度成分(~44月×300≈1.3w 行),合并入 index_constituent(去重,已有 2024-07 后的不覆盖)。
2. **加沪深300指数日线**:tushare `index_daily` 抓 000300.SH **2020-2026** 日线(~1400 行)→ 新建 `index_daily` 表(ts_code/trade_date/close/pct_chg/...)。
3. **改 backtest benchmark**:benchmark 净值改用 index_daily 的 000300.SH close 算累计净值(替代 `_period_return(universe)` 成分等权)。rank_composite 路径(run_backtest)和 ML 路径(_run_ml_backtest)两处都改。
4. **移除 caveat**:"2024-07 前幸存者偏差" 提示(数据 PIT 准确后不再适用)。
5. **重新部署 ECS** + 验证。

## 数据接口(已验证可用)
- `pro.index_weight(index_code='000300.SH', start_date='20200101', end_date='20200201')` → 300 行,cols [index_code, con_code, trade_date, weight]
- `pro.index_daily(ts_code='000300.SH', start_date='20200101', end_date='20200110')` → cols [ts_code, trade_date, close, pct_chg, ...]

## 验证
- 回测 2020-2026:前段(2020-2024)strategy 净值真实波动(不再恒 1.0)
- benchmark 线 = 沪深300指数累计净值(2020 起 ~1.0 到现在,与真实指数走势一致)
- 候选池 run 不受影响(strategy 仍用 universe 成分算)

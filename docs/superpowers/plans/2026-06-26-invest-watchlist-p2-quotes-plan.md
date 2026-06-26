# 自选股 P2-① 行情摘要 实现计划

> 2026-06-26 | spec: `docs/superpowers/specs/2026-06-26-invest-watchlist-p2-quotes-design.md`

## tushare 实测结论(plan 前置)
- `daily_basic` 多 ts_code 逗号:**不支持**(返空)
- `daily_basic` 单 ts_code 不传 trade_date:**返全历史**(2.3M 字符,不可用作最新)
- → 只能 `trade_cal`(最新交易日)+ `daily_basic`(trade_date 全市场)→ 后端 filter 自选股

## Task 拆解(TDD,每 Task 独立 commit)

### Task 1:后端 quotes 端点
- `routers/watchlist.py` 加 `GET /watchlist/quotes?refresh=false`
- `_call_tushare(api_name, **params)`:httpx POST pro.tushare.pro(token 读 settings.tushare_token,复用 tools/tushare.py 的 httpx 模式)
- 最新交易日:`trade_cal(exchange="SSE", start_date=today-7, end_date=today)` → filter `is_open=1` → max `cal_date`(缓存 1 天 `_TRADE_DATE_CACHE`)
- 行情:`daily_basic(trade_date=最新交易日)` → 全市场 dict[ts_code→item](缓存 60s `_QUOTES_CACHE`)
- 合并:watchlist 行 + 行情(close/pct_chg/pe/pb/total_mv),行情缺失字段 null
- 降级:trade_cal/daily_basic 失败 → 行情字段全 null,不阻塞;空自选股 → 返 `[]`
- `schemas.py` `WatchlistQuoteOut`(扩 WatchlistOut 加 close/pct_chg/pe/pb/total_mv 可空)
- 测试 `test_watchlist_quotes.py`:mock httpx(trade_cal + daily_basic 返 fixture),验证 ① 合并行情字段 ② 缓存命中(二次调 httpx 不再调) ③ daily_basic 失败降级 null ④ 空自选返 []

### Task 2:前端 WatchlistPanel 行情列 + 刷新
- `dbApi.ts` 加 `listWatchlistQuotes(refresh?)` → GET /api/db/watchlist/quotes
- `WatchlistPanel.tsx`:加载改 quotes;表格列 = 代码/名称/现价/涨跌幅%/PE/PB/总市值(亿);备注+加入时间 移到 `<tr title=...>`;涨跌幅红涨绿跌;无行情「—」;右上角「🔄 刷新」按钮(refresh=true)
- 测试 `WatchlistPanel.test.tsx`:行情列渲染 + 涨跌幅颜色 + 刷新按钮点击调 listWatchlistQuotes(true)

### Task 3:部署 ECS + push
- backend patch(routers/watchlist.py + schemas.py)+ supervisorctl restart uvicorn
- frontend dist patch + nginx restart
- 端到端验证:GET /api/db/watchlist/quotes 返行情(有自选股时)
- git push

## 风险与简化
- **载荷**:daily_basic 全市场 ~5000 行(~1-2MB),后端 filter 后返几行;60s 缓存控频率
- **数据延迟**:daily_basic T+1(最新开市日数据次日才有);trade_cal 取 cal_date<=today 的最新 is_open=1,若 daily_basic 空则行情 null(降级,前端「—」)
- **total_mv 单位**:tushare total_mv 单位千元 → 前端 /10000 = 亿;保留 1 位小数
- **涨跌幅颜色**:A 股红涨绿跌(pct_chg>0 红,<0 绿,==0 灰)

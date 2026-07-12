# 数据管理 UI 设计(抓取 + 增量 + 进度)

> 日期:2026-07-12
> 背景:补 invest_agent 数据获取的产品缺口——前端无抓数据入口、`fetch_candidates_data.py` 全量重抓无增量、`FetchLog` 表只写不读

## 1. 问题

当前数据获取对终端用户完全不可见:
- 抓沪深300 数据只能命令行(`docker exec ... fetch_candidates_data.py`),前端候选池/回测面板上没有任何"抓数据"/"更新数据"按钮——用户不知道数据怎么来、怎么更新
- `fetch_candidates_data.py` 是**全量重抓**(每股 DELETE+INSERT 整个区间),不是增量;`FetchLogModel` 表记了进度锚点(`last_anchor_date`)但**只写不读**——schema 本为增量设计,读侧没用起来,是最大浪费

## 2. 目标与非目标

**目标**:
1. 前端 invest agent 加"数据管理" tab:UI 触发抓取 + 看进度 + 看当前数据状态(三表行数 + 锚点日期)
2. 后端 API:异步触发抓取(daemon thread)+ 进度查询 + 状态查询
3. 增量:有 `FetchLog.last_anchor_date` → 增量抓 daily;无 → 全量;`force_full=True` → 强制全量修复
4. 进度:轮询反馈(进度条 + 当前股 + 失败数)

**非目标**(YAGNI):
- 不做任务恢复(daemon thread 随 backend 重启丢,重新触发即可)
- 不做定时/自动抓取(手动触发)
- 不做增量成分抓取(`index_weight` 保历史全量 upsert,PIT 依赖)

## 3. 架构

```
前端 DataManagementPanel          后端 routers/data_fetch.py
  ├─ 状态区(GET /fetch/status) ──→ 三表行数 + last_anchor_date
  ├─ 抓取按钮(POST /fetch/trigger)─→ 起 daemon thread,返回 job_id
  ├─ 进度条(setInterval 2s 轮询   ──→ GET /fetch/progress(读内存 dict)
  │         GET /fetch/progress)
  └─ 结果提示                         thread 跑 fetch_all(增量/全量)
                                      → 写 stock_daily/fundamental_pit/index_constituent
                                      → 进度回调更新内存 dict
                                      → 成功写 FetchLog.last_anchor_date
```

## 4. 前端

### 入口(tabs 数据驱动,改 3 处)
- `backend/agents/invest_agent.py:16` tabs 数组追加 `"数据管理"`
- `src/components/agentRuntime/TabsWorkspace.tsx:65-73` switch 加 `activeStatic === '数据管理' && <DataManagementPanel />`
- 新建 `src/components/agentRuntime/DataManagementPanel.tsx`(参考 `CandidatePanel.tsx` 的顶栏 + running 态 + 结果区范式)

### DataManagementPanel 布局
- **状态区**(挂载时 + 抓取完成后调 `GET /fetch/status`):三表行数(`stock_daily`/`fundamental_pit`/`index_constituent`)+ `last_anchor_date` + `last_updated_at`
- **操作区**:
  - "抓取数据"主按钮(自动判断增量/全量:有锚点→增量,无→全量)
  - "强制全量修复"次按钮(`force_full=true`,用于数据损坏修复)
- **进度区**(触发后 `setInterval(2000)` 轮询 `GET /fetch/progress`,完成停止):进度条(`done/total`)+ 百分比 + 当前股 `current_code` + 失败数 `fail`
- **结果区**:完成(`state=done`,显示抓取行数)/ 失败(`state=failed`,显示 error)

### dbApi 扩展(`src/services/dbApi.ts`)
新增三个方法(沿用 `req<T>` helper):
- `triggerFetch(force_full?: boolean) → { job_id, state }`
- `getFetchProgress() → { state, done, total, current_code, fail, started_at, finished_at, error }`
- `getFetchStatus() → { stock_daily, fundamental_pit, index_constituent, last_anchor_date, last_updated_at }`

> 注:项目当前无任务进度轮询组件(`CandidatePanel`/`BacktestPanel` 都是同步阻塞),本 panel 内 inline 一个 `setInterval` 轮询(首个轮询使用,不抽通用 hook,YAGNI)。

## 5. 后端 API(`backend/routers/data_fetch.py`,在 `main.py:33-40` 注册)

| 端点 | 方法 | 行为 |
|---|---|---|
| `/api/db/fetch/status` | GET | 查三表 count + `FetchLog` 最新记录,返回当前数据状态 |
| `/api/db/fetch/trigger` | POST `{force_full?: bool}` | 若内存 dict `state=="running"` → 409(互斥);否则起 daemon thread,立即返回 `{job_id, state:"running"}` |
| `/api/db/fetch/progress` | GET | 返回内存 dict(`state`/`done`/`total`/`current_code`/`fail`/`started_at`/`finished_at`/`error`) |

## 6. 增量逻辑(`fetch_candidates_data.py` 改造)

`fetch_all` 入口增加锚点读取 + `force_full` 分支:
- 读 `FetchLogModel(source="stock_daily").last_anchor_date`
- **无记录 或 `force_full=True`** → 全量(`start_date` 用参数默认 `20200101`)
- **有记录** → 增量(`start_date = next_trade_day(last_anchor_date)`)

写入改造:
- **daily**:`_merge_daily` 已支持 `start_date/end_date`(L36,透传 tushare)。写入由"每股全删"改为 **UPSERT**(MySQL `INSERT ... ON DUPLICATE KEY UPDATE`,PK `(code, trade_date)` 天然幂等)——增量场景只写新交易日,不重写旧数据
- **index_weight / fundamentals**:保**历史全量 + UPSERT**(`screener._universe` L93-104 的 PIT 取数依赖成分历史快照,不能只抓最新一天)

进度回调:`fetch_all` 新增 `progress_callback(done, total, current_code, fail)` 参数,daemon thread 传入更新内存 dict。

锚点推进:成功后写 `FetchLog(source="stock_daily", last_anchor_date=end_date, rows_total=..., note=...)`(沿用 L116-121 现状写法)。

## 7. 后台执行(daemon thread + 内存进度 dict)

- `routers/data_fetch.py` 模块级 `_JOB: dict`(进程内,backend 重启重置 idle)
- `trigger` 端点:`threading.Thread(target=_run_fetch_job, args=(force_full,), daemon=True).start()`
- `_run_fetch_job(force_full)`:独立 `SessionLocal()`(不共享请求 session);`try: fetch_all(db, ..., progress_callback=_update_job) except Exception as e: _JOB["state"]="failed"; _JOB["error"]=str(e) finally: db.close(); if state!="failed": _JOB["state"]="done"`
- `_update_job(done, total, current_code, fail)`:`_JOB.update(...)`
- `progress` 端点:返回 `dict(_JOB)`
- **互斥**:`trigger` 若 `_JOB.get("state")=="running"` → `HTTPException(409, "已有抓取任务在跑")`

> 关键:`fetch_all` 是 sync + 持 SQLAlchemy session,**必须**丢 daemon thread 跑,不能在 FastAPI 请求里直接 await(会阻塞事件循环)。

## 8. next_trade_day 工具

复用 `routers/watchlist.py:115-123` `_recent_open_dates()`(调 `pro.trade_cal`)的逻辑思路,在 `scripts/` 下抽一个 `_next_trade_day(pro, anchor_date)`:查 `anchor_date` 之后第一个开市日。或直接在 `fetch_candidates_data.py` 内联(tushare `trade_cal` 一次调用)。

## 9. 文件清单

**新增**:
- `backend/routers/data_fetch.py`(trigger/progress/status + daemon thread + 内存 _JOB)
- `src/components/agentRuntime/DataManagementPanel.tsx`(状态/操作/进度/结果)

**改**:
- `backend/agents/invest_agent.py:16`(tabs 追加"数据管理")
- `src/components/agentRuntime/TabsWorkspace.tsx:65-73`(switch 加 case)
- `src/services/dbApi.ts`(triggerFetch/getFetchProgress/getFetchStatus + TS 类型)
- `backend/scripts/fetch_candidates_data.py`(锚点读侧 + force_full 分支 + daily UPSERT + progress_callback)
- `backend/main.py:33-40`(注册 data_fetch router)

## 10. 风险与边界

- **daemon thread 异常**:必须 try/except 全包,否则 thread 死、`_JOB.state` 卡 `"running"`(后续 trigger 永远 409)。`finally` 兜底置 `done`/`failed`
- **内存 _JOB 重启丢**:backend 容器重启 → `_JOB` 重置 idle(进度丢)。可接受(重新触发);不做持久化(YAGNI)
- **daily UPSERT**:MySQL `INSERT ... ON DUPLICATE KEY UPDATE`,需 SQLAlchemy `dialects.mysql.insert(...).on_duplicate_key_update(...)`
- **index_weight 全量 upsert**:数据量小(沪深300 × 历史快照天数),可接受;不能改成"只抓最新"
- **tushare 限速/积分**:增量只抓新交易日(快);全量 300 股 × 多接口 × sleep 0.3s(慢,1-3h);部分接口可能积分不够→逐股 try/except continue(已有)
- **API 校验**:trigger 仅校验互斥(running 拒绝);force_full 布尔默认 false

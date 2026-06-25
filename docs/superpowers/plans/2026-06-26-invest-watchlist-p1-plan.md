# 自选股(P1)实现计划

> 2026-06-26 | spec: `docs/superpowers/specs/2026-06-26-invest-watchlist-p1-design.md`

## 前端 ACTION 核实(plan 补充 spec)
- **现状**:base_agent emit ACTION → 前端 `eventAdapter` 转 DisplayEvent(进 observability 时间线 label);store(`agentRuntimeStore.ts:461`)仅对 `switch_agent` 自动执行
- **对话消息区不渲染 ACTION 按钮**(只进 observability)
- **方案**:store 新增 `pendingWatchlistSuggestion` state(收到 ACTION `suggest_pin_stock` → set);对话消息区渲染 `WatchlistSuggestButton`(三态)。不是纯复用,要新加 store 字段 + 渲染逻辑

## Task 拆解(TDD,每 Task 独立 commit)

### Task 1:后端 watchlist 表 + 模型
- `models.py` 加 `WatchlistModel`(id PK / ts_code UNIQUE / name / add_time / note)
- `create_tables()` 自动建表(零 migration)
- 测试:`test_watchlist_model`(字段 + ts_code 唯一约束,INSERT 重复抛错)

### Task 2:后端 watchlist 工具(四件套)
- `backend/runtime/tools/watchlist.py`:
  - `suggest_pin_stock(ts_code, name)` — 查 DB 是否已有 → 返回 `{"_action":"suggest_pin_stock","ts_code","name","already_pinned":bool}`(走 base_agent ACTION emit)
  - `pin_stock(ts_code, name, note="")` — INSERT IGNORE(防重)
  - `unpin_stock(ts_code)` — DELETE WHERE ts_code
  - `list_watchlist()` — SELECT *
- 直连 DB via `SessionLocal`;`register_tool`;`tools/__init__.py` import
- 测试:`test_watchlist_tool`(四件套行为 + already_pinned 查重 + ts_code 唯一)

### Task 3:后端路由 /api/db/watchlist
- `routers/watchlist.py`:`GET`(列表)/ `POST`(加,body ts_code/name/note?)/ `DELETE /{ts_code}`(删)
- `schemas.py`:WatchlistIn / WatchlistOut
- `main.py` include_router
- 测试:`test_watchlist_router`(CRUD + ts_code 唯一 409)

### Task 4:invest agent 集成
- `invest_agent.py`:`tool_names` 加四件套;`workspace.tabs` 加"自选股";提示词加段(明显关注→suggest;明确"加自选"→pin_stock;"移除"→unpin;"我的自选"→list)
- 测试:`test_invest_agent`(tool_names 含四件套 + tabs 含"自选股")

### Task 5:前端 store + dbApi
- `dbApi.ts`:watchlist API(list / pin / unpin)
- `agentRuntimeStore.ts`:ACTION(`suggest_pin_stock`)→ set `pendingWatchlistSuggestion`(ts_code/name/already_pinned);新增 `pinWatchlist` / `unpinWatchlist`(调 API + 清 suggestion 状态)
- 测试:store 收 ACTION → set suggestion;pin/unpin 调 API

### Task 6:前端 WatchlistSuggestButton 组件
- 三态:未加(点击 POST → 已加入)/ 已加(灰显"已自选")/ 已加入(点击 DELETE 撤 → 回未加)
- `ChatWorkspace` + `TabsWorkspace` 对话区渲染(检测 `pendingWatchlistSuggestion` 非空 → 渲染按钮)
- 测试:按钮三态渲染 + 点击调 store pin/unpin

### Task 7:前端 WatchlistPanel(自选股 tab)
- `WatchlistPanel`:`GET /api/db/watchlist` → 只读表格(ts_code/name/note/add_time)
- invest `TabsWorkspace` tab 注册"自选股"
- 测试:tab 渲染 + 列表加载

### Task 8:部署 ECS + push
- 后端多文件 tar patch(models / watchlist.py / tools/__init__.py / invest_agent.py / routers/watchlist.py / schemas.py / main.py)+ supervisorctl restart uvicorn(首次 restart 触发 create_tables 建表)
- 前端 dist patch + nginx restart
- git push

## 风险与简化
- **ACTION 时序**:`pendingWatchlistSuggestion` 在 AI 回复期间 set;下次用户发消息时 clear(避免跨轮残留)。不关联到具体消息(简化,放对话区底部)
- **ts_code 唯一**:A股 ts_code 含 `.SH`/`.SZ` 后缀,天然唯一;INSERT IGNORE 防重复 pin
- **suggest 频率**:依赖提示词教 LLM "仅明显关注时",P1 不做硬限制(P2)

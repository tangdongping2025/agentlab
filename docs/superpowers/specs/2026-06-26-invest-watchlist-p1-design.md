# 自选股(P1)规格设计

> 2026-06-26 | invest agent P1 | brainstorm 决策已与用户对齐

## 背景
invest agent P0 已完成(tushare 查金融数据 + tabs 对话/文件/Skill)。P1 加「自选股」:用户长期关注的股票清单,**AI 主动推荐 + 一键加**(对话内按钮),「自选股」tab 全景查看。

## 核心交互(AI 主动推荐 + 一键加/撤销)
1. 用户问"茅台最近走势"→ invest 识别**明显关注** → 调 `suggest_pin_stock(ts_code, name)`
2. 工具查 watchlist 是否已有 → emit `ACTION(suggest_pin_stock, ts_code, name, already_pinned)`
3. 前端对话窗口:AI 消息下方渲染按钮
   - 未加:`📈 加入自选 [贵州茅台 600519]`
   - 已加:灰显 `已自选`
4. 点击加入 → `POST /api/db/watchlist` → 按钮变 `✓ 已加入 | 移除`
5. 点"移除" → `DELETE /api/db/watchlist/{ts_code}` → 按钮回 `加入自选`

## 决策(brainstorm 对齐)
1. **操作主体**:agent 对话主导 + **AI 主动推荐**(suggest_pin_stock);前端 tab 只读 + 对话内按钮一键加/撤销
2. **数据范围**:**全局单用户**(所有 session 共享一份 watchlist;个人项目)
3. **watchlist 字段**:`id`(PK 自增)+ `ts_code`(UNIQUE)+ `name` + `add_time` + `note`(可空)
4. **工具(四件套,`backend/runtime/tools/watchlist.py`)**:
   - `suggest_pin_stock(ts_code, name)` — 查重后 emit ACTION(不真加),驱动前端出按钮
   - `pin_stock(ts_code, name, note?)` — 真加(INSERT IGNORE,ts_code 唯一防重)
   - `unpin_stock(ts_code)` — 真删
   - `list_watchlist()` — 列全部
5. **「自选股」tab**:只读列表(ts_code/name/note/add_time)。P1 纯列表;行情摘要(调 daily_basic)放 P2
6. **触发频率**:提示词教"仅明显关注时 suggest"(查行情/问基本面/"值不值得关注"),闲聊/已自选不 suggest

## 后端设计
- **models.py**:加 `WatchlistModel`(id/ts_code/name/add_time/note);`create_tables()` 自动建表(零 migration)
- **工具 watchlist.py**:四件套,直连 DB(via `SessionLocal`),复用 `register_tool`;suggest 返回 `{"_action":"suggest_pin_stock",...}` 走 base_agent 的 ACTION emit 机制
- **路由 `routers/watchlist.py`**(挂 `/api/db`):
  - `GET /api/db/watchlist` — 列全部
  - `POST /api/db/watchlist` — 加(body: ts_code/name/note?)
  - `DELETE /api/db/watchlist/{ts_code}` — 删
- **invest_agent.py**:`tool_names` 加四个 watchlist 工具;`workspace.tabs` 加"自选股";提示词加段

## 前端设计
- **对话内按钮**(复用 ACTION 事件机制 + 新组件):
  - adapter:ACTION(suggest_pin_stock)进 workspaceEvents
  - ChatWorkspace/TabsWorkspace 消息渲染:检测该 ACTION → AI 消息下方插 `WatchlistSuggestButton`
  - WatchlistSuggestButton 三态:未加(可点 POST)/ 已加(灰)/ 已加入-可撤(点 DELETE);点击调 /api/db/watchlist
- **「自选股」tab**:`WatchlistPanel` — GET /api/db/watchlist → 只读表格
- invest workspace tabs:`["对话","文件","Skill","自选股"]`

## 提示词增量(invest system_prompt)
```
当识别到用户明显关注某只股票时(查询行情/问基本面/问值不值得关注),调用 suggest_pin_stock 推荐(已自选的不重复 suggest)。
用户明确说"加自选/关注"时,直接 pin_stock;说"移除/取消关注"时 unpin_stock;问"我的自选股"时 list_watchlist。
```

## 范围
- **P1(本次)**:watchlist 表 + 4 工具 + 路由 + 对话内按钮(加/撤销)+ 自选股 tab(纯列表)+ 提示词
- **P2(不做)**:tab 行情摘要、分组/标签、备注编辑 UI、suggest 频率硬限制

## 测试
- backend:watchlist 工具(pin/unpin/list/suggest 行为 + ts_code 唯一)+ 路由 CRUD
- 前端:WatchlistSuggestButton 三态 + 点击加/撤;WatchlistPanel 列表渲染

## 部署
- 后端:多文件 tar patch(models.py / watchlist.py / tools/__init__.py / invest_agent.py / routers/watchlist.py / main.py)+ supervisorctl restart uvicorn(create_tables 自动建表)
- 前端:dist patch(nginx restart)

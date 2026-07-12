# 股票基础信息表设计(StockBasicModel)

> 日期:2026-07-12
> 背景:`screener._stock_names_map`(候选池)和 `watchlist.add_stock` 每次调 tushare `stock_basic` 浪费积分 + 有延迟(虽 1d 内存缓存,backend 重启即丢)。基础信息变动小,持久化到本地表。

## 目标与非目标

**目标**:
1. 建 `StockBasicModel`(丰富字段)+ `fetch_candidates_data` 抓取时填充(UPSERT)
2. `screener._stock_names_map` / `watchlist.add_stock` 改查本地表(不再每次调 tushare)

**非目标**(改动小):
- **不改** `stock-detail`(`analyze_stock` 改动大,后续单独做)
- 不改日线/财务/成分抓取逻辑
- watchlist.add_stock 保留 tushare fallback(本地表空时降级,渐进迁移)

## 表设计 `StockBasicModel`(`models.py`)

| 字段 | 类型 | 说明 |
|---|---|---|
| `ts_code` | String(12) PK | 股票代码 |
| `name` | String(64) | 名称 |
| `industry` | String(40) | 行业 |
| `area` | String(20) | 地域 |
| `market` | String(16) | 市场(主板/创业板/科创板/北交所) |
| `exchange` | String(8) | 交易所(SSE/SZSE/BSE) |
| `list_date` | String(8) | 上市日 |
| `list_status` | String(2) | L上市/D退市/P暂停 |
| `delist_date` | String(8) nullable | 退市日 |
| `fullname` | String(128) nullable | 全称 |
| `enname` | String(128) nullable | 英文名 |

> exchange 从 ts_code 后缀映射(.SH→SSE/.SZ→SZSE/.BJ→BSE)或 stock_basic 返回。

## 抓取 `_fetch_stock_basic(pro, db)`

- 调 `pro.stock_basic`(全市场,`list_status='L'` + 可选退市),取上述字段
- UPSERT(`db.merge`,PK `ts_code` 幂等,可重跑)
- `fetch_all` 在 `_fetch_constituents`(index_weight)后调一次(成分股先入 index_constituent,stock_basic 全市场一次灌)

## 改造(小,两处)

1. **`screener._stock_names_map`**:改成 `db.query(StockBasicModel).all()` → `{ts_code: {name, industry}}`。表空返回 `{}`(候选 name 空)。**删掉 tushare 调用 + httpx 缓存逻辑**(纯本地)。
2. **`watchlist.add_stock`**:`payload.name` 空时,**先查本地 stock_basic**;本地无再 tushare stock_basic(保留 fallback)。减少 tushare 调用。

## 文件清单

**改**:
- `backend/models.py`(加 `StockBasicModel`)
- `backend/scripts/fetch_candidates_data.py`(加 `_fetch_stock_basic` + `fetch_all` 调)
- `backend/scripts/screener.py`(`_stock_names_map` 改本地查,签名加 `db` 参数)
- `backend/routers/watchlist.py`(`add_stock` 先查本地)
- `backend/scripts/screener.py` 的 `compute_candidates`(传 db 给 `_stock_names_map`)

**测试**:
- `backend/tests/test_stock_basic.py`(抓取 UPSERT + screener 本地查 + watchlist 本地补 name)

> `main.py:create_tables` 自动建新表(SQLAlchemy `create_all`,无需手工 migration)。

## 风险与边界

- **抓取前表空**:screener 返回 `{}`(候选 name 空,不崩);watchlist.add_stock fallback tushare
- **`compute_candidates` 签名变化**:`_stock_names_map` 加 `db` 参数,调用点 `compute_candidates` 已有 db,透传即可
- **退市股**:`list_status='L'` 只抓存续;退市股(如合成测试 600013)本地无 → screener name 空(测试用 sqlite 自造)
- **tushare 积分**:`stock_basic` 是低积分接口(免费 token 够),一次全市场 ~5000 股,小数据

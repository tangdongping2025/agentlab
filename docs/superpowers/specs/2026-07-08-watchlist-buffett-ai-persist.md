# RQ-094 巴菲特 AI 深挖结果持久化

> 2026-07-08 | 设计文档 | 关联 RQ-093 AI 深挖

## 概述

AI 深挖结果落 MySQL 持久化,默认查库(0 token),只有用户主动点「深挖/重新深挖」(force=true)才调 LLM。解决 RQ-093 内存缓存的两个问题:uvicorn 重启丢失 + 24h 自动过期重调。

## 数据流

```
用户进巴菲特 tab → BuffettView 挂载
 → 对 Q3/Q7 各调 POST ai-deepdive {dimension, force:false}(查库,秒回)
 → 库有 → 直接显示文本 + 「🔄 重新深挖」按钮(0 token)
 → 库无 → 显示「⚡ AI 深挖」按钮
用户点「⚡ 深挖」或「🔄 重新深挖」
 → POST ai-deepdive {dimension, force:true}
 → 调 LLM + 覆盖写库 → 显示新文本
```

## 后端变更

### 1. 新表 `BuffettAiCacheModel`(`models.py`)

```python
class BuffettAiCacheModel(Base):
    """巴菲特 AI 深挖结果缓存(每股票每维度一条)。"""
    __tablename__ = "buffett_ai_cache"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ts_code = Column(String(32), nullable=False)
    dimension = Column(String(32), nullable=False)  # moat_type | management_integrity
    text = Column(MEDIUMTEXT, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (Index("uniq_buffett_ai", "ts_code", "dimension", unique=True),)
```

### 2. 端点改造(`routers/watchlist.py`)

`POST /watchlist/stock-detail/{ts_code}/ai-deepdive` body 改 `{dimension, force?: bool}`:

```python
@router.post("/watchlist/stock-detail/{ts_code}/ai-deepdive")
def ai_deepdive(ts_code: str, payload: dict, db: Session = Depends(get_db)):
    dimension = payload.get("dimension")
    force = bool(payload.get("force", False))
    # 校验 dimension...
    # 查库
    if not force:
        row = db.query(BuffettAiCacheModel).filter_by(ts_code=ts_code, dimension=dimension).first()
        if row:
            return {"dimension": dimension, "text": row.text, "cached": True, "cached_at": row.created_at.isoformat()}
        return {"dimension": dimension, "text": None, "cached": False}  # 不调 LLM
    # force=true → 调 LLM + 覆盖存库
    analysis = analyze_stock(ts_code)
    text = _call_llm(*_build_ai_prompt(ts_code, dimension, analysis))
    existing = db.query(BuffettAiCacheModel).filter_by(ts_code=ts_code, dimension=dimension).first()
    if existing:
        existing.text = text; existing.created_at = datetime.utcnow()
    else:
        db.add(BuffettAiCacheModel(ts_code=ts_code, dimension=dimension, text=text))
    db.commit()
    return {"dimension": dimension, "text": text, "cached": False}
```

去掉旧的 `_AI_CACHE`/`_AI_TTL`(内存缓存,改用库)。

## 前端变更

### `DeepDiveRow`(`StockDetailPanel.tsx`)

- 挂载时自动调 `aiDeepdive(ts_code, dimension, force=false)` 查库:
  - `text` 非空 → 显示文本 + 「🔄 重新深挖」按钮
  - `text` 为 null → 显示「⚡ AI 深挖」按钮
- 点任一按钮 → `force=true` 调 LLM → 更新显示

### `dbApi.aiDeepdive` 加 force 参数

```typescript
aiDeepdive: (ts_code, dimension, force = false) =>
  req<{dimension; text: string|null; cached: boolean; cached_at?: string}>(
    `/watchlist/stock-detail/${ts_code}/ai-deepdive`,
    { method: 'POST', body: JSON.stringify({ dimension, force }) }
  )
```

## 测试

### 后端 `test_ai_deepdive.py` 改造
- `test_deepdive_no_cache_returns_null_text`(force=false, 库空 → text=null, 不调 LLM)
- `test_deepdive_force_calls_llm_and_stores`(force=true → 调 LLM + 入库)
- `test_deepdive_cached_hit_from_db`(force=false, 库有 → 返回 text, 不调 LLM)
- `test_deepdive_force_overwrites`(第二次 force → 覆盖文本)

### 前端 `StockDetailPanel.test.tsx`
- 挂载自动查库(mock aiDeepdive 返回 text)→ 直接显示文本(不用点)
- 库空(text=null)→ 显示按钮,点击 force=true 调 LLM

## 不包含

- 多用户隔离(全局单用户,跟 watchlist 一致)
- 历史版本(只存最新,覆盖)
- 自动过期(永久存,除非 force 刷新)

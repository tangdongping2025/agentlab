# RQ-089 自选股手工添加与删除

> 2026-07-07 | 设计文档 | 关联 RQ-087 自选股行情摘要

## 概述

在 WatchlistPanel（自选股面板）增加手工添加/删除股票的入口。用户输入股票代码 → 后端自动调 tushare 补齐名称 → 写入自选股表；每行提供删除按钮。后端已有完整的 POST/DELETE API，改动极小。

## 数据流

```
用户在面板输入 "600519"
 → 点"添加"
 → 前端 POST /api/db/watchlist { ts_code: "600519" }     ← name 不传
 → 后端自动推断交易所后缀:
     6 开头 → .SH
     0/3 开头 → .SZ
     4/8 开头 → .BJ
 → 调 tushare stock_basic 查询该代码的名称
 → 若 tushare 查不到 → 返回 404(股票代码不存在)
 → 若已存在(409) → 返回"已在自选股中"
 → 写入 watchlist(ts_code, name, add_time)
 → 前端自动刷新行情列表

删除：点击行尾删除按钮
 → DELETE /api/db/watchlist/{ts_code}
 → 前端自动刷新(行消失)
```

## 后端变更

### schemas.py

`WatchlistIn.name` 改为 `Optional[str]`（默认 None），由后端自动补齐。

```python
class WatchlistIn(BaseModel):
    ts_code: str
    name: Optional[str] = None  # 改为可选
    note: Optional[str] = None
```

### routers/watchlist.py — POST 端点

在现有 `add_stock` 函数中增加逻辑：

1. `payload.ts_code` 可能有 6 位纯数字输入（无后缀），也可能已有 `.SH/.SZ/.BJ` 后缀
2. 若无后缀，按规则推断交易所：
   - `6` 开头 → 追加 `.SH`
   - `0` 或 `3` 开头 → 追加 `.SZ`
   - `4` 或 `8` 开头 → 追加 `.BJ`
3. 若 `payload.name` 为空，调 tushare `stock_basic` 查询股票名称
4. 若 `stock_basic` 返回为空 → 抛 404 `"股票代码不存在"`
5. 若已存在(现有 409 逻辑) → 正常返回 `"已在自选股中"`
6. 其余逻辑不变

### Tushare token 配置

写 `backend/.env`，增加一行：

```
TUSHARE_TOKEN=ea217535865d5881ce62dfe31a45dcf7372c967e29a019ca442e4176
```

## 前端变更

### WatchlistPanel.tsx

只改这一个文件。在行情表格上方加：

- **输入框**：`<input>`，`placeholder="输入股票代码，如 600519"`
- **添加按钮**：「📈 添加」，点击后：
  1. 调 `dbApi.pinWatchlist(ts_code)`（store 已有方法）
  2. 成功后自动 `load(true)` 刷新行情
  3. 失败时显示错误（查不到代码 / 网络错误）
- **删除按钮**：每行末尾加「×」删除按钮，点击后：
  1. 调 `dbApi.unpinWatchlist(ts_code)`（store 已有方法）
  2. 成功后自动 `load(true)` 刷新

状态处理：
- 添加中/删除中 → 按钮 loading/disabled
- 空输入时添加按钮 disabled
- 错误显示在输入框下方（红色文字），支持重试

### 不变的内容

- `dbApi.ts` — 不动
- `agentRuntimeStore.ts` — 不动（`pinWatchlist`/`unpinWatchlist` 已有）
- `WatchlistSuggestButton.tsx` — 不动
- 后端 DELETE/GET 端点 — 不动

## 测试

### WatchlistPanel.test.tsx

补充测试：

1. **添加流程**：输入代码 → 点击添加 → 验证 `dbApi.pinWatchlist` 被调用
2. **删除流程**：点击某行的删除按钮 → 验证 `dbApi.unpinWatchlist` 被调用  
3. **空输入**：空输入时添加按钮 disabled
4. **错误处理**：pinWatchlist 失败 → 展示错误信息
5. **状态恢复**：添加成功后自动刷新列表

## 不包含

- 搜索/自动补全弹窗（方案 B，用户选了 A）
- 双列选股/批量添加
- 股票名称的手动编辑
- 排序/拖拽改变顺序

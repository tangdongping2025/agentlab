# RQ-024：增加联网搜索功能（xueqiu-mcp 真实化）

## 背景

Context Lab 现有 6 个工具全部返回 mock 硬编码数据，智能体无法获取真实信息。本需求将 xueqiu 相关工具对接真实 API，删除无法接真实 API 的工具，让智能体能真正获取实时股票数据。

火山引擎 ARK 不支持 Claude 的 `web_search` tool（经测试验证，实际返回模型为 `doubao-seed-code`，web_search 被忽略）。SearXNG 公共实例国内访问不稳定。因此选择利用已有的 xueqiu-mcp npm 包作为数据源。

## 工具体系重构

### 删除的工具（4 个）

| 工具 ID | 原因 |
|---------|------|
| `xueqiu-news` | xueqiu-mcp 无对应工具 |
| `tradingview-chart` | 无真实 API |
| `akshare-data` | 无真实 API |
| `akshare-indicator` | 无真实 API |

### 保留并真实化的工具（3 个）

| 工具 ID | 名称 | 对应 xueqiu-mcp 工具 | 参数 |
|---------|------|---------------------|------|
| `xueqiu-search` | 雪球搜索 | `search_stock` | `query: string` |
| `xueqiu-quote` | 股票行情 | `get_stock` | `symbol: string` |
| `xueqiu-market` | 大盘指数（新增） | `get_market_index` | `market: "cn" \| "us" \| "hk"` |

工具 ID 保持不变（`xueqiu-search`、`xueqiu-quote`），保持场景配置中 `tools` 数组的兼容性。`xueqiu-market` 是新增工具。

`get_stocks`（批量查询）不单独暴露，Claude 可连续调用 `get_stock` 实现同样效果。

## 架构

### 数据流

```
前端 agentService.ts
  → fetch('/api/xueqiu/search_stock', { body: { query: "茅台" } })
  → Vite proxy
  → server middleware (xueqiu-proxy.ts)
  → spawn xueqiu-mcp subprocess, send JSON-RPC request
  → 返回真实数据
```

### 核心组件

1. **`context-lab/server/xueqiu-proxy.ts`** — Vite server middleware
   - 接收 HTTP 请求（`/api/xueqiu/:tool`）
   - 管理 xueqiu-mcp 子进程生命周期（懒启动、复用、超时清理）
   - 将 HTTP 请求转为 MCP JSON-RPC 调用，返回结果

2. **`context-lab/vite.config.ts`** — 新增 proxy 规则
   - `/api/xueqiu` → 转发到 middleware

3. **`agentService.ts`** — `executeTool()` 改造
   - `xueqiu-search`：`fetch('/api/xueqiu/search_stock')`
   - `xueqiu-quote`：`fetch('/api/xueqiu/get_stock')`
   - `xueqiu-market`：`fetch('/api/xueqiu/get_market_index')`

### MCP 子进程管理

- 懒启动：首次请求时 spawn，后续复用
- 超时：5 分钟无请求自动关闭
- 错误：子进程崩溃自动重启

## UI 和 Store 变更

### `appStore.ts`

- `AVAILABLE_TOOLS` 从 6 个缩减为 3 个
- 新增 `xueqiu-market` 工具定义
- 默认场景的 `tools` 数组同步更新

### `ToolSelector.tsx`

- 无逻辑变更，通过 `availableTools` 动态渲染

### `agentService.ts`

- `toolDefinitions` 只保留 3 个，schema 更新以匹配 xueqiu-mcp 真实参数
- `executeTool()` 从 mock 硬编码改为 `fetch('/api/xueqiu/:tool')` 调用真实 API

### 场景配置兼容

localStorage 中用户保存的自定义场景如果引用了被删工具，容错处理：找不到的工具定义直接跳过，不报错。

## 错误处理

### 网络层

- 请求超时（10 秒）→ 返回："搜索服务暂时不可用，请稍后重试"
- 子进程启动失败 → 返回："数据服务启动失败，请检查 xueqiu-mcp 是否安装"

### 工具调用层

- Claude 请求了不存在的工具 → 返回 `{"error": "Unknown tool"}`
- xueqiu-mcp 返回错误 → 透传错误信息给 Claude

### 降级策略

不做降级回 mock。工具不可用就返回错误，不返回假数据。原因：用户的学习目标是理解智能体如何与真实工具交互，mock 数据会误导。

## 设计理念合规检查

- **极简**：3 个工具替代 6 个，每个工具对应明确的真实数据源
- **专注**：工具聚焦股票数据查询，不扩展到无关领域
- **直觉**：工具行为与名称一致，搜索→搜索，行情→行情
- **一致性**：工具调用走统一 HTTP 代理，错误处理统一
- **工匠精神**：删除无法真实化的工具，不留半成品

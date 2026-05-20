# RQ-028 增加联网搜索功能（使用AnySearch）— 规格设计

## 需求概述

用 AnySearch 替换现有基于 xueqiu-mcp 的3个金融搜索工具，提供通用网页搜索 + 23个垂直领域搜索 + 网页内容提取能力。

## 现状

- 3个 xueqiu 工具：`xueqiu-search`、`xueqiu-quote`、`xueqiu-market`
- 架构：前端 fetch → Vite proxy → xueqiu-proxy.ts → xueqiu-mcp 子进程（stdio JSON-RPC）
- 仅覆盖金融场景，且依赖本地子进程

## 目标架构

```
用户提问 → Claude API → tool_use(anysearch / anysearch-extract)
  → agentService.executeTool()
    → fetch('/api/anysearch/:tool')
      → anysearch-proxy.ts (Vite middleware)
        → POST https://api.anysearch.com/mcp (JSON-RPC 2.0)
        ← result.content[0].text
      ← 文本结果
    ← truncateResult() 后写入 conversationHistory
  ← Claude 生成最终回复
```

与 xueqiu 架构的核心区别：**无子进程**，直接在 Vite middleware 中 HTTPS 请求远程 API。

## 工具定义（2个）

### 工具1：`anysearch`（联网搜索）

通用搜索和垂直搜索合一，通过 `domain`/`sub_domain` 参数区分。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 搜索关键词 |
| domain | string | 否 | 垂直领域代码 |
| sub_domain | string | 否 | 子领域路由键（垂直搜索必填） |
| zone | string | 否 | cn / intl |
| content_types | string | 否 | 逗号分隔：web,news,code,doc,academic,data,image,video,audio |
| max_results | number | 否 | 1-100，默认10 |
| freshness | string | 否 | day/week/month/year |

**垂直领域列表（内嵌于工具 description）：**

| domain | sub_domain | 说明 | query_format | zone |
|--------|-----------|------|-------------|------|
| finance | finance.us_stock | 美股行情 | 股票代码(AAPL)/公司名 | — |
| finance | finance.cn_stock | A股行情 | 6位股票代码/公司名 | cn |
| finance | finance.forex | 外汇行情 | 货币对(EUR_USD) | — |
| finance | finance.news | 金融新闻 | 关键词 | — |
| code | code.general | 代码搜索 | 自然语言 | — |
| academic | academic.doi | DOI论文查询 | DOI号 | — |
| academic | academic.paper | 论文搜索 | 关键词 | — |
| security | security.cve | CVE漏洞查询 | CVE编号 | — |
| legal | legal.case_law | 法律判例 | 关键词 | — |
| tech | tech.general | 科技资讯 | 关键词 | — |
| education | education.general | 教育资源 | 关键词 | — |
| health | health.general | 健康医疗 | 关键词 | — |
| business | business.general | 商业资讯 | 关键词 | — |
| 其他 | — | fashion/travel/home/ecommerce/gaming/film/music/ip/religion/geo/environment/energy/ugc | 关键词 | — |

垂直搜索时，Claude 先根据用户意图匹配 domain + sub_domain，再按 query_format 构造 query。无需运行时查询 list_domains。

### 工具2：`anysearch-extract`（网页提取）

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 目标网页URL |

返回网页全文 Markdown，截断上限 50000 字符。

## 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `context-lab/server/anysearch-proxy.ts` | 新建 | Vite middleware，HTTPS 调 api.anysearch.com/mcp |
| `context-lab/vite.config.ts` | 修改 | 注册 anysearch proxy，移除 xueqiu proxy |
| `context-lab/src/services/agentService.ts` | 修改 | 替换3个 xueqiu 工具定义为2个 anysearch 工具，更新 endpoint 映射 |
| `context-lab/src/stores/appStore.ts` | 修改 | availableTools 替换，场景工具分配更新 |
| `context-lab/server/xueqiu-proxy.ts` | 删除 | 不再需要 |

## anysearch-proxy.ts 设计

### 职责

接收前端 `/api/anysearch/:tool` 请求，转发到 `https://api.anysearch.com/mcp`。

### 请求映射

前端 `fetch('/api/anysearch/search', { body: { query, domain, ... } })` → middleware 组装 JSON-RPC：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": { "query": "...", "domain": "...", ... }
  }
}
```

工具名映射：`search` → `search`，`extract` → `extract`。

### API Key 管理

- 从 `context-lab/.env` 读取 `ANYSEARCH_API_KEY`
- 有值时注入 `Authorization: Bearer <key>` header
- 无值时匿名访问（低速率限制）

### 响应解析

从 JSON-RPC 响应中提取 `result.content[0].text`，返回纯文本给前端。

### 错误处理

- 请求超时 15s
- HTTP 4xx/5xx 返回错误信息
- rate limit 响应中含 `auto_registered` api_key 时，返回给前端提示用户（不在服务端自动保存）

## 场景工具分配

| 场景 | 工具 |
|------|------|
| 投资助手 | `['anysearch']` |
| 研究分析 | `['anysearch', 'anysearch-extract']` |
| 日常对话 | `[]` |
| 自定义 | `[]` |

## 沿用现有机制

- `truncateResult()` 防内存溢出（MAX_TOOL_RESULT_SIZE = 2048）
- 连续失败安全阀（2次失败退出 tool loop）
- 单次对话最多5轮 tool calling
- TimelineReplay 展示工具调用详情
- ToolSelectorBar 自动读取 availableTools

## 设计理念合规检查

| 原则 | 检查 |
|------|------|
| 极简 | 2个工具 vs 原来3个，用户选择更少；垂直领域信息内嵌工具描述，无需额外查询步骤 |
| 专注 | 搜索和提取职责分离，不混合 |
| 直觉 | 用户只需提问，Claude 自动选工具和参数 |
| 一致性 | 复用现有 agentService.executeTool + Vite proxy 架构，与 xueqiu 体验一致 |
| 工匠精神 | 删除 xueqiu-proxy.ts 及所有引用，无残留 |

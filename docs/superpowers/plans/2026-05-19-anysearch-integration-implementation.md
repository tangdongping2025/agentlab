# RQ-028 增加联网搜索功能（使用AnySearch）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 AnySearch API 替换 xueqiu-mcp，提供通用搜索 + 垂直搜索 + 网页提取能力。

**Architecture:** 新建 `anysearch-proxy.ts` Vite middleware，直接 HTTPS 调用 `api.anysearch.com/mcp`（无子进程）。前端替换3个 xueqiu 工具定义为2个 anysearch 工具，删除 xueqiu-proxy.ts。

**Tech Stack:** Node.js https 模块、Vite middleware、React/Zustand（已有）

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `context-lab/server/anysearch-proxy.ts` | Vite middleware，转发请求到 AnySearch API |
| 修改 | `context-lab/vite.config.ts` | 注册 anysearch proxy，移除 xueqiu proxy |
| 修改 | `context-lab/src/services/agentService.ts` | 替换工具定义 + endpoint 映射 |
| 修改 | `context-lab/src/stores/appStore.ts` | 替换 availableTools + 场景工具分配 |
| 修改 | `context-lab/.env` | 新增 ANYSEARCH_API_KEY |
| 删除 | `context-lab/server/xueqiu-proxy.ts` | 不再需要 |

---

### Task 1: 创建 anysearch-proxy.ts

**Files:**
- Create: `context-lab/server/anysearch-proxy.ts`

- [ ] **Step 1: 创建 anysearch-proxy.ts**

```typescript
// context-lab/server/anysearch-proxy.ts
import type { Connect } from 'vite';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from context-lab directory
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in process.env)) process.env[k] = v;
  }
}

const ENDPOINT = 'https://api.anysearch.com/mcp';
const API_KEY = process.env.ANYSEARCH_API_KEY || '';
const REQUEST_TIMEOUT = 15_000;

const TOOL_MAP: Record<string, string> = {
  search: 'search',
  extract: 'extract',
};

function callApi(toolName: string, args: Record<string, any>): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });

    const urlObj = new URL(ENDPOINT);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    if (API_KEY) {
      options.headers!['Authorization'] = `Bearer ${API_KEY}`;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
            return;
          }
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
            return;
          }
          const content = json.result?.content;
          if (Array.isArray(content)) {
            const textItem = content.find((c: any) => c.type === 'text');
            if (textItem) {
              resolve(textItem.text);
              return;
            }
          }
          resolve(JSON.stringify(json.result || json, null, 2));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 500)}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('请求超时，请稍后重试'));
    });

    req.on('error', (e) => reject(new Error(`连接错误: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

export function anysearchProxyMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith('/api/anysearch/')) return next();

    const toolName = req.url.replace('/api/anysearch/', '').replace(/\?.*$/, '');
    if (!TOOL_MAP[toolName]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
      return;
    }

    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', async () => {
      try {
        let args: Record<string, any> = {};
        if (body) {
          try { args = JSON.parse(body); } catch { args = {}; }
        }
        const result = await callApi(toolName, args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'text', text: result }] }));
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
  };
}
```

- [ ] **Step 2: 安装 dotenv 依赖（服务端读取 .env 用）**

```bash
cd context-lab && npm install dotenv
```

- [ ] **Step 3: Commit**

```bash
git add context-lab/server/anysearch-proxy.ts context-lab/package.json context-lab/package-lock.json
git commit -m "feat(RQ-028/T1): add anysearch-proxy middleware"
```

---

### Task 2: 更新 vite.config.ts

**Files:**
- Modify: `context-lab/vite.config.ts`

- [ ] **Step 1: 替换 xueqiu proxy 为 anysearch proxy**

将 `vite.config.ts` 的全部内容替换为：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { anysearchProxyMiddleware } from './server/anysearch-proxy'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'anysearch-proxy',
      configureServer(server) {
        server.middlewares.use(anysearchProxyMiddleware());
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api/anthropic': {
        target: 'https://ark.cn-beijing.volces.com/api/coding',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        secure: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 2: 删除 xueqiu-proxy.ts**

```bash
rm context-lab/server/xueqiu-proxy.ts
```

- [ ] **Step 3: Commit**

```bash
git add context-lab/vite.config.ts
git rm context-lab/server/xueqiu-proxy.ts
git commit -m "feat(RQ-028/T2): switch vite proxy from xueqiu to anysearch"
```

---

### Task 3: 替换工具定义（agentService.ts）

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

- [ ] **Step 1: 替换 toolDefinitions（第120-157行）**

将 `toolDefinitions` 属性（第120-157行）替换为：

```typescript
  private toolDefinitions: Record<string, ClaudeTool> = {
    'anysearch': {
      name: 'anysearch',
      description: `联网搜索工具，支持通用网页搜索和23个垂直领域搜索。

通用搜索：直接传入 query 即可，如 "今日AI新闻"、"量子计算最新进展"。
垂直搜索：需指定 domain 和 sub_domain，query 按对应格式构造。

垂直领域列表：
- finance.us_stock: 美股行情，输入股票代码(如AAPL)或公司名
- finance.cn_stock: A股行情，输入6位代码(如600519)或公司名，需设zone=cn
- finance.forex: 外汇行情，输入货币对(如EUR_USD)
- finance.news: 金融新闻，输入关键词
- code.general: 代码搜索，输入自然语言描述
- academic.doi: DOI论文查询，输入DOI号
- academic.paper: 论文搜索，输入关键词
- security.cve: CVE漏洞查询，输入CVE编号
- legal.case_law: 法律判例，输入关键词
- tech.general: 科技资讯，输入关键词
- education.general: 教育资源，输入关键词
- health.general: 健康医疗，输入关键词
- business.general: 商业资讯，输入关键词
- 其他领域: fashion/travel/home/ecommerce/gaming/film/music/ip/religion/geo/environment/energy/ugc，输入关键词

content_types可选值: web,news,code,doc,academic,data,image,video,audio
freshness可选值: day,week,month,year`,
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          domain: { type: 'string', description: '垂直领域代码，如 finance、code、academic' },
          sub_domain: { type: 'string', description: '子领域路由键，如 finance.cn_stock、code.general' },
          zone: { type: 'string', enum: ['cn', 'intl'], description: '区域: cn=中国, intl=国际' },
          content_types: { type: 'string', description: '内容类型过滤，逗号分隔: web,news,code,doc,academic,data,image,video,audio' },
          max_results: { type: 'number', description: '最大结果数，1-100，默认10' },
          freshness: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: '时间过滤' },
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    'anysearch-extract': {
      name: 'anysearch-extract',
      description: '提取指定URL网页的全文内容，返回Markdown格式。适用于需要获取搜索结果中某个链接的完整内容时使用。截断上限50000字符。',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标网页URL' }
        },
        required: ['url'],
        additionalProperties: false
      }
    }
  };
```

- [ ] **Step 2: 替换 endpointMap（第171-175行）**

将 `executeTool` 方法中的 `endpointMap`（第171-175行）替换为：

```typescript
    const endpointMap: Record<string, string> = {
      'anysearch': 'search',
      'anysearch-extract': 'extract',
    };
```

- [ ] **Step 3: 替换 fetch URL（第196行）**

将第196行的 fetch URL 从：

```typescript
      const response = await fetch(`/api/xueqiu/${endpoint}`, {
```

替换为：

```typescript
      const response = await fetch(`/api/anysearch/${endpoint}`, {
```

- [ ] **Step 4: 更新注释（第167行）**

将第167行注释从：

```typescript
  // 工具执行：调用 xueqiu-mcp 代理获取真实数据
```

替换为：

```typescript
  // 工具执行：调用 AnySearch 代理获取搜索数据
```

- [ ] **Step 5: Commit**

```bash
git add context-lab/src/services/agentService.ts
git commit -m "feat(RQ-028/T3): replace xueqiu tools with anysearch tools"
```

---

### Task 4: 替换 availableTools 和场景配置（appStore.ts）

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 替换 DEFAULT_SCENES（第107-140行）**

将 `DEFAULT_SCENES` 常量替换为：

```typescript
const DEFAULT_SCENES: SceneConfig[] = [
  {
    id: 'restaurant',
    name: '投资助手',
    icon: '📈',
    systemPrompt: '你是一个专业的投资助手，帮助用户搜索和分析股票、市场、财经新闻等信息。可以使用联网搜索工具。',
    tools: ['anysearch'],
    isPreset: true,
  },
  {
    id: 'research',
    name: '研究分析',
    icon: '🔬',
    systemPrompt: '你是一个研究分析助手，帮助用户搜索信息、查询资料、提取网页内容。可以使用搜索和网页提取工具。',
    tools: ['anysearch', 'anysearch-extract'],
    isPreset: true,
  },
  {
    id: 'dialog',
    name: '日常对话',
    icon: '💬',
    systemPrompt: '你是一个对话助手，帮助用户分析对话内容、情感和主题。',
    tools: [],
    isPreset: true,
  },
  {
    id: 'custom',
    name: '自定义',
    icon: '✏️',
    systemPrompt: '',
    tools: [],
    isPreset: true,
  },
];
```

- [ ] **Step 2: 替换 AVAILABLE_TOOLS（第142-146行）**

将 `AVAILABLE_TOOLS` 常量替换为：

```typescript
const AVAILABLE_TOOLS = [
  { id: 'anysearch', name: '🔍 联网搜索', description: '搜索网页、新闻、代码、论文、金融等23个垂直领域', icon: '🔍' },
  { id: 'anysearch-extract', name: '📄 网页提取', description: '提取指定URL网页的全文内容', icon: '📄' },
];
```

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/stores/appStore.ts
git commit -m "feat(RQ-028/T4): replace xueqiu tools with anysearch in appStore"
```

---

### Task 5: 更新 .env 配置

**Files:**
- Modify: `context-lab/.env`

- [ ] **Step 1: 在 .env 末尾添加 AnySearch API Key**

在 `context-lab/.env` 末尾追加：

```
# AnySearch API Key (可选，不填则匿名访问，速率限制较低)
ANYSEARCH_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add context-lab/.env
git commit -m "feat(RQ-028/T5): add AnySearch API key config to .env"
```

---

### Task 6: 验证 + 清理残留引用

**Files:**
- 检查所有文件中的 xueqiu 引用

- [ ] **Step 1: 搜索残留的 xueqiu 引用**

```bash
cd context-lab && grep -r "xueqiu" src/ --include="*.ts" --include="*.tsx" -l
```

预期：无结果。如果有，逐一替换为对应的 anysearch 引用。

- [ ] **Step 2: 运行 typecheck**

```bash
cd context-lab && npm run typecheck
```

预期：通过，无错误。

- [ ] **Step 3: 运行生产构建**

```bash
cd context-lab && npm run build
```

预期：构建成功。

- [ ] **Step 4: 启动 dev server，手动验证搜索功能**

```bash
cd context-lab && npm run dev
```

验证路径：
1. 打开 http://localhost:5173
2. 选择"投资助手"场景，确认工具栏显示"🔍 联网搜索"
3. 选择"研究分析"场景，确认工具栏显示"🔍 联网搜索"和"📄 网页提取"
4. 发送消息"搜索今天的AI新闻"，确认 Claude 调用 anysearch 工具并返回结果
5. 发送消息"提取 https://en.wikipedia.org/wiki/Claude 的内容"，确认提取成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(RQ-028/T6): verify and cleanup xueqiu references"
```

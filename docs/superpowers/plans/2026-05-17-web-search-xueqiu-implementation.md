# RQ-024：联网搜索功能（xueqiu-mcp 真实化） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 6 mock tools with 3 real tools backed by xueqiu-mcp, enabling live stock data queries.

**Architecture:** Vite dev server middleware spawns xueqiu-mcp as a child process communicating via stdio JSON-RPC. Frontend `agentService.ts` calls `/api/xueqiu/:tool` HTTP endpoints, which the middleware translates to MCP protocol calls and returns results.

**Tech Stack:** Vite server middleware (Node.js child_process), xueqiu-mcp@1.1.1 (stdio transport), existing React/Zustand stack

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `context-lab/server/xueqiu-proxy.ts` | Create | Vite middleware: manage xueqiu-mcp subprocess, translate HTTP→MCP JSON-RPC |
| `context-lab/vite.config.ts` | Modify | Register xueqiu-proxy middleware |
| `context-lab/src/services/agentService.ts` | Modify | Replace 6 mock toolDefinitions with 3 real ones; replace mock executeTool with fetch calls |
| `context-lab/src/stores/appStore.ts` | Modify | Update AVAILABLE_TOOLS (6→3), update DEFAULT_SCENES, add compatibility handling |

No other files need changes — `ToolSelector.tsx` and `ToolSelectorBar.tsx` render dynamically from `availableTools` and require no modifications.

---

### Task 1: Create xueqiu-proxy Vite Middleware

**Files:**
- Create: `context-lab/server/xueqiu-proxy.ts`

This is the core bridge. It manages a xueqiu-mcp child process via stdio and exposes HTTP endpoints.

- [ ] **Step 1: Create the xueqiu-proxy middleware**

```ts
// context-lab/server/xueqiu-proxy.ts
import type { Connect } from 'vite';
import { spawn, ChildProcess } from 'child_process';

let mcpProcess: ChildProcess | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
let buffer = '';

const TOOL_MAP: Record<string, string> = {
  search_stock: 'search_stock',
  get_stock: 'get_stock',
  get_market_index: 'get_market_index',
};

function ensureProcess(): ChildProcess {
  if (mcpProcess && !mcpProcess.killed) return mcpProcess;

  mcpProcess = spawn('npx', ['xueqiu-mcp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  mcpProcess.stdout!.on('data', (data: Buffer) => {
    buffer += data.toString();
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + contentLength) break;
      const body = buffer.slice(bodyStart, bodyStart + contentLength);
      buffer = buffer.slice(bodyStart + contentLength);
      try {
        const msg = JSON.parse(body);
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message || 'MCP error'));
          else pending.resolve(msg.result);
        }
      } catch {}
    }
  });

  mcpProcess.stderr!.on('data', (data: Buffer) => {
    console.error('[xueqiu-mcp stderr]', data.toString());
  });

  mcpProcess.on('exit', () => { mcpProcess = null; });

  // Initialize: send tools/list to verify process works
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'context-lab', version: '1.0.0' },
  }).then(() => {
    sendRequest('notifications/initialized', {});
  }).catch((err) => {
    console.error('[xueqiu-mcp] init failed:', err.message);
  });

  return mcpProcess;
}

function sendRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = ensureProcess();
    const id = ++requestId;
    const msg = { jsonrpc: '2.0', id, method, params: params || {} };
    const body = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('MCP request timeout (10s)'));
    }, 10000);
    pendingRequests.set(id, { resolve, reject, timer });
    proc.stdin!.write(frame);
  });
}

function cleanup() {
  if (mcpProcess && !mcpProcess.killed) {
    mcpProcess.kill();
    mcpProcess = null;
  }
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Process cleanup'));
  }
  pendingRequests.clear();
}

// Auto-cleanup after 5 minutes idle
let idleTimer: NodeJS.Timeout | null = null;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { cleanup(); idleTimer = null; }, 5 * 60 * 1000);
}

export function xueqiuProxyMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (!req.url?.startsWith('/api/xueqiu/')) return next();

    const toolName = req.url.replace('/api/xueqiu/', '').replace(/\?.*$/, '');
    if (!TOOL_MAP[toolName]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
      return;
    }

    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', async () => {
      try {
        let params: any = {};
        if (body) {
          try { params = JSON.parse(body); } catch { params = {}; }
        }
        resetIdleTimer();
        const result = await sendRequest('tools/call', {
          name: toolName,
          arguments: params,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        const isStartup = err.message?.includes('MCP request timeout') || err.message?.includes('Process cleanup');
        const message = isStartup
          ? '数据服务暂时不可用，请稍后重试'
          : `数据服务启动失败，请检查 xueqiu-mcp 是否安装: ${err.message}`;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add server/xueqiu-proxy.ts && git commit -m "feat(RQ-024): add xueqiu-mcp proxy middleware"
```

---

### Task 2: Register Middleware in vite.config.ts

**Files:**
- Modify: `context-lab/vite.config.ts`

- [ ] **Step 1: Update vite.config.ts to register the middleware**

```ts
// context-lab/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { xueqiuProxyMiddleware } from './server/xueqiu-proxy'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'xueqiu-proxy',
      configureServer(server) {
        server.middlewares.use(xueqiuProxyMiddleware());
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

- [ ] **Step 2: Verify dev server starts without errors**

Run: `cd context-lab && npm run dev`
Expected: Server starts on port 5173, no errors in console

- [ ] **Step 3: Verify proxy endpoint responds**

Run: `curl -s -X POST http://localhost:5173/api/xueqiu/search_stock -H "Content-Type: application/json" -d '{"query":"茅台"}'`
Expected: JSON response with search results (may take a few seconds on first call due to subprocess startup)

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add vite.config.ts && git commit -m "feat(RQ-024): register xueqiu proxy middleware in Vite"
```

---

### Task 3: Replace Tool Definitions in agentService.ts

**Files:**
- Modify: `context-lab/src/services/agentService.ts:112-264`

Replace 6 mock toolDefinitions with 3 real ones, and replace mock executeTool with real fetch calls.

- [ ] **Step 1: Replace toolDefinitions (lines 112-188)**

Replace the entire `toolDefinitions` block with:

```ts
  private toolDefinitions: Record<string, ClaudeTool> = {
    'xueqiu-search': {
      name: 'xueqiu-search',
      description: '在雪球上搜索股票，返回匹配的股票列表（代码、名称、市场类型）。当不确定具体股票代码时使用',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，如 腾讯、茅台、AAPL' }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    'xueqiu-quote': {
      name: 'xueqiu-quote',
      description: '查询单只股票详细数据，包括：实时价格、涨跌幅、成交量/额、市值、市盈率等。支持传入名称或代码',
      input_schema: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: '股票名称或代码，如 腾讯、SH600519、AAPL' }
        },
        required: ['symbol'],
        additionalProperties: false
      }
    },
    'xueqiu-market': {
      name: 'xueqiu-market',
      description: '查询大盘指数行情（价格、涨跌额、涨跌幅），支持A股、美股、港股',
      input_schema: {
        type: 'object',
        properties: {
          market: { type: 'string', enum: ['cn', 'us', 'hk'], description: '市场: cn=A股, us=美股, hk=港股' }
        },
        required: ['market'],
        additionalProperties: false
      }
    }
  };
```

- [ ] **Step 2: Replace executeTool (lines 195-264)**

Replace the entire `executeTool` method with:

```ts
  private async executeTool(toolName: string, params: any): Promise<string> {
    console.log(`Executing tool: ${toolName} with params:`, params);

    const endpointMap: Record<string, string> = {
      'xueqiu-search': 'search_stock',
      'xueqiu-quote': 'get_stock',
      'xueqiu-market': 'get_market_index',
    };

    const endpoint = endpointMap[toolName];
    if (!endpoint) {
      return JSON.stringify({ error: 'Unknown tool', tool: toolName });
    }

    try {
      const response = await fetch(`/api/xueqiu/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        return JSON.stringify({ error: data.error || `HTTP ${response.status}` });
      }

      // MCP returns { content: [{ type: "text", text: "..." }] }
      if (data.content && Array.isArray(data.content)) {
        const texts = data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        return texts.join('\n');
      }

      return JSON.stringify(data);
    } catch (err: any) {
      console.error(`Tool execution error: ${toolName}`, err);
      return JSON.stringify({ error: '搜索服务暂时不可用，请稍后重试' });
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add src/services/agentService.ts && git commit -m "feat(RQ-024): replace mock tools with real xueqiu-mcp fetch calls"
```

---

### Task 4: Update AVAILABLE_TOOLS and DEFAULT_SCENES in appStore.ts

**Files:**
- Modify: `context-lab/src/stores/appStore.ts:107-149`

- [ ] **Step 1: Replace AVAILABLE_TOOLS (lines 142-149)**

Replace the 6-item array with:

```ts
const AVAILABLE_TOOLS = [
  { id: 'xueqiu-search', name: '📈 雪球搜索', description: '在雪球上搜索股票、基金、投资信息', icon: '📈' },
  { id: 'xueqiu-quote', name: '💰 股票行情', description: '获取实时股票行情、涨跌幅、成交量等信息', icon: '💰' },
  { id: 'xueqiu-market', name: '🌐 大盘指数', description: '查询A股、美股、港股大盘指数行情', icon: '🌐' },
];
```

- [ ] **Step 2: Update DEFAULT_SCENES (lines 107-140)**

Replace the `research` scene's tools (it referenced deleted `akshare-data`):

```ts
  {
    id: 'research',
    name: '投资研究',
    icon: '📊',
    systemPrompt: '你是一个专业的投资研究助手，帮助用户分析股票、市场和投资机会。可以使用雪球搜索和行情工具。',
    tools: ['xueqiu-search', 'xueqiu-quote', 'xueqiu-market'],
    isPreset: true,
  },
```

The `restaurant` scene already uses `['xueqiu-search', 'xueqiu-quote']` which are still valid — no change needed.

- [ ] **Step 3: Add compatibility handling in toggleTool**

Find the `toggleTool` action and verify it already handles missing tools gracefully. It should just skip unknown IDs since `availableTools.find(t => t.id === toolId)` won't match. No code change needed if it already works this way — just verify.

Read the current `toggleTool` implementation and confirm no hard crash occurs when `selectedTools` contains a deleted tool ID like `'akshare-data'`.

- [ ] **Step 4: Add compatibility for scene loading with deleted tools**

In the `setScene` action (or wherever `selectedTools` is set from scene config), add a filter to remove unknown tool IDs. Find the line that sets `selectedTools` from scene config and wrap it:

```ts
// Filter out tool IDs that no longer exist in availableTools
const validTools = scene.tools.filter(tid =>
  get().availableTools.some(t => t.id === tid)
);
set({ selectedTools: validTools, ... });
```

Also add the same filter in `loadScenesFromStorage` to handle custom scenes referencing deleted tools.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd context-lab && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-024): update tool list to 3 real tools, add deleted-tool compatibility"
```

---

### Task 5: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `cd context-lab && npm run dev`

- [ ] **Step 2: Verify tool selector shows 3 tools**

Open `http://localhost:5173` in browser. Click the tool selector. Expected: 3 tools visible (📈 雪球搜索, 💰 股票行情, 🌐 大盘指数). No mention of news/chart/akshare.

- [ ] **Step 3: Verify xueqiu-search works end-to-end**

1. Select "📈 雪球搜索" tool
2. Type "茅台" and send
3. Expected: Claude calls `xueqiu-search` with `{"query":"茅台"}`, receives real stock search results

- [ ] **Step 4: Verify xueqiu-quote works end-to-end**

1. Also select "💰 股票行情" tool
2. Ask "贵州茅台的最新行情"
3. Expected: Claude calls `xueqiu-quote` with `{"symbol":"SH600519"}`, receives real quote data

- [ ] **Step 5: Verify xueqiu-market works end-to-end**

1. Also select "🌐 大盘指数" tool
2. Ask "今天A股大盘怎么样"
3. Expected: Claude calls `xueqiu-market` with `{"market":"cn"}`, receives real index data

- [ ] **Step 6: Verify error handling**

1. Stop the dev server, then restart it
2. Immediately send a tool-requiring message before xueqiu-mcp subprocess is ready
3. Expected: Graceful error message, no crash

- [ ] **Step 7: Verify old scene compatibility**

1. In browser DevTools localStorage, set a custom scene referencing deleted tool `akshare-data`
2. Reload the page and select that scene
3. Expected: Only valid tools (xueqiu-search, xueqiu-quote, xueqiu-market) are selected, no crash

- [ ] **Step 8: Final commit if any fixes were needed**

---

## Self-Review Checklist

**Spec coverage:**
- [x] Delete 4 tools (xueqiu-news, tradingview-chart, akshare-data, akshare-indicator) → Task 3, 4
- [x] Keep xueqiu-search → Task 3 (redefined schema)
- [x] Keep xueqiu-quote → Task 3 (redefined schema)
- [x] Add xueqiu-market → Task 3 (new tool)
- [x] Vite proxy middleware → Task 1, 2
- [x] MCP subprocess management (lazy start, reuse, 5-min timeout, crash restart) → Task 1
- [x] agentService executeTool → real fetch → Task 3
- [x] AVAILABLE_TOOLS update → Task 4
- [x] Scene compatibility → Task 4
- [x] Error handling (timeout, startup failure, unknown tool) → Task 1, 3
- [x] No mock fallback → Task 3 (pure fetch, no fallback)

**Placeholder scan:** No TBD/TODO/fill-in-later found. All code is complete.

**Type consistency:** `toolDefinitions` keys match `AVAILABLE_TOOLS` IDs match `endpointMap` keys. `xueqiu-search`, `xueqiu-quote`, `xueqiu-market` used consistently across all files.

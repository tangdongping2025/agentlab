# RQ-027 对话打字机效果（流式输出）+ 工具调用内存溢出修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 API 调用改为流式输出实现打字机效果，同时修复工具调用场景下的内存溢出问题（进程管理、数据截断、工具失败策略）。

**Architecture:** sendMessage 改为 `stream: true` + SSE 逐事件解析；xueqiu-proxy 从 npx spawn 改为 node 直接执行入口；conversationHistory 和 store 数据在各写入点截断控制体积；工具失败发回大模型处理并加连续失败安全阀。

**Tech Stack:** React 18 + TypeScript + fetch ReadableStream API + SSE parsing + child_process spawn

---

### Task 1: 安装 xueqiu-mcp 为本地依赖 + 修复 xueqiu-proxy 进程管理

**Files:**
- Modify: `context-lab/server/xueqiu-proxy.ts`
- Modify: `context-lab/package.json`（添加 xueqiu-mcp 依赖）

- [ ] **Step 1: 安装 xueqiu-mcp 为 dependencies**

```bash
cd context-lab
npm install xueqiu-mcp
```

- [ ] **Step 2: 重写 xueqiu-proxy.ts 的 spawnProcess 函数**

将 `spawn('npx', ['xueqiu-mcp'], { shell: true })` 改为直接用 node 执行 xueqiu-mcp 入口文件。完整替换 `context-lab/server/xueqiu-proxy.ts`：

```typescript
// context-lab/server/xueqiu-proxy.ts
import type { Connect, ViteDevServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

let mcpProcess: ChildProcess | null = null;
let spawning: Promise<ChildProcess> | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
let buffer = '';

const TOOL_MAP: Record<string, string> = {
  search_stock: 'search_stock',
  get_stock: 'get_stock',
  get_market_index: 'get_market_index',
};

function rejectAllPending(error: Error) {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  pendingRequests.clear();
}

function resolveMcpEntry(): string {
  // 从本项目 node_modules 中查找 xueqiu-mcp 入口
  try {
    const pkgPath = require.resolve('xueqiu-mcp/package.json');
    const pkg = require(pkgPath);
    const binRel = pkg.bin?.['xueqiu-mcp'] || 'dist/index.js';
    return resolve(pkgPath, '..', binRel);
  } catch {
    // 回退到 npx 路径
    return '';
  }
}

function killProcessTree(proc: ChildProcess) {
  if (!proc || proc.killed) return;
  try {
    // Windows: taskkill 杀进程树; Unix: 负 PID 杀进程组
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      process.kill(-proc.pid, 'SIGKILL');
    }
  } catch {
    proc.kill('SIGKILL');
  }
  (proc as any).killed = true;
}

function spawnProcess(): ChildProcess {
  buffer = '';
  const entry = resolveMcpEntry();

  const proc = entry
    ? spawn('node', [entry], { stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn('npx', ['xueqiu-mcp'], { stdio: ['pipe', 'pipe', 'pipe'], shell: true });

  proc.stdout!.on('data', (data: Buffer) => {
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
      } catch (e) {
        console.warn('[xueqiu-mcp] failed to parse response:', e);
      }
    }
  });

  proc.stderr!.on('data', (data: Buffer) => {
    console.error('[xueqiu-mcp stderr]', data.toString());
  });

  proc.on('error', (err) => {
    console.error('[xueqiu-mcp] spawn error:', err.message);
    mcpProcess = null;
    spawning = null;
    rejectAllPending(new Error(`xueqiu-mcp spawn failed: ${err.message}`));
  });

  proc.on('exit', () => {
    mcpProcess = null;
    spawning = null;
    rejectAllPending(new Error('xueqiu-mcp process exited'));
  });

  return proc;
}

async function ensureProcess(): Promise<ChildProcess> {
  if (mcpProcess && !mcpProcess.killed) return mcpProcess;
  if (spawning) return spawning;

  spawning = (async () => {
    const proc = spawnProcess();

    await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'context-lab', version: '1.0.0' },
    });

    const notification = { jsonrpc: '2.0', method: 'notifications/initialized' };
    const body = JSON.stringify(notification);
    const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    try { proc.stdin!.write(frame); } catch {}

    mcpProcess = proc;
    spawning = null;
    return proc;
  })().catch((err) => {
    mcpProcess = null;
    spawning = null;
    if (mcpProcess && !mcpProcess.killed) killProcessTree(mcpProcess);
    throw err;
  });

  return spawning!;
}

async function sendRequest(method: string, params: any): Promise<any> {
  const proc = await ensureProcess();
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const msg = { jsonrpc: '2.0', id, method, params: params || {} };
    const body = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('MCP request timeout (10s)'));
    }, 10000);
    pendingRequests.set(id, { resolve, reject, timer });
    try { proc.stdin!.write(frame); } catch (e) { reject(e); }
  });
}

function cleanup() {
  if (mcpProcess && !mcpProcess.killed) {
    killProcessTree(mcpProcess);
    mcpProcess = null;
  }
  spawning = null;
  rejectAllPending(new Error('Process cleanup'));
}

let idleTimer: NodeJS.Timeout | null = null;
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { cleanup(); idleTimer = null; }, 5 * 60 * 1000);
}

export function xueqiuProxyMiddleware(server?: ViteDevServer): Connect.NextHandleFunction {
  server?.httpServer?.on('close', cleanup);

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
        const msg = err instanceof Error ? err.message : String(err);
        const isStartup = msg.includes('MCP request timeout') || msg.includes('Process cleanup') || msg.includes('exited');
        const message = isStartup
          ? '数据服务暂时不可用，请稍后重试'
          : `数据服务启动失败，请检查 xueqiu-mcp 是否安装: ${msg}`;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
  };
}
```

- [ ] **Step 3: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
cd context-lab
git add server/xueqiu-proxy.ts package.json package-lock.json
git commit -m "feat(RQ-027/T1): fix xueqiu-proxy process management - direct node spawn"
```

---

### Task 2: truncator — 收紧截断阈值 + 新增截断常量

**Files:**
- Modify: `context-lab/src/utils/truncator.ts`

- [ ] **Step 1: 更新 truncator.ts**

将 `MAX_TOOL_RESULT_SIZE` 从 4096 改为 2048，新增 `MAX_API_REQUEST_BODY_SIZE` 常量：

```typescript
export const MAX_TOOL_RESULT_SIZE = 2048;
export const MAX_DISPLAY_RESULT_SIZE = 2048;
export const MAX_API_REQUEST_BODY_SIZE = 4096;

export function truncateResult(text: string, maxSize: number): string {
  if (!text || text.length <= maxSize) return text;
  const half = Math.floor(maxSize / 2) - 20;
  return text.slice(0, half) + `\n...[truncated, ${text.length} chars total]` + text.slice(-half);
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab
git add src/utils/truncator.ts
git commit -m "feat(RQ-027/T2): tighten truncation limits and add request body constant"
```

---

### Task 3: agentService — 工具失败策略 + 连续失败安全阀 + 内存截断

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

- [ ] **Step 1: 添加连续失败追踪变量**

在 `sendMessage` 方法中，找到第 437 行 `const toolsUsedInSession: string[] = [];`，在其后添加：

```typescript
const consecutiveFailures: Map<string, number> = new Map();
```

- [ ] **Step 2: 替换工具结果处理 + 移除 hasToolError 提前退出**

找到第 645-714 行的 `if (hasToolUse && this.useTools) { ... }` 整个块，替换为：

```typescript
if (hasToolUse && this.useTools) {
  const assistantContent: Array<any> = [];
  const toolResults: Array<any> = [];
  let forceExit = false;

  for (const block of contentBlocks) {
    if (block.type === 'text') {
      assistantContent.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      let toolInput = {};
      try {
        toolInput = JSON.parse(block.inputJson || '{}');
      } catch { /* malformed JSON */ }
      assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input: toolInput });

      const toolName = block.name!;
      const toolParams = toolInput;
      const tool = this.toolDefinitions[toolName];
      const toolDescription = tool?.description || '';
      const reasoning = '根据用户查询，我需要调用工具获取最新信息';

      if (this.timelineCallbacks) {
        this.timelineCallbacks.onToolCallDetected(toolName, toolDescription, toolParams, reasoning);
      }

      const toolResult = await this.executeTool(toolName, toolParams, this.abortController?.signal);

      const isError = typeof toolResult === 'string' && toolResult.includes('"error"');

      // 连续失败安全阀
      if (isError) {
        const count = (consecutiveFailures.get(toolName) || 0) + 1;
        consecutiveFailures.set(toolName, count);
        if (count >= 2) {
          forceExit = true;
        }
      } else {
        consecutiveFailures.delete(toolName);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof toolResult === 'string'
          ? truncateResult(toolResult, MAX_TOOL_RESULT_SIZE)
          : truncateResult(JSON.stringify(toolResult), MAX_TOOL_RESULT_SIZE),
        is_error: isError
      });

      if (!toolsUsedInSession.includes(toolName)) {
        toolsUsedInSession.push(toolName);
      }

      if (this.timelineCallbacks) {
        this.timelineCallbacks.onToolResultReady(toolName, toolResult);
      }

      if (this.recordToolInteraction) {
        const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';
        const recentHistory = this.conversationHistory.slice(-4).map(m =>
          `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}`
        );
        const callContext = {
          systemPrompt: (systemPrompt || '').slice(0, 200),
          userQuery: typeof userQuery === 'string' ? userQuery.slice(0, 200) : '',
          recentHistory,
        };
        this.recordToolInteraction('tool-call', toolName, toolDescription, toolParams, callContext, toolResult, reasoning);
      }
    }
  }

  this.conversationHistory.push({ role: 'assistant', content: assistantContent });
  this.conversationHistory.push({ role: 'user', content: toolResults });

  if (forceExit) {
    // 连续失败 2 次，退出循环，拼入提示
    const failedTools = [...consecutiveFailures.entries()].filter(([, c]) => c >= 2).map(([n]) => n);
    finalResponse = fullText || `工具 ${failedTools.join('、')} 连续调用失败，请稍后重试`;
    shouldContinue = false;
  } else {
    shouldContinue = true;
    continue;
  }
}
```

- [ ] **Step 3: 添加 import MAX_API_REQUEST_BODY_SIZE**

在文件顶部第 5 行：

```typescript
import { truncateResult, MAX_TOOL_RESULT_SIZE, MAX_API_REQUEST_BODY_SIZE } from '../utils/truncator';
```

- [ ] **Step 4: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
cd context-lab
git add src/services/agentService.ts
git commit -m "feat(RQ-027/T3): add consecutive failure safety valve and memory truncation"
```

---

### Task 4: appStore — addApiRequest request body 截断

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 添加 import**

在文件顶部的 import 区域，找到 `import { truncateResult, MAX_TOOL_RESULT_SIZE } from '../utils/truncator';`，改为：

```typescript
import { truncateResult, MAX_TOOL_RESULT_SIZE, MAX_API_REQUEST_BODY_SIZE } from '../utils/truncator';
```

- [ ] **Step 2: 截断 addApiRequest 的 request body**

找到第 564-569 行的 `addApiRequest` 实现：

```typescript
addApiRequest: (url, headers, body) => {
  const id = `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  set(state => ({
    apiInteractions: [...state.apiInteractions, { id, timestamp: new Date(), request: { url, headers, body }, response: null }]
  }));
  return id;
},
```

改为：

```typescript
addApiRequest: (url, headers, body) => {
  const id = `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const truncatedBody = body.length > MAX_API_REQUEST_BODY_SIZE ? truncateResult(body, MAX_API_REQUEST_BODY_SIZE) : body;
  set(state => ({
    apiInteractions: [...state.apiInteractions, { id, timestamp: new Date(), request: { url, headers, body: truncatedBody }, response: null }]
  }));
  return id;
},
```

- [ ] **Step 3: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
cd context-lab
git add src/stores/appStore.ts
git commit -m "feat(RQ-027/T4): truncate API request body in store"
```

---

### Task 5: ChatInteraction — 流式输出连接 + 停止按钮适配

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

当前 ChatInteraction 已经有 `onStreamToken`、`onStreamEnd`、`addMessage('assistant', '')` 和 `updateStreamingMessage`/`clearStreamingMessage` 的连接。需要修复的是：streamingText 状态目前没有被实际使用来渲染消息（消息内容是通过 store 的 updateStreamingMessage 写入的），需要清理冗余的 streamingText 状态。

- [ ] **Step 1: 移除冗余的 streamingText 状态**

找到第 23 行：

```typescript
const [streamingText, setStreamingText] = useState('');
```

删除此行。

找到 `onStreamToken` 回调（第 221-231 行）：

```typescript
onStreamToken: (text) => {
  streamBufferRef.current += text;
  if (!streamTimerRef.current) {
    streamTimerRef.current = setInterval(() => {
      if (streamBufferRef.current) {
        setStreamingText(prev => prev + streamBufferRef.current);
        streamBufferRef.current = '';
      }
    }, 50);
  }
},
```

改为直接使用 store 的 updateStreamingMessage：

```typescript
onStreamToken: (text) => {
  streamBufferRef.current += text;
  if (!streamTimerRef.current) {
    streamTimerRef.current = setInterval(() => {
      if (streamBufferRef.current) {
        updateStreamingMessage(streamBufferRef.current);
        streamBufferRef.current = '';
      }
    }, 50);
  }
},
```

找到 `onStreamEnd` 回调（第 232-241 行）：

```typescript
onStreamEnd: () => {
  if (streamTimerRef.current) {
    clearInterval(streamTimerRef.current);
    streamTimerRef.current = null;
  }
  if (streamBufferRef.current) {
    setStreamingText(prev => prev + streamBufferRef.current);
    streamBufferRef.current = '';
  }
},
```

改为：

```typescript
onStreamEnd: () => {
  if (streamTimerRef.current) {
    clearInterval(streamTimerRef.current);
    streamTimerRef.current = null;
  }
  if (streamBufferRef.current) {
    updateStreamingMessage(streamBufferRef.current);
    streamBufferRef.current = '';
  }
  clearStreamingMessage();
},
```

- [ ] **Step 2: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
cd context-lab
git add src/components/ChatInteraction.tsx
git commit -m "feat(RQ-027/T5): fix streaming callbacks to use store directly"
```

---

### Task 6: 构建验证

**Files:**
- All modified files

- [ ] **Step 1: 运行生产构建**

Run: `cd context-lab && npm run build`
Expected: 构建成功

- [ ] **Step 2: 启动 dev server 手动验证**

Run: `cd context-lab && npm run dev`

验证关键路径：
1. 正常发送消息 → 助手回复逐字输出（打字机效果）
2. 带工具调用的消息 → 工具执行过程可见 → 工具结果返回后继续流式输出
3. 工具失败 → 大模型收到错误信息 → 正常回复用户（不直接中断）
4. 工具连续失败 2 次 → 退出循环，提示"工具 X 连续调用失败"
5. 流式中点击停止按钮 → 已输出文字保留
6. 任务管理器中只有一个 node.exe 进程（xueqiu-mcp），不会产生进程链

- [ ] **Step 3: Commit（如有构建修复）**

```bash
cd context-lab
git add -A
git commit -m "fix(RQ-027/T6): fix build issues"
```

// context-lab/server/xueqiu-proxy.ts
import type { Connect, ViteDevServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';

const require = createRequire(import.meta.url);

let mcpProcess: ChildProcess | null = null;
let spawning: Promise<ChildProcess> | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
let buffer = '';
let lastSpawnTime = 0;
let spawnFailCount = 0;

const TOOL_MAP: Record<string, string> = {
  search_stock: 'search_stock',
  get_stock: 'get_stock',
  get_market_index: 'get_market_index',
};

const SPAWN_COOLDOWN_MS = 5000;
const MAX_SPAWN_RETRIES = 3;

function rejectAllPending(error: Error) {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  pendingRequests.clear();
}

function resolveMcpEntry(): string | null {
  try {
    const pkgPath = require.resolve('xueqiu-mcp/package.json');
    const pkg = require(pkgPath);
    const binRel = pkg.bin?.['xueqiu-mcp'] || 'dist/index.js';
    return resolve(dirname(pkgPath), binRel);
  } catch {
    return null;
  }
}

function killProcessTree(proc: ChildProcess) {
  if (!proc || (proc as any).killed) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
    }
  } catch {
    try { proc.kill('SIGKILL'); } catch {}
  }
  (proc as any).killed = true;
}

function spawnProcess(): ChildProcess {
  buffer = '';
  const entry = resolveMcpEntry();

  if (entry) {
    return spawn('node', [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
  }

  // 回退：只在没有本地安装时用 npx，且限制 shell
  return spawn('npx', ['xueqiu-mcp'], { stdio: ['pipe', 'pipe', 'pipe'], shell: true });
}

async function ensureProcess(): Promise<ChildProcess> {
  if (mcpProcess && !(mcpProcess as any).killed) return mcpProcess;
  if (spawning) return spawning;

  // 冷却检查：避免快速重试
  const now = Date.now();
  const elapsed = now - lastSpawnTime;
  if (elapsed < SPAWN_COOLDOWN_MS) {
    throw new Error(`数据服务正在启动中，请 ${Math.ceil((SPAWN_COOLDOWN_MS - elapsed) / 1000)} 秒后重试`);
  }

  // 重试上限
  if (spawnFailCount >= MAX_SPAWN_RETRIES) {
    throw new Error('数据服务启动失败次数过多，请重启开发服务器');
  }

  lastSpawnTime = now;
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
    spawnFailCount = 0; // 成功后重置
    return proc;
  })().catch((err) => {
    mcpProcess = null;
    spawning = null;
    spawnFailCount++;
    if (mcpProcess && !(mcpProcess as any).killed) killProcessTree(mcpProcess);
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
  if (mcpProcess && !(mcpProcess as any).killed) {
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
        const isStartup = msg.includes('MCP request timeout') || msg.includes('Process cleanup') || msg.includes('exited') || msg.includes('正在启动');
        const message = isStartup
          ? '数据服务暂时不可用，请稍后重试'
          : `数据服务启动失败，请检查 xueqiu-mcp 是否安装: ${msg}`;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
  };
}

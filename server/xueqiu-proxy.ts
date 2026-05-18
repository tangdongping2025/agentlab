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
  try {
    const pkgPath = require.resolve('xueqiu-mcp/package.json');
    const pkg = require(pkgPath);
    const binRel = pkg.bin?.['xueqiu-mcp'] || 'dist/index.js';
    return resolve(pkgPath, '..', binRel);
  } catch {
    return '';
  }
}

function killProcessTree(proc: ChildProcess) {
  if (!proc || proc.killed) return;
  try {
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

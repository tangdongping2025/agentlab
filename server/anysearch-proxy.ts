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

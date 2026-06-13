import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { anysearchProxyMiddleware } from './server/anysearch-proxy'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 从 .env 读取 base URL，去掉末尾 /v1/messages 等路径后缀，取 base
  const apiBase = env.VITE_CLAUDE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding';

  return {
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
          target: apiBase,
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
      // 排除残留 worktree 副本（.claude/worktrees/）和后端目录，避免污染测试收集
      exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'backend/**'],
    },
  };
})

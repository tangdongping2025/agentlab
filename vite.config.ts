import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { xueqiuProxyMiddleware } from './server/xueqiu-proxy'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'xueqiu-proxy',
      configureServer(server) {
        server.middlewares.use(xueqiuProxyMiddleware(server));
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

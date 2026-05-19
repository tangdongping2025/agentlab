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

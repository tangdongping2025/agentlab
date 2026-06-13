# === 阶段 1：构建 ===
FROM node:20-alpine AS builder

# 构建参数：API 配置（编译进前端 JS，不留在镜像层中）
ARG VITE_CLAUDE_API_KEY=placeholder
ARG VITE_CLAUDE_BASE_URL=https://api.anthropic.com
ARG VITE_CLAUDE_MODEL=claude-sonnet-4-6
ENV VITE_CLAUDE_API_KEY=$VITE_CLAUDE_API_KEY
ENV VITE_CLAUDE_BASE_URL=$VITE_CLAUDE_BASE_URL
ENV VITE_CLAUDE_MODEL=$VITE_CLAUDE_MODEL

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# === 阶段 2：运行 ===
FROM nginx:alpine

# 把构建产物复制到 nginx 的默认静态文件目录
COPY --from=builder /app/dist /usr/share/nginx/html
# nginx 配置：处理 SPA 路由 + API 反向代理
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

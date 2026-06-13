# === 阶段 1：构建前端 ===
FROM node:20-alpine AS builder

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

# === 阶段 2：安装后端依赖 ===
FROM python:3.12-slim AS backend-deps
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# === 阶段 3：运行（nginx + uvicorn via supervisord） ===
FROM python:3.12-slim

# 装 nginx + supervisor
RUN apt-get update && apt-get install -y --no-install-recommends nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# 拷贝 Python 依赖（从阶段2）
COPY --from=backend-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-deps /usr/local/bin /usr/local/bin

# 前端静态文件
COPY --from=builder /app/dist /usr/share/nginx/html

# 后端代码
COPY backend/ /app/backend/
WORKDIR /app/backend

# 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisor/conf.d/app.conf

# 删除 nginx 默认配置避免冲突
RUN rm -f /etc/nginx/sites-enabled/default

EXPOSE 80
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]

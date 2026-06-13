# MySQL 后端部署

## 架构

单镜像内 supervisord 管理 nginx + uvicorn 两个进程：
- nginx（:80）：托管前端静态文件 + 反代 `/api/anthropic`（LLM）和 `/api/db`（后端）
- uvicorn（:8000）：FastAPI 后端，连 MySQL

```
浏览器 → nginx:80
   /*               → 静态 dist/
   /api/anthropic/* → deepseek
   /api/db/*        → uvicorn:8000 → MySQL
```

## 一次性环境准备

部署容器需按名称访问 MySQL。默认 bridge 网络无 DNS 解析，故建用户自定义网络：

```bash
docker network create appnet
docker network connect appnet my-mysql
```

## 运行 agentlab 容器

用 appnet 网络并注入 DB 凭据。**首次启动必须带上这些 env 和网络**，Watchtower 后续更新镜像时会保留它们：

```bash
docker run -d --name agentlab -p 8080:80 --network appnet \
  -e MYSQL_HOST=my-mysql -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root -e MYSQL_PASSWORD=123456 \
  -e MYSQL_DATABASE=context_lab \
  ghcr.io/tangdongping2025/agentlab:latest
```

后端首次启动自动建库 `context_lab` 和表。

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| MYSQL_HOST | MySQL 主机（容器名或 host.docker.internal） | my-mysql |
| MYSQL_PORT | MySQL 端口 | 3306 |
| MYSQL_USER | 用户名 | root |
| MYSQL_PASSWORD | 密码 | 123456 |
| MYSQL_DATABASE | 数据库名（自动创建） | context_lab |

VITE_ 开头的变量（VITE_CLAUDE_API_KEY 等）仍是构建期 build-arg，在 GitHub Actions secrets 里配置。

## 开发模式

```bash
# 后端
cd backend
.venv\Scripts\activate    # Windows
uvicorn main:app --reload --port 8000

# 前端（另一个终端，vite proxy 自动转发 /api/db → :8000）
npm run dev
```

## 数据迁移

前端首次加载检测到 localStorage 有旧会话且后端可达时，弹确认框，同意后自动迁移到 MySQL 并清空 localStorage。无需手动操作。

## 排查

- 后端起不来：`docker logs agentlab` 看 uvicorn 输出
- 连不上 MySQL：确认容器和 my-mysql 在同一网络（`docker network inspect appnet`），MYSQL_HOST 用容器名
- 数据没存：访问 `/api/db/health` 确认后端在线，检查 MYSQL_PASSWORD

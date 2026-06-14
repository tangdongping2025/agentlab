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
   /api/agents/*    → uvicorn:8000（智能体载体）
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
  -e LLM_API_KEY=sk-xxx -e LLM_BASE_URL=https://api.deepseek.com/anthropic \
  -e LLM_MODEL=claude-sonnet-4-6 \
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
| LLM_API_KEY | 后端 agent 调 LLM 的 key（助手/research agent 用） | sk-xxx |
| LLM_BASE_URL | LLM 端点（Anthropic 兼容，ARK/deepseek/claude 代理） | https://api.deepseek.com/anthropic |
| LLM_MODEL | 模型名 | claude-sonnet-4-6 |
| ANYSEARCH_API_KEY | anysearch 联网搜索 key（可选，research agent 用，空则搜索报错） | （空） |

**注意：LLM_API_KEY 等是后端运行时 env，不是 build-arg**。助手/研究助手 agent 调 LLM 需要它们。不配则 agentRuntime 里的助手/research 调 LLM 失败（echo 不调 LLM 仍工作）。

VITE_ 开头的变量（VITE_CLAUDE_API_KEY 等）仍是构建期 build-arg，在 GitHub Actions secrets 里配置（前端老 chat 界面用）。

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

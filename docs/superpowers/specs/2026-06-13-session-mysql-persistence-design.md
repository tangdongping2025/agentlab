# RQ-029 会话持久化到 MySQL + 历史查询界面 — 规格设计

## 需求概述

将会话记录从浏览器 localStorage 迁移到 MySQL 数据库持久化，自动实时保存，并新增一个全屏历史查询界面（支持关键词搜索 + 时间范围 + 场景 + token 用量筛选）。新增 Python FastAPI 后端，Docker 单镜像部署（nginx + uvicorn via supervisord），不破坏现有 Watchtower 单镜像自动部署链路。

## 现状

- 会话数据全在浏览器 `localStorage`（键 `context-lab.sessions`），由 `sessionService.ts` 做 CRUD
- 无后端服务，前端 fetch 直连 LLM API（经 Vite proxy / nginx 反代）
- 部署：GitHub Actions 构建纯前端单镜像（node 构建 → nginx 托管静态文件 + 反代 `/api/anthropic`），推到 ghcr.io，Watchtower 自动拉取更新
- MySQL：本机 Docker 容器 `my-mysql`（mysql:8.0，端口 3306，root/123456），已有 `a_share` 库与本需求无关

## 关键决策（brainstorming 确认）

| 决策点 | 选择 |
|--------|------|
| 查询能力 | 完整筛选（关键词 + 时间范围 + 场景 + token 用量） |
| 保存时机 | 自动实时保存（每轮对话后/切换会话/关页时） |
| 旧数据 | 迁移现有 localStorage 会话到 MySQL |
| 附件存储 | 全部存数据库（含 base64 图片，存 LONGTEXT/JSON） |
| 架构方案 | 后端完全取代 localStorage，单一数据源 |
| 查询界面位置 | 独立全屏历史页面（header 加入口切换） |
| 部署拓扑 | 单镜像（nginx + uvicorn via supervisord），保持 Watchtower 流程 |

## 目标架构

### 开发时

```
浏览器 → Vite dev :5173
   /api/anthropic/* → (proxy) ARK/deepseek
   /api/anysearch/* → (middleware) anysearch API
   /api/db/*        → (proxy, 新增) FastAPI :8000 → MySQL localhost:3306
```

### 生产（单镜像 supervisord）

```
浏览器 → nginx :80
   /*               → 静态 dist/
   /api/anthropic/* → (proxy) deepseek（保持现状）
   /api/db/*        → (proxy, 新增) uvicorn :8000 → MySQL my-mysql:3306（appnet 网络）
```

两个进程由 supervisord 管理：nginx（:80）+ uvicorn（:8000）。

## 后端结构（`backend/`）

```
backend/
├── main.py            # FastAPI app，路由挂载在 /api/db，启动时建库建表
├── config.py          # pydantic-settings 读 env
├── database.py        # SQLAlchemy 引擎 + sessionmaker
├── models.py          # Session / Message ORM 模型
├── schemas.py         # Pydantic 请求/响应模型
├── routers/
│   ├── sessions.py    # 会话 CRUD + 查询
│   └── migrate.py     # 一次性批量导入
├── requirements.txt   # fastapi, uvicorn[standard], sqlalchemy, pymysql, pydantic-settings
└── .env.example
```

## 库表设计

新建库 `context_lab`（后端启动时自动创建），两张表：

### `sessions`（会话元数据）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) PK | 复用现有 session UUID |
| name | VARCHAR(255) | 会话名 |
| scene_id | VARCHAR(64) | 场景 ID |
| system_prompt | MEDIUMTEXT | 系统提示词 |
| selected_tools | JSON | 工具 ID 数组 |
| context_strategy | VARCHAR(16) | sliding/full/summary/none |
| context_size | BIGINT | 上下文窗口大小 |
| total_tokens | BIGINT | 会话累计 token 用量（冗余列，加速筛选；保存时累加） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间（索引） |

### `messages`（消息明细，拆表以支持搜索）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 自增主键 |
| session_id | VARCHAR(36) FK | → sessions.id，ON DELETE CASCADE |
| seq | INT | 会话内顺序 |
| role | VARCHAR(16) | user / assistant |
| content | LONGTEXT | 纯文本消息内容（供全文搜索） |
| payload | JSON | 完整消息：tokenUsage / toolsUsed / thinkingContent / files(含 base64) 等 |
| created_at | DATETIME | 创建时间 |

索引：`(session_id, seq)`、`content` 上 FULLTEXT（MySQL 8 ngram 分词，支持中文关键词）。

**拆表理由**：关键词搜索需要纯文本列 + 全文索引；列表会话时不必加载整个大 JSON payload。

## REST API（统一 `/api/db` 前缀）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/sessions` | 创建会话 |
| GET | `/sessions` | 列表（参数：`q`=关键词, `scene`=, `from`=, `to`=, `min_token`=, `max_token`=, `page`=, `size`=） |
| GET | `/sessions/{id}` | 取详情（含 messages） |
| PUT | `/sessions/{id}` | 更新（messages + 配置） |
| DELETE | `/sessions/{id}` | 删除一个 |
| DELETE | `/sessions` | 全删 |
| POST | `/migrate` | 批量导入（接收 localStorage dump） |

查询筛选实现：
- 关键词 `q` → `MATCH(content) AGAINST(? IN BOOLEAN MODE)` 跨 messages 表，命中则返回所属 session
- 时间范围（`from`/`to`）→ sessions.`created_at` 过滤
- 场景（`scene`）→ sessions.`scene_id` 过滤
- token 范围（`min_token`/`max_token`）→ sessions.`total_tokens` 过滤

## 前端改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/dbApi.ts` | 新建 | 所有 `/api/db` 调用封装 |
| `src/services/sessionService.ts` | 重写 | localStorage → dbApi；方法签名保持不变，store 几乎不动 |
| `src/components/HistoryPage.tsx` | 新建 | 全屏查询页：筛选条 + 结果列表 + 详情面板 |
| `src/App.tsx` | 修改 | 加视图状态 `chat`/`history`，header 加「历史」按钮切换 |
| `vite.config.ts` | 修改 | 加 proxy `/api/db` → `http://localhost:8000` |

`sessionService` 异步化：现有方法是同步的（localStorage），改 DB 后为异步。store 调用处需相应加 `await`（`loadSessions`/`saveCurrentSession`/`createSession` 等已是 async 或在 effect 中调用）。

## 迁移流程

前端首次加载检测：localStorage 有会话（`context-lab.sessions`）且后端可达 → 弹确认框 → 同意后把会话数组 POST 到 `/api/db/migrate`（后端批量插入，按 id 去重）→ 清空 localStorage 键。迁移有进度反馈，失败可重试。

## Dockerfile（方案 B，三阶段）

```
阶段1: node:20-alpine → 构建 dist/（不变）
阶段2: python:3.12-slim → pip install backend/requirements.txt
阶段3: python:3.12-slim（最终镜像）
  - apt-get install nginx
  - 复制 dist → /usr/share/nginx/html
  - 复制 backend → /app/backend
  - 复制 supervisord.conf、nginx.conf
  - CMD ["supervisord","-c","/etc/supervisord.conf"]
```

最终镜像用 `python:3.12-slim` 做底（而非 nginx:alpine 装 python），因 Python 依赖在 debian-slim 上比 alpine 稳。supervisord 同时拉起 nginx 和 uvicorn。

## nginx.conf 改动

新增一条 location（保留现有静态 + `/api/anthropic` 反代）：

```nginx
location /api/db/ {
    proxy_pass http://127.0.0.1:8000/api/db/;
    proxy_set_header Host $host;
}
```

## deploy.yml 改动

**几乎不改**：
- VITE_ key 仍为 build-arg（烤进前端 JS）
- 后端依赖在镜像内 pip 安装（无 secrets）
- MySQL 凭据是运行时 env（不进构建上下文）

CI 流程完全不变，Dockerfile 多阶段构建自行处理前后端。现有 `build-args` 保持。

## 运行时一次性部署步骤（写进 README，非 CI）

当前 `my-mysql` 和 agentlab 都在默认 `bridge` 网络，**默认 bridge 无 DNS 名称解析**，故需新建用户自定义网络：

```bash
docker network create appnet
docker network connect appnet my-mysql
# 重建 agentlab 容器，接入 appnet 并注入 DB env
docker run -d --name agentlab -p 8080:80 --network appnet \
  -e MYSQL_HOST=my-mysql -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root -e MYSQL_PASSWORD=123456 \
  -e MYSQL_DATABASE=context_lab \
  ghcr.io/tangdongping2025/agentlab:latest
```

后端启动时自动建 `context_lab` 库和表。Watchtower 后续更新会保留首次启动的 env 与网络配置。

## 文件改动总览

| 文件 | 操作 |
|------|------|
| `backend/**` | 新建（整个后端目录） |
| `Dockerfile` | 修改（三阶段 + supervisor） |
| `nginx.conf` | 修改（加 `/api/db` 反代） |
| `supervisord.conf` | 新建 |
| `.dockerignore` | 修改（排除 backend 虚拟环境等） |
| `src/services/dbApi.ts` | 新建 |
| `src/services/sessionService.ts` | 重写 |
| `src/components/HistoryPage.tsx` | 新建 |
| `src/App.tsx` | 修改（视图切换 + header 按钮） |
| `vite.config.ts` | 修改（加 `/api/db` proxy） |
| `README` / 部署文档 | 新增运行时部署步骤 |

## 沿用现有机制

- `Session`/`Message` 类型定义不变（`src/types/index.ts`）
- store 的会话操作流（create/switch/delete/save）结构不变，仅底层数据源换
- 前端会话渲染组件（SessionList / MessageList / MessageBubble）不变
- Header 现有按钮交互风格，新增「历史」按钮遵循同款

## 设计理念合规检查

| 原则 | 检查 |
|------|------|
| 极简 | 后端取代 localStorage，单一数据源，无双写复杂度 |
| 专注 | 后端只管会话持久化 + 查询，不混入 LLM 调用 |
| 直觉 | 自动保存无需用户操心；历史页独立全屏，筛选空间充足 |
| 一致性 | 复用现有 Vite proxy + nginx 反代模式，`/api/db` 与 `/api/anthropic` 同构 |
| 工匠精神 | Docker 单镜像保持 Watchtower 链路不变；新建独立库 `context_lab` 不污染 `a_share` |

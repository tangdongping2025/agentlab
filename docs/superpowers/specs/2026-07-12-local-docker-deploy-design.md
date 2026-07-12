# 本地 Docker 全栈部署 + invest_agent ML 验证 设计

> 日期:2026-07-12
> 关联:验证 RQ-C 系列(2026-07-11~12 的 ML 选股工作)

## 1. 背景与问题

昨天(2026-07-11~12)完成 RQ-C 系列:给 `invest_agent` 加了 ML 选股(`ml_ridge` / `ml_lightgbm`)+ 回测 IC 评估 + 前端候选池/回测面板。但端到端从未验证——平台没有在本地完整 Docker 化跑起来,且 MySQL 数据底座空(`stock_daily` / `fundamental_pit` / `index_constituent` 三张表无数据),跑候选池/回测直接返回 409。

现有部署资产是**生产向单镜像**(`Dockerfile`:nginx+uvicorn via supervisord)+ `docker-compose.prod.yml`(mysql + app + watchtower),没有面向本地一键启动的方案。

## 2. 目标与非目标

**目标**:
1. 四容器分离部署(mysql / backend / frontend / nginx 网关),一键 `docker compose up`
2. 所有 Docker 数据落 **D 盘**(用户磁盘约束:C 盘小)
3. 合成数据 fixture 灌入三张业务表,让 ML 候选池/回测/IC 端到端可跑、可验证
4. 三条验证路径都通:前端 UI(候选池/回测/IC 面板)+ 后端 API + pytest 自包含测试

**非目标**(YAGNI):
- 不抓真实沪深300 数据(`tushare` token 留口子,本阶段用合成数据)
- 不改生产 `Dockerfile` / `docker-compose.prod.yml`(本地独立一套,不污染生产)
- 不做前端热重载(用构建好的 dist)
- 不装 agent 辅助依赖(pandoc / 高德 MCP / nodejs)——ML 验证不需要,完整 agent 对话功能后续再补

## 3. 架构(四容器)

```
              ┌──────────────┐
  浏览器 ───→ │  nginx 网关   │   宿主 8080:80
              │  (gateway)   │
              └─┬──────────┬─┘
          /api/*│          │ /(SPA)
                ▼          ▼
          ┌──────────┐  ┌───────────┐
          │ backend  │  │ frontend  │
          │ uvicorn  │  │ nginx+dist│
          │  :8000   │  │   :80     │
          └────┬─────┘  └───────────┘
               ▼
          ┌──────────┐
          │  mysql   │   宿主 3306:3306
          │  :3306   │   数据 → D 盘
          └──────────┘
```

**职责**:
- **mysql**:MySQL 8.0,数据 bind mount → `D:\docker-data\agentlab\mysql\`
- **backend**:`python:3.12-slim` + uvicorn(:8000),FastAPI + ML 依赖
- **frontend**:多阶段 `node:20` 构 dist → `nginx:alpine` 服 SPA(:80)
- **nginx 网关**:统一入口,反代 `/api/*` → backend、`/` → frontend

## 4. 镜像拆分(从现有 Dockerfile 三阶段拆)

### `Dockerfile.backend`(新增)
- 基础 `python:3.12-slim`
- `pip install -r requirements.txt`(阿里云源,沿用现有做法)
- 拷 `backend/` 代码,WORKDIR `/app/backend`
- **不装** nginx/supervisor/nodejs/npm/pandoc/高德 MCP(单进程 uvicorn,无需 supervisor;ML 验证不需要 agent 辅助依赖)
- `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`(不带 `--reload`,Docker 内无 Windows 的 SelectorEventLoop 坑)

### `Dockerfile.frontend`(新增,多阶段)
- 阶段 1:`node:20-alpine`,`npm ci`(npmmirror 源),沿用 `VITE_CLAUDE_*` ARG(placeholder 默认,不影响 ML),`npm run build` → dist
- 阶段 2:`nginx:alpine`,拷 dist → `/usr/share/nginx/html`,拷 `frontend.conf`(带 `try_files` SPA 兜底)
- `EXPOSE 80`,`CMD ["nginx", "-g", "daemon off;"]`

### 网关 nginx(无单独 Dockerfile)
- 官方 `nginx:alpine` 镜像 + volume 挂 `gateway.conf` → `/etc/nginx/conf.d/default.conf`

### mysql
- 官方 `mysql:8.0`

## 5. `docker-compose.local.yml`(新增)

| 服务 | 构建/镜像 | 端口 | 关键 |
|---|---|---|---|
| mysql | `mysql:8.0` | `3306:3306` | bind mount `D:\docker-data\agentlab\mysql\` → `/var/lib/mysql`;healthcheck `mysqladmin ping` |
| backend | build `Dockerfile.backend` | 内部 8000 | `env_file: backend/.env`;`depends_on: mysql (service_healthy)` |
| frontend | build `Dockerfile.frontend` | 内部 80 | — |
| nginx | `nginx:alpine` + 挂 `gateway.conf` | `8080:80` | `depends_on: [backend, frontend]` |

- 不含 watchtower(本地无意义)
- 自定义 bridge 网络 `appnet`,四容器同网,容器名互访

## 6. 网关路由 `gateway.conf`(新增,基于现有 `nginx.conf` 改)

改造点(gzip 等保留):
- `location /` → `proxy_pass http://frontend:80;`(dist 在 frontend 容器,不再本地 root)
- `location /api/db/` → `proxy_pass http://backend:8000/api/db/;`
- `location /api/settings` → `proxy_pass http://backend:8000;`
- `location /api/agents` → `proxy_pass http://backend:8000;`(保留 `proxy_read_timeout 600s` 等 SSE 配置)
- `location /api/anthropic/` → 保留(deepseek 外部 LLM;ML 验证非必需,留着不影响)

`frontend.conf`(前端容器内,新增):
- `listen 80`、`location /` → `root /usr/share/nginx/html; try_files $uri $uri/ /index.html;`

## 7. 依赖修补

`backend/requirements.txt` 补两行:
- `pandas>=2.0`——ML 必需,显式声明(当前靠 sklearn 传递依赖,脆弱)
- `tushare>=1.4`——留口子,以后抓真实数据用;合成数据验证不依赖,但补上免得以后 `import tushare` 崩

## 8. 合成数据 fixture(新增 `backend/scripts/seed_synthetic_data.py`)

**目的**:让 ML 候选池/回测/IC 在本地无 tushare 也能端到端跑通。

- **范围**:约 30 只股票(伪造 ts_code)× 约 3 年(约 750 个交易日)
- **`stock_daily`**:`ts_code` / `trade_date` / `open` / `high` / `low` / `close` / `vol` / `amount` / `pct_chg` 等(价格走 random walk)
- **`fundamental_pit`**:`ts_code` / `end_date` + PE / ROE / 毛利率 / 负债率 / 市值 等(带 PIT 时间戳,每股每季度一条)
- **`index_constituent`**:`ts_code` / `index_code` / 权重(30 股属"沪深300 仿制")
- **ML 约束**(以 `ml_strategy.py` 实际字段/参数为准,实现时对齐 `models.py`):
  - 6 因子字段齐全(动量来自 close、PE、ROE、毛利率、负债率、市值)
  - ≥ 12 个月度调仓期(满足 `min_train=12`)
  - close 序列能算出 `fwd_ret` 标签
  - 基本面 `end_date` 严格 PIT 对齐(顺带验证最新 critical-fix 的 future-label leak 修复)
- **分布**:随机但跨股有差异,确保 ML 跑出**非空 IC**
- **幂等**:每次先 TRUNCATE 三表再灌,可重复执行
- **触发**:`docker exec -it <backend> python scripts/seed_synthetic_data.py`

> 注:合成数据的 IC 数值无现实意义,只证明链路通,不证明策略有效——这点会明确告知。

## 9. 环境配置 `backend/.env`(新增 `.env.example`)

**最小必填**(ML 验证):
```
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=context_lab
```
**可选占位**(不影响 ML,留空即可):`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` / `TUSHARE_TOKEN` / `ANTHROPIC_*` / `AMAP_MAPS_API_KEY`

## 10. 启动与验证流程

```
0. (一次性)Docker Desktop → Settings → Resources → Disk image location → D:\docker-data\
1. cp backend/.env.example backend/.env   (按需填,默认值即可跑 ML)
2. docker compose -f docker-compose.local.yml up -d --build
3. 等 mysql healthy + backend 起(create_tables 自动建库建表)
4. docker exec -it <backend> python scripts/seed_synthetic_data.py
5. 三路验证:
   a. docker exec <backend> pytest tests/test_ml_strategy.py tests/test_backtest.py -v
   b. API:POST /api/db/candidates/run  body={"strategy":"ml_ridge"} → 非 409、返回候选
   c. UI:localhost:8080 → 选「投资助手」agent → 候选池/回测 tab → Ridge/LightGBM → 看 IC 面板
```

## 11. 文件清单

**新增**:
- `docker-compose.local.yml`
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `nginx/gateway.conf`
- `nginx/frontend.conf`
- `backend/scripts/seed_synthetic_data.py`
- `backend/.env.example`

**改**:
- `backend/requirements.txt`(+`pandas`, +`tushare`)

**不动**(生产配置不污染):
- `Dockerfile` / `docker-compose.prod.yml` / `supervisord.conf`
- `nginx.conf`(保留给生产单镜像)

## 12. 风险与回滚

- 合成数据 IC 无现实意义(只证链路通)——明确告知用户
- seed 脚本字段若与 `models.py` 不一致 → 运行时报错,按 `models.py` 修正(实现时 TDD 对齐)
- 回滚:`docker compose -f docker-compose.local.yml down -v` 删容器和卷,删新增文件

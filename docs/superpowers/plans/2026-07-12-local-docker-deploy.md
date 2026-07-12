# 本地 Docker 部署 + ML 合成数据验证 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Docker 四容器(mysql / backend / frontend / nginx 网关)在本地一键跑起 agentlab 平台,用合成数据灌底座,端到端验证 invest_agent 的 ML 选股(候选池 / 回测 / IC)。

**Architecture:** 从现有生产 `Dockerfile` 拆出 `Dockerfile.backend` + `Dockerfile.frontend`,网关用官方 `nginx:alpine` + `gateway.conf`,新写 `docker-compose.local.yml` 编排四容器;新增 `seed_synthetic_data.py` 造 ~30 股 × 3 年合成数据灌进三张业务表,让 ML 链路在无 tushare 时也能跑通。

**Tech Stack:** Docker / docker-compose、nginx、`python:3.12-slim`、`node:20`、MySQL 8.0、FastAPI+uvicorn、SQLAlchemy、scikit-learn / lightgbm。

## Global Constraints

- **磁盘**:所有 Docker 数据落 D 盘——Docker Desktop → Settings → Resources → Disk image location 设到 `D:\docker-data\`;MySQL 数据 bind mount 到 `D:\docker-data\agentlab\mysql\`。
- **不污染生产**:不改 `Dockerfile` / `docker-compose.prod.yml` / `supervisord.conf` / `nginx.conf`。
- **三张业务表字段**(注意是 `code` 不是 `ts_code`):
  - `stock_daily(code, trade_date, close, adj_factor, pe_ttm, total_mv)` —— 主键 (code, trade_date)
  - `fundamental_pit(code, end_date, ann_date, roe, grossprofit_margin, debt_to_assets)` —— 主键 (code, end_date, ann_date)
  - `index_constituent(index_code, trade_date, code, weight)` —— 主键 (index_code, trade_date, code)
- `index_code` 固定 `"000300.SH"`;`_load_panel` 读成分用 `trade_date <= end`,只需一个 ≤ 最早调仓日的快照。
- ML 约束:`ml_start` 默认 `"20200101"`、`min_train=12`、`factors=[momentum, pe, roe, grossprofit_margin, debt_to_assets, total_mv]`、momentum window=252、月度调仓。
- 镜像源沿用现有 Dockerfile:pip 用阿里云(`mirrors.aliyun.com/pypi/simple`),npm 用 npmmirror(`registry.npmmirror.com`)。
- 每个业务表 `code` 用 `600000+i.SHE` 形式伪造(`{600000+i:06d}.SH`)。

---

### Task 1: 补依赖 + `.env` 模板

**Files:**
- Modify: `backend/requirements.txt`(追加 2 行)
- Create: `backend/.env.example`

**Interfaces:**
- Produces: `backend/.env.example`(Task 6 compose 的 `env_file` 引用);requirements 含 `pandas`/`tushare`(Task 3 backend 镜像 pip install 时装入)

- [ ] **Step 1: 给 requirements.txt 追加 pandas / tushare**

在 `backend/requirements.txt` 末尾追加:
```
pandas>=2.0.0
tushare>=1.4.0
```

- [ ] **Step 2: 创建 `backend/.env.example`**

完整内容:
```
# === MySQL(ML 验证必填)===
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=context_lab

# === LLM(agent 对话用,ML 验证可空)===
LLM_API_KEY=
LLM_BASE_URL=https://open.bigmodel.cn/api/anthropic
LLM_MODEL=claude-sonnet-4-6

# === tushare(抓真实数据用,合成数据验证可空)===
TUSHARE_TOKEN=

# === Claude Agent SDK(agent 用,ML 验证可空)===
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

# === 高德 MCP(地图工具,可空)===
AMAP_MAPS_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt backend/.env.example
git commit -m "deps: 补 pandas/tushare + .env.example(本地 Docker 部署准备)"
```

---

### Task 2: 合成数据脚本 `seed_synthetic_data.py`(TDD 核心)

**Files:**
- Create: `backend/scripts/seed_synthetic_data.py`
- Test: `backend/tests/test_seed_synthetic_data.py`

**Interfaces:**
- Consumes: `models.StockDailyModel` / `FundamentalPitModel` / `IndexConstituentModel`(已有);`database.SessionLocal`(已有,`__main__` 入口用)
- Produces: `seed_all(db, n_codes=30, years=3, ...) -> dict` —— 幂等灌三表,返回 `{index_constituent, stock_daily, fundamental_pit}` 行数;`__main__` 可 `python scripts/seed_synthetic_data.py` 直接跑

- [ ] **Step 1: 写失败测试 `backend/tests/test_seed_synthetic_data.py`**

完整内容:
```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import Base


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng, tables=[models.StockDailyModel.__table__,
                                          models.FundamentalPitModel.__table__,
                                          models.IndexConstituentModel.__table__])
    S = sessionmaker(bind=eng); db = S(); yield db; db.close()


def test_seed_all_enables_ml_pipeline(db):
    """合成数据让 ML 全链路可跑:build_panel 非空 + ≥12 调仓期 + ML 选出候选。"""
    from seed_synthetic_data import seed_all
    from ml_strategy import _build_panel, clear_panel_cache
    from screener import compute_candidates
    clear_panel_cache()
    counts = seed_all(db)
    assert counts["stock_daily"] > 0
    assert counts["fundamental_pit"] > 0
    assert counts["index_constituent"] > 0
    panel = _build_panel(db, "20200101", "20231231")
    assert not panel.empty
    assert panel["date"].nunique() >= 12          # 满足 min_train
    assert panel["fwd_ret"].notna().any()
    latest = panel["date"].max()
    cands = compute_candidates(db, "ml_ridge",
                               {"top_n": 5, "ml_start": "20200101", "ml_end": latest},
                               as_of_date=latest)
    assert len(cands) >= 1


def test_seed_all_is_idempotent(db):
    """重跑不翻倍(delete + insert)。"""
    from seed_synthetic_data import seed_all
    seed_all(db)
    n1 = db.query(models.StockDailyModel).count()
    seed_all(db)
    n2 = db.query(models.StockDailyModel).count()
    assert n1 == n2
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && python -m pytest tests/test_seed_synthetic_data.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'seed_synthetic_data'`

- [ ] **Step 3: 实现 `backend/scripts/seed_synthetic_data.py`**

完整内容:
```python
"""合成数据底座:无 tushare 也能让 ML 候选池/回测端到端跑通。幂等(delete + insert)。
run: cd backend && python scripts/seed_synthetic_data.py
或:  docker exec -it <backend容器名> python scripts/seed_synthetic_data.py

IC 数值无现实意义(纯随机数据),只证明 ML 链路通。
"""
from __future__ import annotations
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))          # scripts/
sys.path.insert(0, str(HERE.parent))   # backend/ → config/database/models

import models  # noqa: E402


def _trade_dates(start: str, end: str) -> list[str]:
    """工作日序列(跳周末;不跳节假日,合成数据够用)。"""
    s = datetime.strptime(start, "%Y%m%d")
    e = datetime.strptime(end, "%Y%m%d")
    out, d = [], s
    while d <= e:
        if d.weekday() < 5:
            out.append(d.strftime("%Y%m%d"))
        d += timedelta(days=1)
    return out


def seed_all(db, n_codes: int = 30, years: int = 3,
             index_code: str = "000300.SH", start: str = "20200101",
             seed: int = 42) -> dict:
    """造 n_codes 只股票 × years 年合成数据,灌进三张表。幂等:先 delete 再 insert。

    返回 {index_constituent, stock_daily, fundamental_pit} 行数。
    """
    import random
    from sqlalchemy.orm import Session
    assert isinstance(db, Session)
    rng = random.Random(seed)
    end = (datetime.strptime(start, "%Y%m%d") + timedelta(days=365 * years)).strftime("%Y%m%d")
    dates = _trade_dates(start, end)
    codes = [f"{600000 + i:06d}.SH" for i in range(n_codes)]
    counts = {"index_constituent": 0, "stock_daily": 0, "fundamental_pit": 0}

    # 1) index_constituent:单一快照 trade_date=start,等权
    db.query(models.IndexConstituentModel).delete()
    w = round(1.0 / n_codes, 4)
    for c in codes:
        db.add(models.IndexConstituentModel(index_code=index_code, trade_date=start, code=c, weight=w))
    counts["index_constituent"] = n_codes

    # 2) stock_daily:每股 random-walk close + adj_factor=1 + 随机 pe_ttm/total_mv
    db.query(models.StockDailyModel).delete()
    for c in codes:
        price = rng.uniform(5, 50)
        shares = rng.randint(1, 50)  # 亿股(固定,让 total_mv 随 price 走)
        for dt in dates:
            price = max(1.0, price * (1 + rng.gauss(0, 0.02)))
            db.add(models.StockDailyModel(
                code=c, trade_date=dt,
                close=round(price, 2),
                adj_factor=1.0,
                pe_ttm=round(rng.uniform(5, 60), 2),
                total_mv=round(price * shares, 2),
            ))
    counts["stock_daily"] = n_codes * len(dates)

    # 3) fundamental_pit:每股每年一份"年报",end_date=YYYY1231,ann_date=次年0331(严格 PIT)
    db.query(models.FundamentalPitModel).delete()
    sy, ey = int(start[:4]), int(end[:4])
    for c in codes:
        for y in range(sy, ey + 1):
            db.add(models.FundamentalPitModel(
                code=c, end_date=f"{y}1231", ann_date=f"{y + 1}0331",
                roe=round(rng.uniform(2, 25), 2),
                grossprofit_margin=round(rng.uniform(10, 60), 2),
                debt_to_assets=round(rng.uniform(20, 70), 2),
            ))
    counts["fundamental_pit"] = n_codes * (ey - sy + 1)

    db.commit()
    return counts


if __name__ == "__main__":
    from database import SessionLocal
    db = SessionLocal()
    try:
        c = seed_all(db)
        print(f"[done] seed_synthetic: {c}")
    finally:
        db.close()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && python -m pytest tests/test_seed_synthetic_data.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_synthetic_data.py backend/tests/test_seed_synthetic_data.py
git commit -m "feat(deploy): 合成数据底座 seed_synthetic_data.py + 测试(TDD)"
```

---

### Task 3: `Dockerfile.backend`

**Files:**
- Create: `Dockerfile.backend`

**Interfaces:**
- Consumes: `backend/requirements.txt`(Task 1 补过)、`backend/` 代码
- Produces: 后端镜像(暴露 8000,CMD `uvicorn main:app`),Task 6 compose 的 `backend` 服务 build 它

- [ ] **Step 1: 写 `Dockerfile.backend`**

完整内容:
```dockerfile
# 后端镜像:python + FastAPI/uvicorn + ML 依赖。不含 nginx/supervisor(单进程)。
FROM python:3.12-slim

WORKDIR /app/backend

# 装依赖(阿里云源,沿用现有 Dockerfile 做法)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com

# 拷后端代码
COPY backend/ /app/backend/

# SDK 智能体工作目录挂载点(运行时 -v 覆盖;不挂也有空目录防报错)
RUN mkdir -p /workspace

# .env 由 compose env_file 注入;uvicorn 不带 reload(Docker 内无 Windows 事件循环坑)
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: 构建验证**

Run: `docker build -f Dockerfile.backend -t agentlab-backend:local .`
Expected: 构建成功,最后 `Successfully tagged agentlab-backend:local`(无 pip 错误,sklearn/lightgbm/pandas/tushare 都装上)

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.backend
git commit -m "feat(deploy): Dockerfile.backend(从生产 Dockerfile 拆出后端镜像)"
```

---

### Task 4: `Dockerfile.frontend` + `frontend.conf`

**Files:**
- Create: `Dockerfile.frontend`
- Create: `nginx/frontend.conf`

**Interfaces:**
- Consumes: 前端源码(`package.json` 等,根目录)、现有 `VITE_CLAUDE_*` ARG(placeholder 默认)
- Produces: 前端镜像(nginx 服 dist,暴露 80),Task 6 compose 的 `frontend` 服务 build 它;`frontend.conf` 是镜像内 nginx 配置

- [ ] **Step 1: 写 `Dockerfile.frontend`**

完整内容:
```dockerfile
# 前端镜像:node 构 dist → nginx 服静态(SPA)。
FROM node:20-alpine AS builder

ARG VITE_CLAUDE_API_KEY=placeholder
ARG VITE_CLAUDE_BASE_URL=https://api.anthropic.com
ARG VITE_CLAUDE_MODEL=claude-sonnet-4-6
ENV VITE_CLAUDE_API_KEY=$VITE_CLAUDE_API_KEY
ENV VITE_CLAUDE_BASE_URL=$VITE_CLAUDE_BASE_URL
ENV VITE_CLAUDE_MODEL=$VITE_CLAUDE_MODEL

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY . .
RUN npm run build

# 运行阶段:nginx 服 dist
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: 写 `nginx/frontend.conf`**

完整内容:
```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 3: 构建验证**

Run: `docker build -f Dockerfile.frontend -t agentlab-frontend:local .`
Expected: 构建成功,`npm run build` 产出 dist,`Successfully tagged agentlab-frontend:local`

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.frontend nginx/frontend.conf
git commit -m "feat(deploy): Dockerfile.frontend + frontend.conf(从生产拆出前端镜像)"
```

---

### Task 5: 网关 `gateway.conf`

**Files:**
- Create: `nginx/gateway.conf`

**Interfaces:**
- Consumes: 现有 `nginx.conf` 的反代规则
- Produces: `gateway.conf`(Task 6 网关 nginx 容器挂载它);上游用容器名 `backend:8000` / `frontend:80`

- [ ] **Step 1: 写 `nginx/gateway.conf`**

基于现有 `nginx.conf`,把 `127.0.0.1:8000` 换成 `backend:8000`、静态 `/` 改反代到 `frontend:80`。完整内容:
```nginx
server {
    listen 80;
    server_name localhost;

    gzip on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml application/xml+rss image/svg+xml;

    # 静态 SPA → 前端容器
    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # LLM API 反代(可选,ML 验证不依赖)
    location /api/anthropic/ {
        proxy_pass https://api.deepseek.com/anthropic/;
        proxy_set_header Host api.deepseek.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header x-api-key $http_x_api_key;
        proxy_ssl_server_name on;
    }

    # 后端 DB API
    location /api/db/ {
        proxy_pass http://backend:8000/api/db/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Settings API
    location /api/settings {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Agent API(SSE,长连接)
    location /api/agents {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

- [ ] **Step 2: Commit**(验证留到 Task 6 compose up)

```bash
git add nginx/gateway.conf
git commit -m "feat(deploy): gateway.conf(网关反代,上游用容器名)"
```

---

### Task 6: `docker-compose.local.yml`

**Files:**
- Create: `docker-compose.local.yml`

**Interfaces:**
- Consumes: Task 3/4 的 Dockerfile、Task 5 的 gateway.conf、Task 1 的 `.env`
- Produces: 四容器一键编排;MySQL 数据 bind mount 到 D 盘

- [ ] **Step 1: 前置——Docker Desktop 数据迁 D 盘(一次性)**

操作:Docker Desktop → Settings → Resources → Disk image location → 改成 `D:\docker-data\` → Apply & Restart。
Expected: Docker 重启后,`docker info` 正常,后续镜像/容器/卷落在 D 盘。

- [ ] **Step 2: 写 `docker-compose.local.yml`**

完整内容:
```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: agentlab-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_PASSWORD:-123456}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-context_lab}
    ports:
      - "3306:3306"
    volumes:
      - D:/docker-data/agentlab/mysql:/var/lib/mysql
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_PASSWORD:-123456}"]
      interval: 10s
      timeout: 5s
      retries: 10

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: agentlab-backend
    restart: unless-stopped
    env_file:
      - backend/.env
    environment:
      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_USER: ${MYSQL_USER:-root}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-123456}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-context_lab}
      ROOT_DIR: /workspace
    volumes:
      - agentlab_workspace:/workspace
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - appnet

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: agentlab-frontend
    restart: unless-stopped
    networks:
      - appnet

  nginx:
    image: nginx:alpine
    container_name: agentlab-nginx
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./nginx/gateway.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - backend
      - frontend
    networks:
      - appnet

volumes:
  agentlab_workspace:

networks:
  appnet:
    driver: bridge
```

> 说明:`backend/.env` 需先从 `.env.example` 拷贝(Step 3)。MySQL 数据用 bind mount 到 D 盘绝对路径(Docker Desktop on Windows 支持 `D:/...` 写法)。

- [ ] **Step 3: 准备 backend/.env**

Run: `cp backend/.env.example backend/.env`
(.env 已 gitignore,本地填好即可,默认值能跑 ML)

- [ ] **Step 4: 启动四容器**

Run: `docker compose -f docker-compose.local.yml up -d --build`
Expected: 四个容器都 `Up`(mysql 先 healthy,backend 依赖它起来后启动,frontend/nginx 随后)。`docker compose ps` 四个都 Up。backend 日志无报错(`create_tables` 成功)。

- [ ] **Step 5: 健康检查**

Run: `curl http://localhost:8080/api/db/health`
Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.local.yml
git commit -m "feat(deploy): docker-compose.local.yml(四容器本地编排,数据落 D 盘)"
```

---

### Task 7: 灌合成数据 + 端到端验证

**Files:** 无新增/修改(纯验证 gate;发现问题回头修前序 Task)

- [ ] **Step 1: 灌合成数据**

Run: `docker exec -it agentlab-backend python scripts/seed_synthetic_data.py`
Expected: 打印 `[done] seed_synthetic: {'index_constituent': 30, 'stock_daily': <~23000>, 'fundamental_pit': <~120>}`

校验数据落库:
Run: `docker exec agentlab-mysql mysql -uroot -p123456 context_lab -e "SELECT COUNT(*) FROM stock_daily; SELECT COUNT(*) FROM fundamental_pit; SELECT COUNT(*) FROM index_constituent;"`
Expected: 三表行数 > 0

- [ ] **Step 2: 跑 ML 自包含测试(零依赖双保险)**

Run: `docker exec agentlab-backend python -m pytest tests/test_ml_strategy.py tests/test_backtest.py tests/test_seed_synthetic_data.py -v`
Expected: 全部 passed(含 IC、PIT、min_train、seed 相关)

- [ ] **Step 3: API 端到端——候选池 + 回测**

候选池:
Run: `curl -X POST http://localhost:8080/api/db/candidates/run -H "Content-Type: application/json" -d '{"strategy":"ml_ridge"}'`
Expected: 非 409;返回候选 JSON(含候选列表)

回测(看 IC):
Run: `curl -X POST http://localhost:8080/api/db/candidates/backtest -H "Content-Type: application/json" -d '{"strategy":"ml_lightgbm"}'`
Expected: 非 409;返回含 `ic`(时序数组)、`icir`、`ic_win_rate` 字段

- [ ] **Step 4: 前端 UI 验证(人工)**

浏览器开 `http://localhost:8080` → 选「投资助手」agent → 候选池 tab → 下拉选 Ridge/LightGBM → 点"跑策略"看候选;回测 tab → 选 ML 策略 → 看 IC 面板(BarChart + ICIR/胜率 tile)。
Expected: 候选池出列表、回测出 IC 图(合成数据 IC 数值无意义,但图表渲染正常)。

- [ ] **Step 5: 验证结论记录**

确认三路都通后,在本计划文件勾完所有 checkbox,提示用户验证完成。若任一路失败:回对应 Task 排查(常见:字段不齐→Task 2;网络/反代→Task 5/6;依赖→Task 1/3)。

---

## Self-Review 结论

**Spec 覆盖**:spec 第 3-11 节(架构/镜像/compose/网关/依赖/fixture/env/启动/文件清单)均有对应 Task(1-7)。✓
**Placeholder 扫描**:无 TBD/TODO,所有 code step 含完整代码。✓
**类型/命名一致**:`seed_all(db, n_codes=30, years=3, ...)` 在 Task 2 测试与实现一致;三表字段名与 `models.py` 一致(`code` 非 `ts_code`);`compute_candidates(db, strategy, params, as_of_date=)` 签名与 `test_ml_strategy.py:101` 一致。✓

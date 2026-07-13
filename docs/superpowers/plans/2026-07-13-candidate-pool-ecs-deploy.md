# 2026-07-13 候选池功能 ECS 部署

## 目标
把 main 最新代码(候选池 / 数据管理 / 回测 / ML / 权重 / stock_basic)部署到 ECS 47.97.66.45。
数据底座已就绪:`stock_daily` 54.8w / `stock_basic` 5530 / `index_constituent` 7000 / `fundamental_pit` 5012。

## 环境(已探测 2026-07-13)
- 容器 `context-lab`:Python 3.12.13 / x86_64 / Linux
- 已装:pandas 3.0.3、tushare 1.4.29、fastapi、sqlalchemy、pymysql、claude-agent-sdk
- **缺:scipy / scikit-learn / lightgbm**(manylinux wheel,无需编译)
- 前端:本地 `package.json` 仅加 `playwright`(devDep),不影响 build

## 部署步骤(docker commit 固化路线)
> docker commit 把「docker cp 的代码 + pip install 的依赖」固化进镜像,解决 `compose up --force-recreate` 丢 docker cp 的两难(见 ecs-access memory)。

1. **回滚备份**:`docker tag context-lab:latest context-lab:rollback`
2. **后端代码**:tar `backend/`(排除 `.env`/`tests`/`__pycache__`/`*.local.json`/`.venv`)→ sftp → `docker cp` 进容器 → 容器内 `tar -xzf -C /app/`(覆盖 `/app/backend/`,补 `routers/candidates.py`、`routers/data_fetch.py`、`runtime/tools/candidates.py` 等)
3. **装依赖**:`docker exec context-lab pip install scipy scikit-learn lightgbm`
4. **固化代码+依赖**:`docker commit context-lab context-lab:latest`
5. **前端层**:本地 `npm run build` → `dist-patch.tar.gz` → sftp `/root/build` → `docker build -f Dockerfile.patch -t context-lab:latest`(FROM commit 版 latest,COPY 新 dist)
6. **重启**:`cd /root && docker compose up -d --no-deps --force-recreate context-lab`
7. **验证**:等 502 窗口(~8s)→ `curl /api/db/health` → 探测候选池/数据管理/回测 API + 浏览器验收

## 回滚
`docker tag context-lab:rollback context-lab:latest && cd /root && docker compose up -d --force-recreate context-lab`

## 风险
- 502 窗口:force-recreate 后 uvicorn 起 ~5-8s,期间 health 502(非失败)
- 依赖装失败:lightgbm wheel 通常 OK;失败则回滚 + 排查
- `.env` 不在包内,容器 `/app/backend/.env` 保留(pydantic 读)

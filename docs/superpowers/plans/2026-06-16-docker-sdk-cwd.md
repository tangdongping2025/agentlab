# docker SDK 智能体工作目录(方案 A)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** docker 部署下 SDK 智能体工作目录 = 挂载的宿主目录(`-e ROOT_DIR=/workspace -v <宿主>:/workspace`),agent 能改宿主文件。

**Architecture:** config.root_dir 已 env 可配(无需改代码)。改动主要在 deploy 文档(docker run 加 `-e ROOT_DIR/-v/ANTHROPIC_*` + env 表 + SDK cwd 章节 + 安全)和 Dockerfile(建 `/workspace` 默认目录)。claude-sdk 在 Linux 容器天然工作(asyncio subprocess),不需要 Windows 的 run_server.py。

**Tech Stack:** docker multi-stage(Dockerfile)+ deploy 文档(markdown)

**关键约束(来自 spec `2026-06-16-docker-sdk-cwd-design.md`):**
- cwd 存 session,跨环境(dev Windows / docker Linux)切换重切(已定)
- bypassPermissions + 挂载 = agent 能改宿主文件(用户 `-v` 授权,文档警告)
- claude-sdk 走 ANTHROPIC_BASE_URL=10.199.5.25:8080(容器需可达)

---

### Task 1: deploy 文档更新(docker run + env 表 + SDK cwd 章节)

**Files:**
- Modify: `docs/deploy-mysql.md`

- [ ] **Step 1: 更新 docker run 命令(加 ROOT_DIR/挂载/ANTHROPIC)**

把 `docs/deploy-mysql.md` 的 docker run 块(line 31-38)替换为:

```bash
docker run -d --name agentlab -p 8080:80 --network appnet \
  -e MYSQL_HOST=my-mysql -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root -e MYSQL_PASSWORD=123456 \
  -e MYSQL_DATABASE=context_lab \
  -e LLM_API_KEY=sk-xxx -e LLM_BASE_URL=https://api.deepseek.com/anthropic \
  -e LLM_MODEL=claude-sonnet-4-6 \
  -e ANTHROPIC_BASE_URL=http://10.199.5.25:8080/ \
  -e ANTHROPIC_AUTH_TOKEN=<内网代理 token> \
  -e ROOT_DIR=/workspace \
  -v <宿主目录,如 D:/projects>:/workspace \
  ghcr.io/tangdongping2025/agentlab:latest
```

- [ ] **Step 2: 环境变量表加 3 行**

在 `## 环境变量` 表(ANYSEARCH_API_KEY 行后)加:

```markdown
| ROOT_DIR | SDK 智能体工作目录根(FilesPanel 只列其下;agent cwd 必须在其下) | /workspace |
| ANTHROPIC_BASE_URL | claude-sdk 走的 LLM 端点(内网代理;助手/research 用 LLM_BASE_URL) | http://10.199.5.25:8080/ |
| ANTHROPIC_AUTH_TOKEN | claude-sdk 认证 token(内网代理) | （内网 token） |
```

- [ ] **Step 3: 加「SDK 智能体工作目录」章节**

在 `## 环境变量` 章节后(注意:LLM_API_KEY 段后)插入:

```markdown
## SDK 智能体工作目录(2026-06-16)

claude-sdk agent 的工作目录(cwd)通过 `ROOT_DIR` + 卷挂载实现,agent 的 Read/Edit/Bash 直接操作**挂载进来的宿主目录**:

- `ROOT_DIR=/workspace`:FilesPanel 只列该目录下,agent cwd 必须在其下(根校验防路径穿越)。
- `-v <宿主目录>:/workspace`:把宿主目录挂进容器。agent 改的是**宿主文件**(持久,容器重建不丢)。
- 用户在 FilesPanel 切到 `/workspace/xxx`(挂载子目录),刷新恢复(cwd 存 session)。

**⚠️ 安全警告**:`bypassPermissions` 模式下,agent 能改/删挂载进来的任何文件。`-v` 挂载时即授权 —— **只挂载你愿意让 agent 操作的目录**,不要挂整个磁盘根。

**cwd 跨环境**:dev(Windows `D:\...`)与 docker(Linux `/workspace/...`)路径不同,但共享 MySQL `context_lab`。切换环境时旧 cwd 失效,需在 FilesPanel 重切。各环境独立用、不频繁切换即可。

**ANTHROPIC env**:claude-sdk 走内网代理(`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`),与助手/research 的 `LLM_BASE_URL` 独立。容器需能访问代理地址(appnet bridge 默认 NAT 可达宿主网络)。
```

- [ ] **Step 4: 开发模式后端改 run_server.py**

把 `## 开发模式` 的后端命令(line 63-66)替换为:

```bash
# 后端(Windows 必须用 run_server.py —— uvicorn --reload 的 SelectorEventLoop 不支持
# claude-sdk subprocess,会报 CLIConnectionError。详见 backend/run_server.py 注释)
cd backend
.venv\Scripts\python.exe run_server.py
```

- [ ] **Step 5: Commit**

```bash
git add docs/deploy-mysql.md
git commit -m "docs(docker): SDK 智能体工作目录(ROOT_DIR+挂载+ANTHROPIC env+安全)"
```

---

### Task 2: Dockerfile 建 /workspace 默认目录

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: 加 mkdir /workspace**

在 `Dockerfile` 的阶段 3(`WORKDIR /app/backend` 后,`COPY nginx.conf` 附近)加:

```dockerfile
# SDK 智能体工作目录挂载点(运行时 -v 覆盖;不挂载时也有空目录,防 FilesPanel 报错)
RUN mkdir -p /workspace
```

具体:在 `WORKDIR /app/backend`(line 39)后、`COPY nginx.conf`(line 42)前插入。

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat(docker): Dockerfile 建 /workspace 默认挂载点"
```

---

### Task 3: docker build + run 验证

- [ ] **Step 1: 本地 docker build**

Run(项目根):
```bash
docker build -t agentlab-cwd-test .
```
Expected: 多阶段构建成功(node builder + python deps + runtime)。若 npm/pip 网络慢,耐心等;失败看错误(多为网络/资源)。

- [ ] **Step 2: docker run(带 ROOT_DIR + 挂载 + ANTHROPIC)**

```bash
docker run -d --name agentlab-cwd-test -p 8081:80 --network appnet \
  -e MYSQL_HOST=my-mysql -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root -e MYSQL_PASSWORD=123456 -e MYSQL_DATABASE=context_lab \
  -e ROOT_DIR=/workspace \
  -e ANTHROPIC_BASE_URL=http://10.199.5.25:8080/ \
  -v "D:/我的个人区间/Projects:/workspace" \
  agentlab-cwd-test
```
(ANTHROPIC_AUTH_TOKEN 按需加;LLM_* 此验证不需要)

- [ ] **Step 3: 验证 files API 列挂载目录**

```bash
curl -s -G "http://localhost:8081/api/db/files" --data-urlencode "dir=/workspace" | head -c 300
```
Expected: 返回宿主 `D:/我的个人区间/Projects` 下的目录/文件列表(context-lab 等)。

- [ ] **Step 4: 清理测试容器**

```bash
docker stop agentlab-cwd-test && docker rm agentlab-cwd-test
```
(镜像 agentlab-cwd-test 可留可删)

- [ ] **Step 5: 更新跟踪矩阵 + Commit**

`项目执行跟踪矩阵.md` 加 docker SDK cwd 条目(方案 A,3 Task)。

```bash
git add 项目执行跟踪矩阵.md
git commit -m "chore(docker): 跟踪矩阵补录 SDK 工作目录方案 A"
```

---

## 验证清单

- [ ] deploy 文档 docker run 含 ROOT_DIR/-v/ANTHROPIC;env 表 3 行;SDK cwd 章节(安全+跨环境+ANTHROPIC);开发模式 run_server.py
- [ ] Dockerfile 建 /workspace
- [ ] docker build 成功;run 后 `/api/db/files?dir=/workspace` 返回宿主文件列表

## 已知风险

1. **docker build 慢/网络**:多阶段(npm ci + pip install),首次慢;CI 环境(GitHub Actions)构建推送 ghcr
2. **容器访问内网代理**:10.199.5.25:8080 需容器网络可达(appnet bridge NAT);若不通,claude-sdk 对话失败(但 FilesPanel/cwd 不依赖代理,仍工作)
3. **挂载路径跨平台**:`-v "D:/...:/workspace"` Windows Docker Desktop 用正斜杠;Linux 宿主用绝对路径
4. **prod 镜像未含本改动**:需重新 build + push ghcr(Watchtower 60s 轮询更新);deploy 文档的 docker run 命令更新后,容器重建时带新 -e/-v

# docker 部署 SDK 智能体工作目录 设计(方案 A:挂载宿主)

## 背景

FilesPanel / cwd 的设计语义是「后端访问用户本地文件系统」(本地 dev 后端就在本机)。docker 后端跑在 Linux 容器里,**没有用户本地 FS**,且:

1. `config.root_dir` 默认 `D:\我的个人区间\Projects`(Windows),Linux 容器无此路径 → FilesPanel 列目录直接失败。
2. 用户切过的 cwd(Windows 路径)存进 session(MySQL,dev/prod 共享 `context_lab`)→ docker 读到 `D:\...` 失效。
3. 镜像内只有 `/app`(context-lab 自身代码),无用户项目文件。

**好消息**:claude-sdk 对话在 docker **应正常** —— ProactorEventLoop/run_server.py 是 Windows 专属修复,Linux asyncio SelectorEventLoop 支持 subprocess,supervisord 直接 `uvicorn main:app` 即可。

## 目标

docker 部署下,SDK 智能体的工作目录 = **挂载进来的宿主目录**(方案 A):agent 的 Read/Edit/Bash 直接操作宿主文件。

## 需求

### R1: root_dir env(`ROOT_DIR`)
- `config.Settings.root_dir` 已是 env 可配(pydantic-settings)。
- docker `-e ROOT_DIR=/workspace`;本地 dev 保持 Windows 默认(`D:\我的个人区间\Projects`)。

### R2: 卷挂载
- `docker run -v <宿主目录>:/workspace`。容器内 `/workspace` = 宿主文件。
- FilesPanel 列 `/workspace`(挂载),用户切 cwd(`/workspace/xxx`),agent 在挂载目录操作。

### R3: claude-sdk 的 ANTHROPIC env
- claude-sdk 走内网代理(`ANTHROPIC_BASE_URL=http://10.199.5.25:8080/` + `ANTHROPIC_AUTH_TOKEN`)。
- docker run 需注入这两个 env(容器网络要能访问 10.199.5.25:8080)。
- 现 deploy 文档未列(只列 LLM_API_KEY/BASE_URL 给助手/research)。补上。

### R4: cwd 跨环境(已定:接受切换重切)
- cwd 仍存 session。docker 用 Linux 路径(`/workspace/xxx`),dev 用 Windows 路径(`D:\...`)。
- 切换环境时旧 cwd 失效,用户重切。各环境独立用,不频繁切换即可接受。

### R5: 安全警告
- `bypassPermissions` + 挂载宿主 = agent 能改挂载进来的宿主文件(含删除)。
- 用户 `-v` 挂载时即授权。deploy 文档明确警告:只挂载愿意让 agent 操作的目录。

### R6: deploy 文档更新
- docker run 加 `-e ROOT_DIR=/workspace -v <宿主>:/workspace`。
- 环境变量表加 `ROOT_DIR` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`。
- 加「SDK 智能体工作目录」章节:挂载语义 + 安全警告 + cwd 跨环境说明。
- 开发模式后端改 `run_server.py`(Windows Proactor,见 `project_windows-proactor-startup` 记忆)。

## 架构

- `config.root_dir`:env 可配(已有,无需改代码)。
- `_SANDBOX_DIR`(默认 cwd):保留 `backend/sandbox`。docker 默认 cwd = `/app/backend/sandbox`(镜像内,不持久);**docker 用户应切到 `/workspace/xxx`(挂载,持久)**。文档说明。
- Dockerfile:基本不动。可选建 `/workspace` 默认空目录(`RUN mkdir -p /workspace`),即便不挂载也有(防 FilesPanel 报错);挂载时覆盖。
- sessions 表 `cwd` / `cwd_history` 列:已加(F1/F8 本地 ALTER,shared MySQL 已同步线上)。

## 测试 / 验证
- `docker build` 成功(多阶段构建)。
- `docker run` 带 `-e ROOT_DIR=/workspace -v <宿主>:/workspace` + ANTHROPIC env。
- 容器内:`/api/db/files?dir=/workspace` 返回宿主文件列表。
- claude-sdk 对话:发「列出当前目录文件」,agent 在 `/workspace` 操作。
- FilesPanel 切 `/workspace/xxx`,刷新恢复(cwd 持久化)。

## 非目标
- prod 独立 MySQL(用户选共享 + 切换重切)。
- docker 不持久化 cwd(用户选存 session)。
- 上传/同步本地文件到容器(用挂载替代)。
- 改 `_SANDBOX_DIR` 默认(保留 backend/sandbox,docker 靠用户切 /workspace)。

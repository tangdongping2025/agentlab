# CLAUDE.md - Context Lab 项目配置

> **⚠️ 项目已重新定位(2026-06-14)**:从「智能体上下文管理实验平台」转向「**智能体载体平台**」(教学/理解向,装载/运行/可视化多种智能体)。
>
> **当前进度**:RQ-1~6 完成(LLM provider / agent runtime+API+SSE / 前端主界面+助手 / 工具系统+tool use+research / 助手写操作 / 原理探索 4 策略)+ 生产部署上线。剩余 RQ-7~10(Claude SDK / ReAct / Reflection / RAG)。
>
> **恢复 context**:新会话先读 `docs/superpowers/specs/2026-06-14-agent-carrier-platform-design.md`(总体架构 + 6 层 + 10 需求拆解)+ `git log --oneline -20`(进度)+ 各 `docs/superpowers/plans/2026-06-14-rq0*.md`(实现计划)。下面的"项目信息/结构"部分是**旧定位**,以本提示框为准。

## 项目信息

**项目名称**：智能体上下文管理实验平台 (Context Lab) —— **已重新定位为「智能体载体平台」(见上方提示)**
**项目目标**：帮助个人学习 agent 开发的可视化实验工具
**技术栈**：前端 React 18 + TypeScript + Vite + Tailwind CSS + Zustand；后端 Python FastAPI + SQLAlchemy；数据 MySQL 8.0（Docker 容器 my-mysql）

## 项目结构

```
context-lab/                      # 主仓库（代码 + 文档统一管理）
├── src/                          # 前端
│   ├── components/               # UI 组件（含 HistoryPage 历史查询页）
│   ├── services/                 # agentService, sessionService(异步DB), dbApi, migration, tokenService
│   ├── stores/                   # appStore (Zustand)
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 工具函数（含 sanitizeMessages）
├── backend/                      # Python FastAPI 后端
│   ├── main.py                   # FastAPI app，路由挂 /api/db，启动建库建表
│   ├── config.py / database.py / models.py / schemas.py
│   ├── routers/                  # sessions(CRUD+查询), migrate(批量导入)
│   └── tests/                    # pytest，隔离到 context_lab_test 库
├── docs/superpowers/
│   ├── specs/                    # 需求规格文档
│   └── plans/                    # 实现计划文档
├── docs/deploy-mysql.md          # 后端部署文档（appnet + MYSQL env）
├── .claude/skills/我要干活了/    # 开发流程管理 skill
├── .env                          # 前端 API 配置（VITE_ 前缀，不提交）
├── backend/.env                  # 后端 MySQL 配置（不提交）
├── Dockerfile / supervisord.conf / nginx.conf  # 单镜像部署（nginx+uvicorn）
├── 项目执行跟踪矩阵.md           # 需求跟踪矩阵
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Worktree 约定

- **默认豁免 worktree**：本项目是个人项目，改动量小，`node_modules` 较重，使用 worktree 会导致双份依赖占用过多内存。直接在 master 上用分支开发即可。

## 开发流程纪律（强制）

每个需求，无论复杂度，必须按以下流程执行：

1. **Brainstorming** → 确认问题定义和约束
2. **Spec** → 写规格文档并 commit（简单需求允许极简，1-3 行即可，但不能跳过）
3. **Plan** → 写实现计划并 commit（简单需求允许 1 个 Task）
4. **Execute** → 按 Task 逐个执行，每个 Task：
   - 先写失败测试 → 实现 → 测试通过（TDD）
   - 每个 Task 独立 commit
5. **更新跟踪矩阵** → 需求完成后立即更新 `项目执行跟踪矩阵.md`

**No skipping steps. No exceptions.** Depth scales with complexity — 简单需求的 spec 和 plan 可以是一句话，但文件必须写、必须 commit。

## 开发命令

所有命令在项目根目录下执行：

```bash
# 前端（项目根目录）
npm run dev        # 启动开发服务器（端口 5173，proxy /api/db → :8000）
npm run build      # 生产构建
npm run typecheck  # TypeScript 检查
npm run test       # Vitest 测试

# 后端（backend/ 目录，需先 python -m venv .venv 并 pip install -r requirements.txt）
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000   # 启动后端
cd backend && .venv/Scripts/python.exe -m pytest                          # 后端测试（连 my-mysql）
```

开发时前后端各起一个进程：前端 vite:5173 + 后端 uvicorn:8000，vite proxy 自动转发 `/api/db`。

## 架构决策

### 为什么用 fetch 而不是 SDK

`@anthropic-ai/claude-agent-sdk` 在 `package.json` 中有声明，但代码未 import。`agentService.ts` 开头明确注释：

> 直接使用 Anthropic API 而不是 SDK，因为 SDK 不支持浏览器环境

实际用 `fetch()` 调 `/api/anthropic/v1/messages`，经 Vite dev server proxy 转发到火山引擎 ARK。

### 后端与数据持久化

会话数据持久化到 MySQL（真相源），前端经 `/api/db/*` 调 Python FastAPI 后端：

```
前端 dbApi → /api/db → FastAPI(uvicorn:8000) → MySQL(my-mysql:3306)
端点：sessions CRUD + /sessions/query(全文搜索+筛选) + /migrate(从 localStorage 一次性迁移)
```

**关键设计**：
- store 的会话方法用「**乐观更新内存 + 异步落库**」——同步更新 Zustand state，fire-and-forget 异步写库，调用方零改动。
- 前端生成 session id 透传给后端创建（保证后续 PUT 匹配）。
- `agentService` 维护独立的内存 conversationHistory，`switchSession` 时通过 `loadHistory` 灌入历史，否则继续对话会丢上下文（两套历史的同步是已知架构味道）。
- 发送前用 `sanitizeMessagesForApi` 过滤空内容消息 + 合并连续同角色（避免 LLM 400）。

### API 代理

Vite proxy 两条：
- `/api/anthropic` → `https://ark.cn-beijing.volces.com/api/coding`（LLM，非直连 anthropic.com）
- `/api/db` → `http://localhost:8000`（后端）

### API 配置

`context-lab/.env`（已 gitignore）：

```
VITE_CLAUDE_API_KEY=ark-xxx        # 火山引擎 ARK key，不是 sk-ant-
VITE_CLAUDE_BASE_URL=https://ark.cn-beijing.volces.com/api/coding
VITE_CLAUDE_MODEL=claude-3-5-sonnet-20240620
VITE_MAX_CONTEXT_SIZE=1048576
```

环境变量用 `VITE_` 前缀（Vite 客户端暴露），不是服务端 `process.env`。

后端 `backend/.env`（已 gitignore）：

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=context_lab
```

生产环境通过 `docker run -e` 注入（运行时 env，不烤进镜像）。详见 `docs/deploy-mysql.md`。

## 工具系统现状

2 个工具定义在 `agentService.ts` 中，通过 `anysearch-proxy.ts` Vite middleware 调用远程 AnySearch API：

- `anysearch` — 联网搜索（通用 + 23 个垂直领域）
- `anysearch-extract` — 网页内容提取

## 已知限制

- 浏览器环境不支持 Claude Agent SDK，前端只能用 fetch 直调 LLM API
- 后端 Python FastAPI（非浏览器），负责会话持久化到 MySQL；工具（anysearch）仍是远程 API 调用，非 mock
- LLM API 调用依赖火山引擎 ARK 代理（dev）/ deepseek（prod nginx 反代），需要有效 key
- `store.conversationHistory` 与 `agentService.conversationHistory` 是两份历史，仅手动同步（已知架构味道）
- 部署是单镜像（nginx+uvicorn via supervisord），Watchtower 60s 轮询自动升级；改 MySQL 相关配置后需先重建容器再 push（见 `docs/deploy-mysql.md`）

## 组件命名

- 组件文件：PascalCase（如 `ConfigSidebar.tsx`）
- 非组件文件：kebab-case（如 `context-visualizer.tsx`）

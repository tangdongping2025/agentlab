# CLAUDE.md - Context Lab 项目配置

## 项目信息

**项目名称**：智能体上下文管理实验平台 (Context Lab)
**项目目标**：帮助个人学习 agent 开发的可视化实验工具
**技术栈**：React 18 + TypeScript + Vite + Tailwind CSS + Zustand

## 项目结构

```
context-lab/                      # 主仓库（代码 + 文档统一管理）
├── src/
│   ├── components/               # UI 组件
│   ├── services/                 # agentService, sessionService, tokenService
│   ├── stores/                   # appStore (Zustand)
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 工具函数
├── docs/superpowers/
│   ├── specs/                    # 需求规格文档
│   └── plans/                    # 实现计划文档
├── .claude/skills/我要干活了/    # 开发流程管理 skill
├── .env                          # API 配置（VITE_ 前缀，不提交）
├── 项目执行跟踪矩阵.md           # 需求跟踪矩阵
├── 项目执行跟踪矩阵.html         # 跟踪矩阵可视化
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
npm run dev        # 启动开发服务器（端口 5173）
npm run build      # 生产构建
npm run typecheck  # TypeScript 检查
npm run test       # Vitest 测试
```

## 架构决策

### 为什么用 fetch 而不是 SDK

`@anthropic-ai/claude-agent-sdk` 在 `package.json` 中有声明，但代码未 import。`agentService.ts` 开头明确注释：

> 直接使用 Anthropic API 而不是 SDK，因为 SDK 不支持浏览器环境

实际用 `fetch()` 调 `/api/anthropic/v1/messages`，经 Vite dev server proxy 转发到火山引擎 ARK。

### API 代理

Vite proxy 将 `/api/anthropic` 前缀的请求转发到 `https://ark.cn-beijing.volces.com/api/coding`，不是直连 `api.anthropic.com`。

### API 配置

`context-lab/.env`（已 gitignore）：

```
VITE_CLAUDE_API_KEY=ark-xxx        # 火山引擎 ARK key，不是 sk-ant-
VITE_CLAUDE_BASE_URL=https://ark.cn-beijing.volces.com/api/coding
VITE_CLAUDE_MODEL=claude-3-5-sonnet-20240620
VITE_MAX_CONTEXT_SIZE=1048576
```

环境变量用 `VITE_` 前缀（Vite 客户端暴露），不是服务端 `process.env`。

## 工具系统现状

2 个工具定义在 `agentService.ts` 中，通过 `anysearch-proxy.ts` Vite middleware 调用远程 AnySearch API：

- `anysearch` — 联网搜索（通用 + 23 个垂直领域）
- `anysearch-extract` — 网页内容提取

## 已知限制

- 浏览器环境不支持 Claude Agent SDK，只能用 fetch 直调 API
- 无后端服务，所有工具执行结果是 mock 数据
- API 调用依赖火山引擎 ARK 代理，需要有效的 ARK API key

## 组件命名

- 组件文件：PascalCase（如 `ConfigSidebar.tsx`）
- 非组件文件：kebab-case（如 `context-visualizer.tsx`）

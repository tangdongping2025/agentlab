# AgentWorkspace 容器化 + claude-sdk tabs(对话/文件)— 规格设计

> 载体平台路线(spec 2026-06-14 工作区容器模型落地 + claude-sdk agent 升级 tabs 型)。

## 需求概述

`AgentWorkspace` 从硬编码 chat 改成**通用容器**(渲染形态由 `agent.metadata.workspace` 驱动);claude-sdk agent 作为**第一个 tabs 型 agent**(tab1 对话 + tab2 工作目录/文件列表)。tab2 设的工作目录 = agent 运行 cwd,必须在根目录下(可配),切换需确认。

## 背景

spec(2026-06-14)的工作区容器模型(`workspace.type: chat | tabs`,形态由 agent 声明)**未落地** —— 当前 `AgentWorkspace.tsx` 不分 type 都按 chat 渲染。本需求落地容器模型,claude-sdk tabs 作为首个 tabs 型 agent 验证。

## 关键决策(brainstorming 确认)

| 决策点 | 选择 |
|---|---|
| 工作区形态 | `AgentWorkspace` 容器化,按 `agent.workspace.type` 分发(chat / tabs / 未来扩展) |
| claude-sdk workspace | `{"type":"tabs","tabs":["对话","文件"]}`(首个 tabs 型) |
| tab1 对话 | 复用 `ChatWorkspace`(从现 AgentWorkspace 抽出) |
| tab2 工作目录语义 | = claude-sdk agent 的 cwd(**设即用**,agent 的 Read/Edit/Bash 都在这操作) |
| 工作目录规则 | 必须在根目录下(默认 `D:\我的个人区间\Projects\`,`config` 可配) |
| 切换提醒 | 选新工作目录 → 确认对话框 → 确认才生效 |
| 文件列表 | 只读展示(文件名/修改时间/大小/类型),不操作 |
| chat 形态改进 | **不在本 spec**(独立后续:markdown/宽列/头像/操作/思考折叠/空状态) |

## 架构:AgentWorkspace 容器化

`AgentWorkspace` 变通用容器,按 `workspace.type` 分发:

- `workspace.type="chat"` → `ChatWorkspace`
- `workspace.type="tabs"` → `TabsWorkspace`(按 `workspace.tabs` 渲染各 panel)
- 未来其他 type 可扩展(不硬编码 claude-sdk)

**组件拆分**:

- `AgentWorkspace`(容器):读 `workspace.type`,分发到对应形态组件
- `ChatWorkspace`(新,从现 AgentWorkspace 抽出对话部分):header + 消息列表 + 输入
- `TabsWorkspace`(新):tab 容器,按 `workspace.tabs` 渲染各 tab panel
- `FilesPanel`(新):tab2 文件浏览(工作目录设置 + 文件列表)

## agent 声明

- **claude-sdk**:`workspace={"type":"tabs","tabs":["对话","文件"]}`
  - tab1 "对话" → `ChatWorkspace`
  - tab2 "文件" → `FilesPanel`
- **echo/research/assistant**:`workspace={"type":"chat"}` → `ChatWorkspace`(现有不变)

## tab2 文件(FilesPanel)

- 顶部:工作目录输入框 + "切换"按钮
- **校验**:路径规范化后必须在 `root_dir` 下(`startswith`),否则拒绝 + 提示"必须在 X 下"
- **切换提醒**:确认对话框("将切换到 X,agent 的 Read/Edit/Bash 都在此操作,确认?"),确认才生效
- **文件列表**:表格(文件名 / 修改时间 / 大小 / 类型[文件/目录]),只读,按"目录优先 + 名字"排序
- 数据来源:`GET /api/files?dir=xxx`

## agent cwd 联动(关键)

tab2 设的工作目录 = claude-sdk agent 的 cwd。链路:

1. 前端 store 加 `workspaceCwd`(claude-sdk 当前工作目录,默认 `backend/sandbox` 或空)
2. `runWorkspace` 时,把 cwd 传后端(`runAgent` body 加 `cwd`)
3. 后端 `AgentTask.config.cwd`
4. `claude_sdk_agent._build_options`:`cwd=task.config.cwd or _SANDBOX_DIR`(没传则默认 sandbox)

## 根目录配置

- `config.py` 加 `root_dir`(默认 `D:\我的个人区间\Projects\`)
- 后端 files API + cwd 校验都用 `root_dir`

## 文件列表 API

新增 `GET /api/files?dir=xxx`(后端 `routers/files.py`):

- **校验**:`dir` 规范化后在 `root_dir` 下,否则 403
- **列目录**:`os.scandir` 返回 `[{name, mtime, size, is_dir}]`
- **排序**:目录优先 + 名字

## 改动面

| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | `claude_sdk_agent.py` | metadata tabs + cwd 从 config 读 |
| 后端 | `routers/files.py`(新) | `GET /api/files` 列目录 + 根校验 |
| 后端 | `config.py` | `root_dir` |
| 后端 | `main.py` | 挂载 files router |
| 前端 | `AgentWorkspace.tsx` | 容器化(分发)+ 抽出对话部分 |
| 前端 | `ChatWorkspace.tsx`(新) | 对话(从 AgentWorkspace 抽) |
| 前端 | `TabsWorkspace.tsx`(新) | tab 容器 |
| 前端 | `FilesPanel.tsx`(新) | tab2 文件浏览 |
| 前端 | `agentRuntimeStore.ts` | `workspaceCwd` + `runWorkspace` 传 cwd |
| 前端 | `agentRuntimeApi.ts` | `runAgent` 加 cwd 参数 |

## 范围

**做**:
- AgentWorkspace 容器化(chat/tabs 分发)
- claude-sdk tabs(tab1 对话 + tab2 文件)
- 文件列表 API + 根校验
- cwd 联动 + 根目录配置 + 切换确认
- 测试(后端 files API + 前端容器分发/FilesPanel)

**不做**(后续):
- chat 形态改进(markdown/宽列/头像/消息操作/思考折叠/空状态)—— **独立 spec**
- 文件操作(打开/编辑/删除,只读)
- 多根(单根可配)
- 文件内容预览
- 其他 agent 改 tabs(只 claude-sdk 验证容器模型)

## 设计理念合规

| 原则 | 检查 |
|---|---|
| 容器化 | AgentWorkspace 形态由 agent 决定,符合 spec,可扩展(未来 agent 声明 workspace.type 复用) |
| 复用 | ChatWorkspace 抽出,chat/tabs 共用;TabsWorkspace 通用 |
| 安全 | 工作目录根约束 + 切换确认(缓解 bypassPermissions 风险) |
| 范围 | chat 改进独立,本 spec 聚焦容器 + tabs + 文件 |
| 不破坏 | 现有 chat agent(echo/research/assistant)走 ChatWorkspace,行为不变 |

# 记忆透视台(Memory Panel)

## 背景

龙虾 Agent(claude-sdk)工作台现有 tabs:['对话','文件','Skill','MCP']。agent 实际有 4 层记忆,但用户在 UI 上看不到"agent 脑子里装了什么":

1. **会话历史**(`MessageModel`,窗口加载,长会话压缩 RQ-076)
2. **全局提示词**(`global_prompt_settings`,手写,如用户的 CLAUDE.md 行为准则)
3. **习惯偏好**(`InsightItemModel kind=habit`,accept + enable 后注入 system prompt)
4. **知识沉淀**(`InsightItemModel kind=knowledge`,只存不用,预留给 RAG)

每次调用 LLM,system prompt 按 `全局 → 任务 → 技能 → 习惯 → MCP` 拼装(`claude_sdk_agent.py:111`);工具作为独立 `tools` 参数传入(`_ALLOWED_TOOLS` 6 个 + amap MCP)。这些对用户全是黑盒。

## 现状与问题

- 用户看不到 agent 实际的 system prompt 长什么样、各段占多少、来自哪。
- 习惯/知识两层"记忆"存了什么、有没有注入,无从查看。
- "用得越多 agent 越懂用户"目前不成立:习惯/知识两层实查为空(`insight_items` 表 0 条),全局提示词占 system prompt 约 82%。
- 工具/MCP 在 prompt 里的角色(工具是独立 `tools` 参数、amap MCP 使用提示拼进 system 文本)容易混淆。
- "任务段"(系统级指令 `task.system`)与"用户最新请求"(`messages[-1]`)两个概念都叫"任务",用户容易混。

## 目标

为龙虾 Agent 工作台新增「记忆」tab,把 agent 脑子里装了什么摊开给用户看(教学/理解向)。主轴:**system prompt 拼装解剖**——展示实际拼进 system prompt 的分段 + 占比 + 来源;辅以工具清单、会话历史(含本次任务)、习惯/知识两层记忆。轻量可写(习惯开关)。

## 方案

### 后端

新增聚合接口 `GET /api/settings/memory-preview?agentId=claude-sdk&cwd=<cwd>`,复用现有构建函数,返回:

- `segments`:system prompt 5 段,每段 `{key, name, enabled, chars, source, preview}`
  - `global`:`build_global_prompt_for_agent`
  - `task`:会话 `task.system` 或 `_DEFAULT_SYSTEM_PROMPT`
  - `skill`:`build_skill_prompt_for_agent`
  - `habit`:`build_habit_prompt_for_agent`
  - `mcp`:amap 启用时拼入的使用提示文本(`claude_sdk_agent.py:114-118`)
- `tools`:`{system: _ALLOWED_TOOLS, mcp: amap 工具名列表(若启用)}`
- `habits`:`insight_items WHERE kind='habit'`(全部,含未启用,带 `enabled_for_prompt`)
- `knowledge`:`insight_items WHERE kind='knowledge'`
- `globalPrompt`:`{enabled, chars}`
- `totalChars`:5 段字符数合计(用于占比)

### 前端

新增 `src/components/agentRuntime/MemoryPanel.tsx`;`TabsWorkspace` tabs 在 'MCP' 后追加 '记忆',渲染:
`{active === '记忆' && <MemoryPanel cwd={workspaceCwd} />}`

会话窗口部分从 `agentRuntimeStore` 读(`workspaceMessages` / `workspaceOldestSeq` / `workspaceNewestSeq` / `workspaceHasMoreAfter`),不依赖后端接口;「当前任务」= `workspaceMessages` 中最后一条 `role=user` 的消息。

### 界面区块(纵向单栏,暖白卡片,与 SkillPanel 同款样式)

1. **system prompt 拼装解剖**(核心):5 段卡片(全局→任务→技能→习惯→MCP),每段 = 名称 + 状态徽章 + 字符数/占比 + 占比条 + 预览 + 来源标注;顶部标总字符数 + 拼装顺序(`claude_sdk_agent.py:111`)。
2. **工具清单**:系统工具(6)chip + MCP 工具(amap)chip;标注"独立 `tools` 参数,占 context window,不在 system 文本"。
3. **会话历史 · 窗口加载**:
   - **当前任务**(蓝左边框高亮):最新 user message(`messages[-1]`)预览 + 标注"驱动 agent 本轮动作,与任务段(系统指令)区分"。
   - **历史窗口**:窗口消息数 / seq 范围 / `hasMoreAfter`。
4. **习惯偏好 · 可写**:列表(空则空状态);每条带 `enabled_for_prompt` 开关(调现有 `PATCH /api/db/insights/{id}`)。
5. **知识沉淀 · 只读**:列表(空则空状态);标注"预留给 RAG,当前不注入"。

### 数据范围

- 智能体级(基本静态):全局 / 任务默认 / 技能 / 习惯 / MCP / 工具清单。
- 会话级(随当前工作区会话变化):任务段(会话 `task.system`)、会话历史窗口、当前任务(最新 user)。

### 概念澄清(界面内标注)

- **任务段** = `task.system or _DEFAULT_SYSTEM_PROMPT`(系统级指令:"agent 怎么做事")。
- **当前任务** = `messages[-1]` where `role=user`(用户最新请求:"用户这次要 agent 做什么")。
- 两者配对决定 agent 本轮行为,界面用高亮 + 对照文案区分。

## 验收

1. 龙虾 Agent 工作台出现「记忆」tab,点开展示 5 个区块,样式与 Skill/MCP tab 一致。
2. system prompt 拼装解剖:5 段按 全局→任务→技能→习惯→MCP 顺序,每段显字符数 + 占比条 + 来源;总数与占比合计自洽。
3. 工具清单:6 系统工具 + amap MCP(启用时),标注独立参数。
4. 会话历史:**当前任务**(最新 user)单独高亮 + **历史窗口**(消息数/seq/`hasMoreAfter`);两者文案对照区分"系统怎么做事 vs 用户要做什么"。
5. 习惯偏好:列表 + `enabled_for_prompt` 开关可切换并持久化(`PATCH /api/db/insights`);空状态文案。
6. 知识沉淀:只读列表;空状态文案。
7. 数据真实:全局提示词内容、习惯/知识来自 MySQL 实查;技能/工具来自代码常量;会话窗口来自 store。

## 不做(YAGNI)

- 不编辑全局提示词内容(只展示 + 状态);内容编辑走现有设置页。
- 不编辑/新增知识沉淀(只读);写入走历史页洞察模块。
- 不新增记忆抽取/归纳逻辑;复用现有 `build_*` 函数与 `insight_items` 数据。
- 不做 token 精确计数(用字符数估算,界面标注 ≈)。
- 不展示压缩状态首版(store 未暴露压缩标志字段,后续若补再加)。
- 不纳入 RAG 检索(RQ-10 另做)。
- 不做 Buffet 之外的其他 skill 内容展开(Skill tab 已有)。

## 可视化草稿

头脑风暴期间的界面草稿(HTML)保存在本地 `.superpowers/brainstorm/`(已 gitignore),含 v1(初版)与 v2(会话历史拆"当前任务 + 历史窗口")。

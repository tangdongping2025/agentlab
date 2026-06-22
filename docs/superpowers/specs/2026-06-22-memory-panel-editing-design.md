# 记忆透视台 global/task 段编辑能力设计

## 背景

记忆透视台(RQ-080)当前 5 段只读展示 system prompt 拼装解剖。用户要求 global(全局系统提示词)+ task(任务段)两段可在透视台就地编辑。

现状(已核实):
- **global 段**:后端链路完整——`backend/global_prompt_settings.py`(AppSetting key `global_prompt`,存 `{enabled, prompt}`)+ `GET/POST /api/settings/global-prompt`(`routers/settings.py:51-59`)+ `build_global_prompt_for_agent()`(`global_prompt_settings.py:68`,enabled && agent 支持时返回 `[全局系统提示词]...` 包装文本)。前端 service `getGlobalPromptSettings`/`saveGlobalPromptSettings`(`agentRuntimeApi.ts:209/215`)+ `GlobalPromptSettingsResponse`(`:95`)都在(上次只删了设置弹窗 tab,没动 service)。**缺前端编辑入口**。
- **task 段**:`_DEFAULT_SYSTEM_PROMPT`(`claude_sdk_agent.py:46`)是代码常量。拼装处 `claude_sdk_agent.py:117` `system_prompt = build_global_prompt_for_agent("claude-sdk") + (task.system or _DEFAULT_SYSTEM_PROMPT) + ...` 已有 `task.system or 默认` 覆盖机制,但 claude-sdk 运行时 task.system 通常未设 → 走默认。记忆透视台 task 段直接取 `_DEFAULT_SYSTEM_PROMPT`(`memory_preview.py:92`)。**无用户配置入口**。

**目标**:两段在记忆透视台行内编辑(用户已确认:行内展开 UI + task 段 enabled+content 模型)。

**生效范围**:global 编辑平台级(影响 `SUPPORTED_GLOBAL_PROMPT_AGENT_IDS` = assistant/research/claude-sdk 三个 LLM agent);task 段只影响 claude-sdk(`SUPPORTED_TASK_SYSTEM_AGENT_IDS = {"claude-sdk"}`)。

## 改动

### 后端

**1. 新增 `backend/task_system_settings.py`**(仿 `global_prompt_settings.py` 结构):
- 常量:`TASK_SYSTEM_SETTING_KEY = "task_system"`、`SUPPORTED_TASK_SYSTEM_AGENT_IDS = {"claude-sdk"}`、`MAX_TASK_SYSTEM_CHARS = 20000`。
- `sanitize_task_system_settings(raw)` → `{enabled: bool, content: str(截断)}`。
- `load_task_system_settings()` / `save_task_system_settings(raw)`:AppSetting 存取(仿 `global_prompt_settings.py:37-65`,不做 legacy JSON 回退——新功能不背历史包袱)。
- `build_task_system_for_agent(agent_id)` → `agent_id != "claude-sdk"` 返回 `None`;否则 load,`enabled && content.strip()` 返回 `content.strip()`,否则 `None`(裸文本,不包装——task.system 是裸拼入)。
- `build_task_system_settings_response()` → `{enabled, content, defaultPreview: _DEFAULT_SYSTEM_PROMPT[:200], agents: [{id, name, supportsTaskSystem, unsupportedReason}]}`(defaultPreview 供前端展示代码默认值 + "恢复默认"参考)。

**2. 接入 `claude_sdk_agent.py:117`**:
- `(task.system or _DEFAULT_SYSTEM_PROMPT)` → `(task.system or build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT)`。
- 优先级:运行时 task.system > 用户覆盖 > 代码默认(preserve 现有 task.system 机制)。
- import `build_task_system_for_agent`。

**3. `memory_preview.py` task 段**:
- `task_text = build_task_system_for_agent("claude-sdk") or _DEFAULT_SYSTEM_PROMPT`(`:92`)。
- source 注释(`:105`)更新为 `"用户覆盖(启用)或 _DEFAULT_SYSTEM_PROMPT(代码默认);运行时 task.system 优先级更高"`。
- import `build_task_system_for_agent`。

**4. `routers/settings.py` 新端点**(仿 global-prompt `:51-59`):
- `GET /task-system` → `build_task_system_settings_response()`。
- `POST /task-system` → `save_task_system_settings(payload)` 后返回 `build_task_system_settings_response()`。
- import + 挂 router(与 global-prompt 同 router 前缀 `/api/settings`)。

### 前端

**5. `src/services/agentRuntimeApi.ts`**:
- 新增 `TaskSystemSettingsResponse` 类型 `{ enabled: boolean; content: string; defaultPreview: string; agents: TaskSystemAgentSupport[] }`。
- 新增 `getTaskSystemSettings()` / `saveTaskSystemSettings(payload: { enabled: boolean; content: string })`(仿 `:209-223`)。
- global service 复用,不动。

**6. `src/components/agentRuntime/MemoryPanel.tsx` `SegmentCard`**:
- 加 `editable?: boolean` + `onSave?: (enabled: boolean, text: string) => Promise<void>` prop。
- `editable` 时卡片右上角显示「编辑」按钮(风格对齐 habit 段按钮 `MemoryPanel.tsx:220-235`)。点编辑 → 内部 `editing` 态 → preview 区(`<pre>`)切换为 `<textarea>` + enabled 开关 + 保存/取消按钮 + 段特定按钮(task:「恢复默认」= enabled=false 保留 content;global:无默认,可清空)。
- 编辑态进入时单独 GET 全文:global 调 `getGlobalPromptSettings()` 取 `prompt`;task 调 `getTaskSystemSettings()` 取 `content` + `defaultPreview`(memory-preview 的 `preview` 只 200 字,不够编辑)。
- 保存调 `onSave(enabled, text)` → 外部 service POST → 成功后退出 editing + 调外部 `onSaved` 触发面板刷新。

**7. `MemoryPanel.tsx` 渲染**(`:156-158` segments.map):
- `seg.key === 'global'`:传 `editable` + `onSave = (en, text) => saveGlobalPromptSettings({enabled: en, prompt: text})`。
- `seg.key === 'task'`:传 `editable` + `onSave = (en, text) => saveTaskSystemSettings({enabled: en, content: text})`。
- 其他段(skill/habit/mcp):不传 editable(只读现状)。
- 加 `reload()`:`getMemoryPreview(cwd)` 重设 `data`;SegmentCard `onSaved` 触发 reload。

## 不做

- 不动 skill/habit/mcp 段编辑(skill 走工作台 SkillPanel,habit 已有 toggle,mcp 走后端配置)。
- task 段不做 legacy JSON 回退(新功能直接 DB AppSetting;global 的 legacy 是历史包袱)。
- 不加编辑历史/版本(global 也没有)。
- 不做实时拼装预览(保存即 reload memory-preview,看新拼装结果 + 字符数/百分比更新)。
- 不动 `task.system` 运行时机制(只加用户覆盖层;若某调用路径传了 task.system,它仍优先于用户覆盖)。
- 不扩展记忆透视台对 claude-sdk 以外 agent 的支持(`SUPPORTED_MEMORY_PREVIEW_AGENT_IDS` 不变)。
- task 段编辑不包装文本(直接拼裸 content,区别于 global 的 `[全局系统提示词]...` 包装——因 task.system 本就是裸文本拼入 `:117`)。

## 测试策略

- **后端**:
  - 新增 `backend/tests/test_task_system_settings.py`(仿 `test_global_prompt_settings.py`):sanitize/load/save roundtrip、`build_task_system_for_agent`(enabled/content/agent 不支持 各分支)、`build_task_system_settings_response`。
  - `test_memory_preview.py`:task 段断言更新——用户覆盖 enabled+content 时 `task_text == content`,否则 `== _DEFAULT_SYSTEM_PROMPT`;source 注释断言。
  - `test_claude_sdk_agent`(若适用):`_build_options` 拼装含用户覆盖 content(运行时 task.system 为 None 时)。
- **前端**:
  - `MemoryPanel.test.tsx`:global 段点编辑 → textarea → 保存 → fetch POST `/api/settings/global-prompt` + reload;task 段点编辑 → textarea → 保存 → fetch POST `/api/settings/task-system` + reload;task「恢复默认」→ enabled=false。

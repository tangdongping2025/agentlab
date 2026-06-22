# 设置弹窗精简(删 MCP/Skill/全局提示词三 tab)

## 背景

`SettingsModal` 当前 5 个 tab:系统信息 / MCP / Skill / 全局提示词 / 模型配置。工作台现状:
- `SkillPanel` 可编辑 Skill(`saveSkillSettings`) → 设置里 Skill 是**重复**入口
- `McpPanel` 只读(`getMcpSettings` + `diagnoseMcpSettings`,无 save) → MCP 编辑只在设置
- 全局提示词无工作台面板 → 编辑只在设置

用户决定(2026-06-22 确认):设置里 MCP/Skill/全局提示词三块全删。Skill 改用工作台 `SkillPanel` 编辑;MCP/全局提示词以后需要改时直接改后端 `AppSetting` 配置(或 DB),不再前端编辑。

## 改动

- `src/components/SettingsModal.tsx`:删 MCP/Skill/全局提示词三个 tab —— `tabs` 数组三项 + 三个渲染块 + 对应 state(`mcp*`/`skill*`/`globalPrompt*`) + 三个加载 `useEffect` + 事件处理函数(`updateMcpServer`/`saveMcp`/`runMcpDiagnose`/`updateSkill`/`saveSkills`/`saveGlobalPrompt`) + clone 函数(`cloneMcpSettings`/`cloneSkillSettings`/`cloneGlobalPromptSettings`) + `import` 里的相关符号与类型。保留 system/agentModels tab。
- `src/components/SettingsModal.test.tsx`:删三个 tab 的测试 case + `beforeEach` 里 `fetchMock` 的 mcp/skills/global-prompt 三个分支 + `skillSettingsResponse`/`globalPromptResponse` 变量;保留模型配置测试;加一个"三 tab 不再渲染"的断言。

## 不做

- 不动 `src/services/agentRuntimeApi.ts`(service 层 `getMcpSettings`/`saveMcpSettings`/`getGlobalPromptSettings` 等保留——后端接口还在,记忆透视台 `memory-preview` 后端用 global prompt;前端 service 函数即使变 orphan 也留着,不在本次 scope)。
- 不动后端 `/api/settings/mcp|skills|global-prompt` 接口。
- 不动工作台 `McpPanel`/`SkillPanel`/`MemoryPanel`。
- 不动 system/agentModels tab 及隐藏的 context/api tab 渲染逻辑。

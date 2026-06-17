# Global System Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页增加平台级全局 system prompt，并按全局优先顺序注入 LLM 智能体。

**Architecture:** 后端新增 `global_prompt_settings.py` 负责本地 JSON 设置文件读写和 prompt 构造，`routers/settings.py` 暴露 `/api/settings/global-prompt`。`BaseAgent` 与 `ClaudeSdkAgent` 在原 system prompt 前拼接全局 prompt，SettingsModal 增加 Global Prompt tab。

**Tech Stack:** FastAPI、pytest、React 18、TypeScript、Vitest。

---

### Task 1: 后端全局提示词设置

**Files:**
- Create: `backend/global_prompt_settings.py`
- Test: `backend/tests/test_global_prompt_settings.py`

- [ ] 写失败测试：保存 prompt 后可读取；超长 prompt 截断；响应包含支持 agent 列表，`echo` 不支持。
- [ ] 实现 `load_global_prompt_settings()` / `save_global_prompt_settings()` / `build_global_prompt_for_agent()` / `build_global_prompt_settings_response()`。
- [ ] 运行：`MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_global_prompt_settings.py -q`
- [ ] 提交：`feat(settings): 添加全局提示词设置`

### Task 2: Settings API 与前端 client

**Files:**
- Modify: `backend/routers/settings.py`
- Modify: `src/services/agentRuntimeApi.ts`
- Test: `backend/tests/test_global_prompt_settings.py`

- [ ] 写失败测试：`GET /api/settings/global-prompt` 与 `POST /api/settings/global-prompt` roundtrip。
- [ ] 后端添加 GET/POST 路由。
- [ ] 前端新增 `GlobalPromptSettingsResponse` 类型、`getGlobalPromptSettings()`、`saveGlobalPromptSettings()`。
- [ ] 运行后端测试与 `npm run typecheck`。
- [ ] 提交：`feat(settings): 添加全局提示词 API`

### Task 3: Runtime 注入全局提示词

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/runtime/claude_sdk_agent.py`
- Test: `backend/tests/test_base_agent.py`
- Test: `backend/tests/test_claude_sdk_agent.py`

- [ ] 写失败测试：BaseAgent system 中全局提示词出现在 agent 自带 prompt 前、Skill prompt 前。
- [ ] 写失败测试：ClaudeSdkAgent options.system_prompt 中全局提示词出现在默认/任务 prompt 前、Skill prompt 前。
- [ ] 实现全局 prompt 拼接。
- [ ] 运行相关后端测试。
- [ ] 提交：`feat(agent-runtime): 注入全局系统提示词`

### Task 4: SettingsModal 全局提示词 tab

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/components/SettingsModal.test.tsx`

- [ ] 写失败测试：设置页展示“全局提示词”tab、textarea、支持 agent、echo 不支持。
- [ ] 实现 tab、加载、编辑、保存、保存成功提示。
- [ ] 运行：`npm run test -- src/components/SettingsModal.test.tsx --run` 与 `npm run typecheck`。
- [ ] 提交：`feat(settings): 添加全局提示词设置页`

### Task 5: 整体验证与跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] 运行后端回归：`MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_global_prompt_settings.py backend/tests/test_base_agent.py backend/tests/test_claude_sdk_agent.py backend/tests/test_agents_api.py -q`
- [ ] 运行前端回归：`npm run test -- src/components/SettingsModal.test.tsx --run && npm run typecheck && npm run build`
- [ ] API smoke：确认 `/api/settings/global-prompt` 返回 200，支持 agent 正确。
- [ ] 更新跟踪矩阵。
- [ ] 提交：`docs(tracking): 补录全局系统提示词`

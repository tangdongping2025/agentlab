# 工作目录设置数据库化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将文件面板工作目录设置从浏览器 localStorage 迁移到 MySQL，并按 Windows / container 环境隔离。

**Architecture:** 后端复用 `AppSettingModel` 的 `app_settings` 表，在 `/api/db/files/workspace-settings` 下暴露当前环境设置的 GET/PUT。前端 `dbApi` 增加对应方法，`FilesPanel` 以数据库返回值恢复 cwd/cwdHistory，并在 cwd 变化且位于 root 下时保存。

**Tech Stack:** FastAPI、SQLAlchemy、MySQL JSON、React 18、TypeScript、Vitest、Testing Library。

---

### Task 1: 后端 workspace settings API

**Files:**
- Modify: `backend/routers/files.py`
- Test: `backend/tests/test_files.py`

- [x] **Step 1: Write failing tests**

在 `backend/tests/test_files.py` 中新增测试：
- GET `/api/db/files/workspace-settings` 无记录时返回当前 `rootDir`、推断环境、空 cwd 和空历史。
- PUT container 环境保存 `/workspace/project` 后，GET 可读回。
- Windows root 与 container root 使用同一 `app_settings` key 但不同环境槽位，互不覆盖。

- [x] **Step 2: Run focused backend tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -q`
Expected: FAIL，因为接口尚不存在。

- [x] **Step 3: Implement backend API**

在 `backend/routers/files.py` 中：
- import `Depends`、`Session`、`get_db`、`AppSettingModel`。
- 增加 `WORKSPACE_SETTINGS_KEY = "workspace_settings"`。
- 增加 `_workspace_environment(root_dir: str) -> str`，Windows 盘符或 `\\` 归为 `windows`，其余归为 `container`。
- 增加 `_sanitize_workspace_entry(value)`，只保留字符串 cwd 和字符串数组 cwdHistory。
- GET 读取 `AppSettingModel`，返回当前环境槽位。
- PUT 校验 cwd 和 cwdHistory 都在当前 root 下，写回当前环境槽位。

- [x] **Step 4: Verify backend tests**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -q`
Expected: PASS。

### Task 2: 前端 API 与 FilesPanel 持久化

**Files:**
- Modify: `src/services/dbApi.ts`
- Modify: `src/services/dbApi.test.ts`
- Modify: `src/components/agentRuntime/FilesPanel.tsx`

- [x] **Step 1: Write failing frontend API test**

在 `src/services/dbApi.test.ts` 中新增测试，确认：
- `fetchWorkspaceSettings()` GET `/api/db/files/workspace-settings`。
- `saveWorkspaceSettings({ cwd, cwdHistory })` PUT `/api/db/files/workspace-settings` 并发送 JSON body。

- [x] **Step 2: Implement dbApi methods**

在 `src/services/dbApi.ts` 增加 `WorkspaceSettings` 类型，以及 `fetchWorkspaceSettings` / `saveWorkspaceSettings` 方法。

- [x] **Step 3: Update FilesPanel**

在 `FilesPanel.tsx` 中移除 localStorage 读写作为真相源：
- rootDir 加载后调用 `fetchWorkspaceSettings()`。
- 用数据库返回的 `cwdHistory` 覆盖 store history。
- 用 `resolveCwdForRoot(workspaceCwd, rootDir, settings.cwd)` 决定恢复目录。
- cwd/cwdHistory 变化且 cwd 位于 root 下时调用 `saveWorkspaceSettings`。

- [x] **Step 4: Verify frontend tests**

Run: `npm run test:run -- src/services/dbApi.test.ts`
Expected: PASS。

Run: `npm run typecheck`
Expected: PASS。

### Task 3: 跟踪矩阵与最终验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [x] **Step 1: Update tracking matrix**

新增 RQ-069，统计总数 +1、进行中 +1，并记录 spec、plan、实现与验证结果。

- [x] **Step 2: Run focused verification**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_files.py -q`
Expected: PASS。

Run: `npm run test:run -- src/services/dbApi.test.ts`
Expected: PASS。

Run: `npm run typecheck`
Expected: PASS。

- [x] **Step 3: Commit**

Commit message: `feat(runtime): 数据库存储工作目录设置`。

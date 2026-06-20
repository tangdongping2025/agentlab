# 龙虾 Agent Skill Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为龙虾 Agent 新增 Skill Tab，展示并手动启用当前工作目录 skills。

**Architecture:** 后端扩展现有 `/api/settings/skills`，在传入 cwd 时合并发现 `cwd/.claude/skills`。前端新增 `SkillPanel`，复用现有 `getSkillSettings/saveSkillSettings` 保存 `claude-sdk` 的启用状态。

**Tech Stack:** FastAPI + pytest，React + TypeScript + Vitest。

---

### Task 1: 后端发现工作目录 skills

**Files:**
- Modify: `backend/skill_settings.py`
- Modify: `backend/routers/settings.py`
- Test: `backend/tests/test_settings.py` 或现有 settings 测试文件

- [ ] 写失败测试：`GET /api/settings/skills?cwd=<root/project>` 能返回 `sourceType: workspace` 的 skill。
- [ ] 实现 `discover_skills(extra_dir: Path | None = None)`，保留平台目录优先，同名工作目录 skill 跳过。
- [ ] `build_skill_settings_response(cwd=None)` 接收 cwd，校验在 `settings.root_dir` 下，只扫描 `cwd/.claude/skills`。
- [ ] `save_skill_settings(raw, cwd=None)` sanitize 时使用同一发现集合，允许保存 workspace skill id。
- [ ] 跑后端相关测试。

### Task 2: 前端 Skill Tab 面板

**Files:**
- Modify: `backend/runtime/claude_sdk_agent.py`
- Modify: `src/components/agentRuntime/TabsWorkspace.tsx`
- Create: `src/components/agentRuntime/SkillPanel.tsx`
- Modify: `src/services/agentRuntimeApi.ts`
- Test: `src/components/agentRuntime/SkillPanel.test.tsx` 或 `TabsWorkspace.test.tsx`

- [ ] 写失败测试：龙虾 tabs 包含 `Skill`，点击后加载 `/api/settings/skills?cwd=<workspaceCwd>`。
- [ ] 将龙虾 Agent metadata tabs 改为 `["对话", "文件", "Skill"]`。
- [ ] `getSkillSettings(cwd?)` 和 `saveSkillSettings(payload, cwd?)` 支持 query 参数。
- [ ] `SkillPanel` 展示 skill 名称、描述、来源、启用状态、截断标记、内容预览。
- [ ] 启用/禁用时只维护 `claude-sdk` 是否在 `agentIds` 中；保存后刷新面板。
- [ ] 跑前端相关测试和 typecheck。

### Task 3: 手动验证与部署同步

**Files:**
- Runtime only

- [ ] 重启本地后端。
- [ ] 在 dev UI 中验证龙虾 `Skill` Tab。
- [ ] 同步后端/前端构建到 Docker 容器或重建镜像。
- [ ] 验证 Docker 局域网入口 `http://192.168.0.128:8080/` 的 Skill Tab。

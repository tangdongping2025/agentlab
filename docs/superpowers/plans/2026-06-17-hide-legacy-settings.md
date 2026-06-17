# 隐藏旧版配置入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隐藏设置页中的旧版 Chat / 旧版 API 配置入口，但保留旧代码。

**Architecture:** 只修改 `SettingsModal` 的 `tabs` 列表，不删除 `context` / `api` 内容分支。

**Tech Stack:** React + TypeScript + Vite。

---

### Task 1: 隐藏旧版配置 tab

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: 修改 tabs 列表**

将：

```ts
const tabs = [
  { id: 'system', label: '系统信息', icon: 'i' },
  { id: 'mcp', label: 'MCP', icon: 'MCP' },
  { id: 'context', label: '旧版 Chat', icon: '🧠' },
  { id: 'api', label: '旧版 API', icon: '🔑' },
] as const;
```

改为：

```ts
const tabs = [
  { id: 'system', label: '系统信息', icon: 'i' },
  { id: 'mcp', label: 'MCP', icon: 'MCP' },
] as const;
```

- [ ] **Step 2: 保留旧分支**

不删除 `activeTab === 'context'` 和 `activeTab === 'api'` 的 JSX 分支。

- [ ] **Step 3: 验证**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx docs/superpowers/specs/2026-06-17-hide-legacy-settings-design.md docs/superpowers/plans/2026-06-17-hide-legacy-settings.md
git commit -m "refactor(settings): 隐藏旧版配置入口"
```

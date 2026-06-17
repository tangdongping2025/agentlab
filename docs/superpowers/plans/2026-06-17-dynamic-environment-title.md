# 动态环境标题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `AGENT LAB (docker全流程)` 改为按 Vite dev/prod 动态显示环境后缀。

**Architecture:** 在 `src/App.tsx` 中用 Vite 内置 `import.meta.env.DEV` 计算标题后缀。该判断由构建工具提供，不依赖后端和 Docker 环境变量。

**Tech Stack:** React + TypeScript + Vite。

---

### Task 1: 动态标题后缀

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 定义环境后缀常量**

在组件渲染前加入：

```ts
const environmentLabel = import.meta.env.DEV ? 'dev开发环境' : 'docker生产环境';
```

- [ ] **Step 2: 替换标题文案**

将标题改为：

```tsx
AGENT LAB ({environmentLabel})
```

- [ ] **Step 3: 验证**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx docs/superpowers/specs/2026-06-17-dynamic-environment-title-design.md docs/superpowers/plans/2026-06-17-dynamic-environment-title.md
git commit -m "feat(ui): 动态显示运行环境标题"
```

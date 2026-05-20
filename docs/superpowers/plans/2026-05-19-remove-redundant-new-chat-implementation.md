# RQ-031 去掉会话列表顶部冗余的新建按钮 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 SessionList 标题栏中冗余的"+ 新建"按钮。

**Architecture:** 删除 SessionList.tsx 第 56-61 行的 span 元素。

**Tech Stack:** React

---

### Task 1: 删除冗余按钮

**Files:**
- Modify: `context-lab/src/components/SessionList.tsx`

- [x] **Step 1: 删除标题栏"+ 新建"按钮** — 已完成

- [ ] **Step 2: 更新跟踪矩阵**

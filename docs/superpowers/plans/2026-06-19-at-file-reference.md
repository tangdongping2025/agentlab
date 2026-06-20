# @ 文件引用选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在对话输入区支持 `@` 触发文件引用选择，并把选中文件路径作为轻量上下文交给 Agent。

**Architecture:** 在现有对话输入组件内增加本地 `@` 候选浮层和已选引用状态。候选来源复用现有文件 API；发送时只追加路径提示，不读取文件全文。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、现有 `dbApi` 文件接口。

---

### Task 1: `@` 文件引用输入与发送提示

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/services/dbApi.ts`（如需新增轻量文件搜索方法）
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [x] **Step 1: Write failing tests**

在 `ChatWorkspace.test.tsx` 增加测试：
- mock 当前工作目录与文件候选。
- 用户输入 `@` 后出现文件候选。
- 点击候选后输入框插入 `@相对路径`。
- 发送后传给 Agent 的用户消息包含文件引用提示，不包含文件全文。

- [x] **Step 2: Run failing test**

Run: `npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx -t "file reference"`
Expected: FAIL，因为当前不支持 `@` 文件引用。

- [x] **Step 3: Implement minimal code**

- 在输入区识别最后一个 `@关键词`。
- 从当前工作目录文件列表中过滤候选。
- 选择候选后插入 `@相对路径` 并记录 selected file references。
- 发送时在用户消息前追加轻量提示：`用户提到以下当前工作区文件：... 如果需要，请优先读取这些文件。`
- 发送成功后清空 selected file references。

- [x] **Step 4: Verify**

Run: `npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx -t "file reference"`
Expected: PASS。

Run: `npm run typecheck`
Expected: PASS。

- [x] **Step 5: Update tracking matrix**

新增 RQ-071，记录 spec/plan、验证结果与浏览器验收待确认。

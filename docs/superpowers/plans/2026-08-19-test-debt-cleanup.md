# 测试债清偿:前端套件恢复全绿 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端 vitest 套件从 8 文件/17 测试失败恢复到 0 failed,恢复 TDD 守门能力。

**Architecture:** 三批:批 1 删孤儿(测试+死组件);批 2 逐文件修 6 个在用模块的 mock/断言/组件标记;批 3 终验。每个 Task 独立 commit、独立可测。

**Tech Stack:** Vitest + @testing-library/react + React 18 + TS + Zustand

## Global Constraints

- 验收:`npx vitest run` 0 failed;`npm run typecheck` 通过;后端 pytest 无新增失败(仅对照)
- 修复原则:测试跟不上生产改版 → 改测试;组件真丢关键标记 → 修组件
- 不加 CI/git hook;不动后端测试;不重构测试结构
- 全部命令在项目根目录 `D:\我的个人区间\Projects\context-lab` 执行

---

### Task 1: 删孤儿测试 + 孤儿组件 ChatInteraction.tsx

**Files:**
- Delete: `__tests__/services/sceneService.test.ts`(生产文件已删)
- Delete: `__tests__/components/ToolInteractionDetails.test.tsx`(生产文件已删)
- Delete: `__tests__/components/ChatInteraction.test.tsx`(组件零引用)
- Delete: `src/components/ChatInteraction.tsx`(693 行,生产零引用)

**Interfaces:**
- Consumes: 无
- Produces: 无(纯删除;后续 Task 不依赖)

- [ ] **Step 1: 复验 ChatInteraction 零引用(删除前置检查)**

Run: `grep -rn "ChatInteraction" src/ --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "src/components/ChatInteraction.tsx"`
Expected: 无输出(零引用)。若有输出则停止并上报,不得删除。

- [ ] **Step 2: 删 4 个文件**

```bash
git rm __tests__/services/sceneService.test.ts __tests__/components/ToolInteractionDetails.test.tsx __tests__/components/ChatInteraction.test.tsx src/components/ChatInteraction.tsx
```

- [ ] **Step 3: 跑全量测试确认失败数下降且无新增失败**

Run: `npx vitest run 2>&1 | tail -4`
Expected: `Test Files  5 failed | 33 passed` → 失败文件从 8 降 3(sceneService/ToolInteractionDetails/ChatInteraction 各 -1),测试失败从 17 降 9,无新失败文件。

- [ ] **Step 4: typecheck(确认无悬空 import)**

Run: `npm run typecheck`
Expected: 通过。若报 ChatInteraction 相关 import 错误,回查引用(Step 1 应已拦截)。

- [ ] **Step 5: Commit**

```bash
git commit -m "test: 删孤儿测试与孤儿组件(sceneService/ToolInteractionDetails/ChatInteraction)"
```

---

### Task 2: appStore.test.ts 断言换现役工具

**Files:**
- Modify: `__tests__/stores/appStore.test.ts:37-56`(should toggle tool selection)

**Interfaces:**
- Consumes: `useAppStore().selectedTools` 初始值 `['anysearch', 'anysearch-extract']`(xueqiu-search 工具已从代码库移除)
- Produces: 无

- [ ] **Step 1: 改断言(xueqiu-search → anysearch)**

`should toggle tool selection` 测试体内,三处 `xueqiu-search` 全部替换为 `anysearch`,注释同步改:

```ts
  test('should toggle tool selection', () => {
    const { result } = renderHook(() => useAppStore());

    // 初始状态应该包含anysearch
    expect(result.current.selectedTools).toContain('anysearch');

    // 第一次toggle应该移除anysearch
    act(() => {
      result.current.toggleTool('anysearch');
    });

    expect(result.current.selectedTools).not.toContain('anysearch');

    // 第二次toggle应该添加anysearch
    act(() => {
      result.current.toggleTool('anysearch');
    });

    expect(result.current.selectedTools).toContain('anysearch');
  });
```

- [ ] **Step 2: 跑该文件验证绿**

Run: `npx vitest run __tests__/stores/appStore.test.ts 2>&1 | tail -4`
Expected: 全部 PASS。

- [ ] **Step 3: Commit**

```bash
git add __tests__/stores/appStore.test.ts
git commit -m "test: appStore 工具选择断言改用现役 anysearch(xueqiu 已删)"
```

---

### Task 3: YuanbaoWarmTheme.test.tsx 补 fetchWorkspaceSettings mock

**Files:**
- Modify: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx:19-30`(vi.mock dbApi 工厂)、`:33-38`(beforeEach)

**Interfaces:**
- Consumes: 生产代码 `dbApi.fetchWorkspaceSettings(): Promise<WorkspaceSettings>`,`WorkspaceSettings = { environment: 'windows'|'container'; rootDir: string; cwd: string; cwdHistory: string[] }`(dbApi.ts:70-75)。消费点:ChatWorkspace.tsx:153 用 `settings.cwd`,FilesPanel.tsx:26 用 `settings.rootDir`
- Produces: 无

- [ ] **Step 1: mock 工厂加方法**

`vi.mock('../../services/dbApi', ...)` 的 dbApi 对象里追加一行(fetchRootDir 之后):

```ts
vi.mock('../../services/dbApi', () => ({
  dbApi: {
    querySessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
    fetchRootDir: vi.fn(),
    fetchWorkspaceSettings: vi.fn(),
    listFiles: vi.fn(),
    readFile: vi.fn(),
    downloadFile: vi.fn(),
  },
}));
```

- [ ] **Step 2: beforeEach 加返回值**

在 `vi.mocked(dbApi.fetchRootDir)...` 行后追加:

```ts
    vi.mocked(dbApi.fetchWorkspaceSettings).mockResolvedValue({
      environment: 'windows',
      rootDir: 'D:/我的个人区间/Projects',
      cwd: '',
      cwdHistory: [],
    });
```

- [ ] **Step 3: 跑该文件验证绿**

Run: `npx vitest run src/components/agentRuntime/YuanbaoWarmTheme.test.tsx 2>&1 | tail -4`
Expected: 全部 PASS(4 个原失败用例不再报 `fetchWorkspaceSettings is not a function`)。

- [ ] **Step 4: Commit**

```bash
git add src/components/agentRuntime/YuanbaoWarmTheme.test.tsx
git commit -m "test: YuanbaoWarmTheme mock 补 fetchWorkspaceSettings(生产新增 API)"
```

---

### Task 4: App.test.tsx 补 dbApi mock + 异步断言

**Files:**
- Modify: `src/App.test.tsx`(vi.mock 区 + resumes 测试)

**Interfaces:**
- Consumes: `agentRuntimeStore.resumeWorkspaceSession`(agentRuntimeStore.ts:267-300)异步调 `dbApi.getSessionMessages(id,{limit:12})` 与 `dbApi.getSessionMessageIndex(id)`;`stateFromMessageWindow` 消费 `{messages:[{role,content,seq}],hasMoreBefore,hasMoreAfter,oldestSeq,newestSeq}`
- Produces: 无

- [ ] **Step 1: 加 dbApi mock(importOriginal 保留其余真实方法)**

在现有 `vi.mock('./services/sessionService', ...)` 后追加:

```tsx
vi.mock('./services/dbApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/dbApi')>();
  return {
    dbApi: {
      ...actual.dbApi,
      getSessionMessages: vi.fn(),
      getSessionMessageIndex: vi.fn(),
    },
  };
});
```

import 行加 `dbApi` 与 `waitFor`:

```tsx
import { dbApi } from './services/dbApi';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: resumes 测试改异步断言 + mock 返回值**

```tsx
test('resumes a history session into agent runtime workspace', async () => {
  vi.mocked(dbApi.getSessionMessages).mockResolvedValue({
    messages: [{ role: 'user', content: 'hello', seq: 1 }],
    hasMoreBefore: false, hasMoreAfter: false, oldestSeq: 1, newestSeq: 1,
  } as Awaited<ReturnType<typeof dbApi.getSessionMessages>>);
  vi.mocked(dbApi.getSessionMessageIndex).mockResolvedValue({ items: [] } as Awaited<ReturnType<typeof dbApi.getSessionMessageIndex>>);

  render(<App />);

  fireEvent.click(screen.getByTitle('历史会话'));
  expect(screen.getByText('History Page')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Mock Resume Session'));

  const state = useAgentRuntimeStore.getState();
  expect(state.currentAgentId).toBe('research');
  expect(state.workspaceSessionId).toBe('history-session');
  await waitFor(() => expect(state.workspaceMessages).toEqual([{ role: 'user', content: 'hello' }]));
  expect(screen.getByText('Agent Runtime View')).toBeInTheDocument();
});
```

注:若 `toEqual` 因 `toWorkspaceMessages` 映射出的消息形状含额外字段而失败,改为断言 `state.workspaceMessages[0]` 的 `role`/`content` 两字段(以实际形状为准,同步修正断言并保持语义)。

- [ ] **Step 3: 跑该文件验证绿**

Run: `npx vitest run src/App.test.tsx 2>&1 | tail -4`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/App.test.tsx
git commit -m "test: App resume 会话测试对齐异步消息窗口(mock getSessionMessages/Index+waitFor)"
```

---

### Task 5: MessageBubble 删过时 regenerate 用例 + 删死 prop

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx:694-702`(删用例)
- Modify: `src/components/agentRuntime/MessageBubble.tsx:15,74`(删 onRegenerate)

**Interfaces:**
- Consumes: 无(背景:改版后 actions 只剩 复制内容/复制纯文本/朗读/导出 Word,"重新生成"按钮已被移除;`onRegenerate` prop 全库无生产调用方,仅该测试在传)
- Produces: `MessageBubble` Props 不再含 `onRegenerate`(后续无人使用)

- [ ] **Step 1: 删测试用例**

删除整个 `it('regenerate button only when onRegenerate provided', ...)` 块(约 :694-702)。

- [ ] **Step 2: 删组件死 prop**

MessageBubble.tsx Props interface 删 `onRegenerate?: () => void;`,组件解构参数删 `onRegenerate`(两处)。

- [ ] **Step 3: 跑该文件 + typecheck**

Run: `npx vitest run src/components/agentRuntime/MessageBubble.test.tsx 2>&1 | tail -4 && npm run typecheck`
Expected: 测试全 PASS;typecheck 通过(若其他文件传 onRegenerate 会在此暴露——已验证无调用方)。

- [ ] **Step 4: Commit**

```bash
git add src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/MessageBubble.tsx
git commit -m "test: MessageBubble 删过时 regenerate 用例(按钮已移除)+清理死 prop"
```

---

### Task 6: DetailModal 组件补可达性标记(测试不动)

**Files:**
- Modify: `src/components/DetailModal.tsx:39-45`(backdrop 加 data-testid)、`:59-67`(× 按钮加 aria-label)

**Interfaces:**
- Consumes: 测试 `getByLabelText('关闭')` 与 `getByTestId('modal-backdrop')`(测试文件 `__tests__/components/DetailModal.test.tsx` 不改)
- Produces: DetailModal DOM 含 `aria-label="关闭"` 的关闭按钮与 `data-testid="modal-backdrop"` 的遮罩层

- [ ] **Step 1: backdrop 加 testid**

DetailModal.tsx:39 的最外层 div 属性追加:

```tsx
    <div
      data-testid="modal-backdrop"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
```

- [ ] **Step 2: × 按钮加 aria-label(无障碍正确性,非仅为测试)**

```tsx
          <button
            aria-label="关闭"
            onClick={onClose}
            style={{
```

- [ ] **Step 3: 跑该文件验证绿**

Run: `npx vitest run __tests__/components/DetailModal.test.tsx 2>&1 | tail -4`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/DetailModal.tsx
git commit -m "fix: DetailModal 补关闭按钮 aria-label 与 backdrop testid(可达性)"
```

---

### Task 7: 终验 + 更新跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`(尾部追加条目)

- [ ] **Step 1: 全量 vitest**

Run: `npx vitest run 2>&1 | tail -4`
Expected: `Test Files  41→38 文件全 passed`,`Tests  0 failed`。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: 后端对照(确认无新增失败;若 Task 1 前的全量基线仍在跑,用其结果)**

Run: `cd backend && .venv/Scripts/python.exe -m pytest --tb=no -q 2>&1 | tail -5`
Expected: 与修复前基线一致(watchlist 相关此前 20 通过;本次未动后端,失败集合应完全相同)。

- [ ] **Step 4: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 头部"最后更新"改 2026-08-19,尾部追加一段:测试债清偿(8 文件/17 失败 → 0 failed;删 3 孤儿测试+ChatInteraction.tsx;修 appStore/YuanbaoWarmTheme/App/MessageBubble mock 与断言;DetailModal 补可达性标记)。

- [ ] **Step 5: Commit(不 push,等用户确认)**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 跟踪矩阵补测试债清偿条目"
```

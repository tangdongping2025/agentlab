# 工作目录按环境自动记忆 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 dev/docker 切换时,工作目录按 rootDir 自动恢复,不再需要手动重选。

**Architecture:** 单一真相源改为浏览器 `localStorage["agentlab.cwd:"+rootDir]`(per-rootDir,跨 session 共享同环境记忆)。`session.cwd / session.cwdHistory` 字段保留 schema 但停止读写,自然失活。FilesPanel 跨环境失效分支由"清空 + 报错"改为"取记忆 / 兜底 rootDir"。

**Tech Stack:** TypeScript / React 18 / Zustand / Vitest;无后端改动。

**Spec:** `docs/superpowers/specs/2026-06-17-workspace-cwd-env-isolation-design.md`

---

## File Structure

| 文件 | 操作 | 责任 |
| --- | --- | --- |
| `src/components/agentRuntime/filesUtils.ts` | 修改 | 加 `isUnderRoot`(纯函数) + `resolveCwdForRoot`(决策) + `loadCwdMemory`/`saveCwdMemory`/`loadCwdHistoryMemory`/`saveCwdHistoryMemory`(localStorage 读写包装) |
| `src/components/agentRuntime/filesUtils.test.ts` | 修改 | 加上述新函数的单测(含 localStorage stub) |
| `src/stores/agentRuntimeStore.ts` | 修改 | `setWorkspaceCwd` 移除 `dbApi.updateSession({cwd, cwdHistory})`;`selectAgent` 不读 `session.cwd / session.cwdHistory`;新增 `setWorkspaceCwdHistory(hist: string[])` action |
| `src/stores/agentRuntimeStore.test.ts` | 修改 | 改写 102 行 / 111 行两个 cwd 相关测试 |
| `src/components/agentRuntime/FilesPanel.tsx` | 修改 | 跨环境失效分支重写;新增写入 useEffect;rootDir 变化时从 localStorage 恢复 history |

无后端改动,无 schema 改动,无 commit message 中含密钥。

---

### Task 1: filesUtils 扩展(纯函数 + localStorage 包装)

**Files:**
- Modify: `src/components/agentRuntime/filesUtils.ts`(在文件末追加新函数)
- Test: `src/components/agentRuntime/filesUtils.test.ts`(新增 describe 块)

- [ ] **Step 1: 看现有测试文件结构,确认导入风格**

Run: `cat src/components/agentRuntime/filesUtils.test.ts`
Expected: 看到 `import { describe, it, expect } from 'vitest'`(或类似)。后续测试沿用同风格。

- [ ] **Step 2: 写 isUnderRoot / resolveCwdForRoot 的失败测试**

在 `filesUtils.test.ts` 末尾追加:

```typescript
describe('isUnderRoot', () => {
  it('rootDir 自身视为在内', () => {
    expect(isUnderRoot('D:/proj', 'D:/proj')).toBe(true);
  });
  it('子路径(/ 风格)在内', () => {
    expect(isUnderRoot('D:/proj/sub', 'D:/proj')).toBe(true);
  });
  it('子路径(\\ 风格)在内', () => {
    expect(isUnderRoot('D:\\proj\\sub', 'D:\\proj')).toBe(true);
  });
  it('不同根不在内', () => {
    expect(isUnderRoot('/workspace/x', 'D:/proj')).toBe(false);
  });
  it('前缀匹配但非子目录:不在内(防 D:/projX 误判)', () => {
    expect(isUnderRoot('D:/projX', 'D:/proj')).toBe(false);
  });
});

describe('resolveCwdForRoot', () => {
  it('当前 cwd 在 rootDir 下:返回当前 cwd', () => {
    expect(resolveCwdForRoot('D:/proj/a', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/a');
  });
  it('当前 cwd 不在 + memory 在:返回 memory', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/m');
  });
  it('当前 cwd 不在 + memory 也不在:返回 rootDir', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', '/old/m')).toBe('D:/proj');
  });
  it('当前 cwd 不在 + 无 memory:返回 rootDir', () => {
    expect(resolveCwdForRoot('/workspace/x', 'D:/proj', null)).toBe('D:/proj');
  });
  it('当前 cwd 为空 + 有 memory:返回 memory', () => {
    expect(resolveCwdForRoot('', 'D:/proj', 'D:/proj/m')).toBe('D:/proj/m');
  });
  it('当前 cwd 为空 + 无 memory:返回 rootDir', () => {
    expect(resolveCwdForRoot('', 'D:/proj', null)).toBe('D:/proj');
  });
});
```

并在 import 处补 `isUnderRoot, resolveCwdForRoot`。

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/components/agentRuntime/filesUtils.test.ts`
Expected: 新加的 11 个 case 全部 FAIL(`isUnderRoot is not defined` 等)。

- [ ] **Step 4: 实现 isUnderRoot / resolveCwdForRoot**

在 `filesUtils.ts` 末尾追加:

```typescript
// 判断 cwd 是否在 rootDir 范围内(含 rootDir 自身;支持 / 和 \ 两种分隔符)。
// 注意防前缀误判:rootDir="D:/proj" 时 "D:/projX" 不算在内。
export function isUnderRoot(cwd: string, rootDir: string): boolean {
  if (!cwd || !rootDir) return false;
  if (cwd === rootDir) return true;
  return cwd.startsWith(rootDir + '/') || cwd.startsWith(rootDir + '\\');
}

// 决策:跨环境 / 空 cwd 时取记忆,记忆失效时兜底到 rootDir。
export function resolveCwdForRoot(
  currentCwd: string,
  rootDir: string,
  memoryCwd: string | null,
): string {
  if (currentCwd && isUnderRoot(currentCwd, rootDir)) return currentCwd;
  if (memoryCwd && isUnderRoot(memoryCwd, rootDir)) return memoryCwd;
  return rootDir;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/components/agentRuntime/filesUtils.test.ts`
Expected: 所有 case PASS(含原有 parentDir / isText)。

- [ ] **Step 6: 写 localStorage 包装的失败测试**

在 `filesUtils.test.ts` 继续追加:

```typescript
describe('cwd memory localStorage 包装', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('saveCwdMemory + loadCwdMemory 往返', () => {
    saveCwdMemory('D:/proj', 'D:/proj/sub');
    expect(loadCwdMemory('D:/proj')).toBe('D:/proj/sub');
  });
  it('loadCwdMemory 不存在返回 null', () => {
    expect(loadCwdMemory('D:/no')).toBeNull();
  });
  it('不同 rootDir 互不干扰', () => {
    saveCwdMemory('D:/proj', 'D:/proj/a');
    saveCwdMemory('/workspace', '/workspace/b');
    expect(loadCwdMemory('D:/proj')).toBe('D:/proj/a');
    expect(loadCwdMemory('/workspace')).toBe('/workspace/b');
  });
  it('saveCwdHistoryMemory + loadCwdHistoryMemory 往返', () => {
    saveCwdHistoryMemory('D:/proj', ['D:/proj/a', 'D:/proj/b']);
    expect(loadCwdHistoryMemory('D:/proj')).toEqual(['D:/proj/a', 'D:/proj/b']);
  });
  it('loadCwdHistoryMemory 不存在返回空数组', () => {
    expect(loadCwdHistoryMemory('D:/no')).toEqual([]);
  });
  it('loadCwdHistoryMemory 损坏 JSON 返回空数组(不抛)', () => {
    localStorage.setItem('agentlab.cwdHistory:D:/proj', 'not-json');
    expect(loadCwdHistoryMemory('D:/proj')).toEqual([]);
  });
});
```

import 处补 `saveCwdMemory, loadCwdMemory, saveCwdHistoryMemory, loadCwdHistoryMemory` 与 vitest 的 `beforeEach`。

- [ ] **Step 7: 跑测试确认失败**

Run: `npx vitest run src/components/agentRuntime/filesUtils.test.ts`
Expected: 新加的 6 个 case FAIL。

- [ ] **Step 8: 实现 localStorage 包装**

在 `filesUtils.ts` 末尾追加:

```typescript
// localStorage key 前缀:避免与其他应用冲突
const CWD_KEY_PREFIX = 'agentlab.cwd:';
const CWD_HIST_KEY_PREFIX = 'agentlab.cwdHistory:';

export function loadCwdMemory(rootDir: string): string | null {
  if (!rootDir) return null;
  return localStorage.getItem(CWD_KEY_PREFIX + rootDir);
}

export function saveCwdMemory(rootDir: string, cwd: string): void {
  if (!rootDir || !cwd) return;
  localStorage.setItem(CWD_KEY_PREFIX + rootDir, cwd);
}

export function loadCwdHistoryMemory(rootDir: string): string[] {
  if (!rootDir) return [];
  const raw = localStorage.getItem(CWD_HIST_KEY_PREFIX + rootDir);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCwdHistoryMemory(rootDir: string, hist: string[]): void {
  if (!rootDir) return;
  localStorage.setItem(CWD_HIST_KEY_PREFIX + rootDir, JSON.stringify(hist));
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `npx vitest run src/components/agentRuntime/filesUtils.test.ts`
Expected: 全部 PASS。

- [ ] **Step 10: Commit**

```bash
git add src/components/agentRuntime/filesUtils.ts src/components/agentRuntime/filesUtils.test.ts
git commit -m "feat(filesUtils): 加 isUnderRoot/resolveCwdForRoot 与 cwd-memory localStorage 包装"
```

---

### Task 2: agentRuntimeStore 改造(去 cwd 持久化 + 加 history setter)

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts:43, 60-61, 105-106, 241-247`(类型 + 初值 + selectAgent + setWorkspaceCwd)
- Modify: `src/stores/agentRuntimeStore.test.ts:102-117`(改写 2 个 case + 新增 1 个)

- [ ] **Step 1: 改写测试 — `setWorkspaceCwd` 不再写 cwd 字段**

替换 `agentRuntimeStore.test.ts:102-109` 为:

```typescript
it('setWorkspaceCwd 不再持久化 cwd 到 session(改用 localStorage,在 FilesPanel 里写)', async () => {
  updateSession.mockResolvedValue({});
  useAgentRuntimeStore.setState({ workspaceSessionId: 's1', workspaceCwdHistory: [] });
  useAgentRuntimeStore.getState().setWorkspaceCwd('D:/proj');
  expect(useAgentRuntimeStore.getState().workspaceCwd).toBe('D:/proj');
  expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual(['D:/proj']);
  expect(updateSession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ cwd: expect.anything() }));
  expect(updateSession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ cwdHistory: expect.anything() }));
});
```

- [ ] **Step 2: 改写测试 — `selectAgent` 不再恢复 cwd**

替换 `agentRuntimeStore.test.ts:111-117` 为:

```typescript
it('selectAgent 不再从 session 恢复 cwd(由 FilesPanel 从 localStorage 恢复)', async () => {
  querySessions.mockResolvedValue({ items: [{ id: 'sess-echo', agentId: 'echo' }], total: 1, page: 1, size: 20 });
  getSession.mockResolvedValue({ id: 'sess-echo', cwd: 'D:/restored', cwdHistory: ['D:/restored'], messages: [] });
  useAgentRuntimeStore.setState({ agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }], currentAgentId: null });
  await useAgentRuntimeStore.getState().selectAgent('echo');
  expect(useAgentRuntimeStore.getState().workspaceCwd).toBeNull();
  expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual([]);
});
```

- [ ] **Step 3: 新增测试 — `setWorkspaceCwdHistory` action**

在 Step 2 的 case 后追加:

```typescript
it('setWorkspaceCwdHistory 直接覆盖 history(用于从 localStorage 恢复)', () => {
  useAgentRuntimeStore.setState({ workspaceCwdHistory: ['old'] });
  useAgentRuntimeStore.getState().setWorkspaceCwdHistory(['a', 'b', 'c']);
  expect(useAgentRuntimeStore.getState().workspaceCwdHistory).toEqual(['a', 'b', 'c']);
});
```

- [ ] **Step 4: 跑 store 测试确认 3 个 case 失败**

Run: `npx vitest run src/stores/agentRuntimeStore.test.ts`
Expected: 步骤 1-3 的 3 个 case FAIL(updateSession 仍被调 / cwd 被恢复 / setWorkspaceCwdHistory 不存在)。

- [ ] **Step 5: 改 `setWorkspaceCwd` 实现**

替换 `agentRuntimeStore.ts:241-249` 现有 setWorkspaceCwd:

```typescript
  setWorkspaceCwd: (cwd) => {
    // 追加历史(去重,新 cwd 置顶,限 10);持久化由 FilesPanel 写 localStorage 处理
    const hist = [cwd, ...get().workspaceCwdHistory.filter(c => c !== cwd)].slice(0, 10);
    set({ workspaceCwd: cwd, workspaceCwdHistory: hist });
  },
  setWorkspaceCwdHistory: (hist) => {
    set({ workspaceCwdHistory: hist });
  },
```

(删掉原先 fire-and-forget `dbApi.updateSession({cwd, cwdHistory})` 那几行)

- [ ] **Step 6: 改 `selectAgent` 实现 — 不再读 session.cwd / cwdHistory**

替换 `agentRuntimeStore.ts:105-106`:

```typescript
      workspaceCwd: null,
      workspaceCwdHistory: [],
```

(原来是 `session?.cwd || null` / `session?.cwdHistory || []`)

- [ ] **Step 7: 类型更新 — Store 接口加 `setWorkspaceCwdHistory`**

在 `agentRuntimeStore.ts:43` 附近(`setWorkspaceCwd` 声明同处)加:

```typescript
  setWorkspaceCwdHistory: (hist: string[]) => void;
```

- [ ] **Step 8: 跑 store 测试确认全部通过**

Run: `npx vitest run src/stores/agentRuntimeStore.test.ts`
Expected: 全部 PASS。

- [ ] **Step 9: 跑 typecheck 确认无编译错误**

Run: `npm run typecheck`
Expected: PASS。若 FilesPanel 报 `setWorkspaceCwdHistory` 未用,正常 — 下个 task 用。

- [ ] **Step 10: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "refactor(agentRuntimeStore): cwd 持久化移交 localStorage,加 setWorkspaceCwdHistory"
```

---

### Task 3: FilesPanel 跨环境分支重写(取记忆 / 兜底 rootDir)

**Files:**
- Modify: `src/components/agentRuntime/FilesPanel.tsx:44-56`(useEffect 跨环境分支)

- [ ] **Step 1: 重写跨环境分支**

替换 FilesPanel.tsx:44-56 现有 useEffect:

```typescript
  useEffect(() => {
    if (!rootDir) return; // rootDir 未加载完,不做决策
    // 当前 cwd 在 rootDir 下 → 沿用;否则取 localStorage 记忆,失效则兜底 rootDir
    if (workspaceCwd && isUnderRoot(workspaceCwd, rootDir)) {
      setError('');
      setInput(workspaceCwd);
      load(workspaceCwd);
      return;
    }
    const memory = loadCwdMemory(rootDir);
    const next = resolveCwdForRoot(workspaceCwd || '', rootDir, memory);
    setError('');
    setWorkspaceCwd(next);
    // setWorkspaceCwd 触发 state 变化,会再次进入本 useEffect 走 isUnderRoot 分支
  }, [workspaceCwd, rootDir]);
```

并在 import 处加 `isUnderRoot, loadCwdMemory, resolveCwdForRoot`(与原有 `parentDir, isText` 同句)。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 3: 跑相关测试确认未破坏**

Run: `npx vitest run src/components/agentRuntime/`
Expected: PASS(filesUtils + CodeBlock + MessageBubble)。

- [ ] **Step 4: Commit**

```bash
git add src/components/agentRuntime/FilesPanel.tsx
git commit -m "refactor(FilesPanel): 跨环境 cwd 失效改取 localStorage 记忆,兜底 rootDir"
```

---

### Task 4: FilesPanel 写入 localStorage + history 恢复

**Files:**
- Modify: `src/components/agentRuntime/FilesPanel.tsx`(顶部加 store 选择器 + 两个新 useEffect)

- [ ] **Step 1: 顶部从 store 拿 setWorkspaceCwdHistory**

替换 FilesPanel.tsx:14 那一行:

```typescript
  const { workspaceCwd, workspaceCwdHistory, setWorkspaceCwd, setWorkspaceCwdHistory } = useAgentRuntimeStore();
```

- [ ] **Step 2: rootDir 加载后从 localStorage 恢复 history**

在现有 `useEffect(() => { ...获取 rootDir... }, [])` 之后追加新 useEffect:

```typescript
  // rootDir 变化(切环境 / 首次加载)→ 恢复该环境历史,覆盖内存中的旧环境历史
  useEffect(() => {
    if (!rootDir) return;
    setWorkspaceCwdHistory(loadCwdHistoryMemory(rootDir));
  }, [rootDir]);
```

import 处补 `loadCwdHistoryMemory`。

- [ ] **Step 3: workspaceCwd / history 变化时同步进 localStorage**

在 Step 2 的 useEffect 之后追加:

```typescript
  // 任意路径变化(switchDir/enterChild/goUp/历史下拉)统一写入 localStorage 当前环境记忆
  useEffect(() => {
    if (!rootDir || !workspaceCwd) return;
    if (!isUnderRoot(workspaceCwd, rootDir)) return; // 跨环境过渡态不写
    saveCwdMemory(rootDir, workspaceCwd);
  }, [workspaceCwd, rootDir]);

  useEffect(() => {
    if (!rootDir) return;
    saveCwdHistoryMemory(rootDir, workspaceCwdHistory);
  }, [workspaceCwdHistory, rootDir]);
```

import 处补 `saveCwdMemory, saveCwdHistoryMemory`(已有 `isUnderRoot` from Task 3)。

- [ ] **Step 4: typecheck + 跑测试**

Run: `npm run typecheck && npx vitest run`
Expected: PASS(已知预存在的失败测试除外:App.test/appStore/ChatInteraction/DetailModal/ToolInteractionDetails/sceneService — 这些与本任务无关,见 memory `project_preexisting-failing-tests.md`)。

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/FilesPanel.tsx
git commit -m "feat(FilesPanel): cwd / history 自动同步 localStorage 按 rootDir 隔离"
```

---

### Task 5: 浏览器端到端验证(用户参与)

**Files:** 无文件改动

按项目 CLAUDE.md "Verified Before Complete":启动 dev,用户在浏览器验证关键交互。

- [ ] **Step 1: 启动后端 + 前端(后台)**

```bash
# 后端
cd backend && .venv/Scripts/python.exe run_server.py &
# 前端
npm run dev &
```

(注:Windows 后端必须用 `run_server.py`,不能 `uvicorn` — 见 memory `project_windows-proactor-startup.md`)

- [ ] **Step 2: 用户验证 dev 环境记忆**

提示用户:
1. 打开 http://localhost:5173,选择 claude-sdk agent,切到 文件 tab
2. 切换到 `D:\我的个人区间\Projects\context-lab\backend` 之类的子目录
3. 刷新页面 → 工作目录应自动恢复到上一步的子目录
4. 历史下拉只含本次切过的几个目录

期待:✅ cwd 自动恢复 ✅ history 不丢

- [ ] **Step 3: 用户验证 docker 环境隔离**

提示用户:
1. 切换前端 baseUrl 指向 docker 后端(或在 docker 容器自己的前端访问),rootDir 变 `/workspace`
2. 应自动跳到 `/workspace`(无 dev 环境的 D: 路径残留 / 无报错)
3. 切到 `/workspace/sub` 之类
4. 切回 dev → 应自动恢复 dev 上次的 D: 路径,**不**是 `/workspace/sub`

期待:✅ 跨环境无残留 ✅ 各自独立记忆

- [ ] **Step 4: 等用户确认 OK**

用户确认后才标本计划 done。失败 → 收集现象,回到对应 Task 修。

- [ ] **Step 5: 收尾 — 停后台进程**

用户 OK 后:

```bash
# 停 dev 后台进程
# (TaskStop / kill 看实际启动方式)
```

无需 commit(本 task 无文件改动)。

---

## 自查记录

- **Spec 覆盖**:
  - localStorage 单一真相源 → Task 1(`saveCwdMemory/loadCwdMemory`)+ Task 4(写入 useEffect)✓
  - session.cwd 停止读写 → Task 2(setWorkspaceCwd 移除 dbApi、selectAgent 不读)✓
  - 跨环境失效改取记忆 / 兜底 rootDir → Task 3 ✓
  - history per-rootDir → Task 1(history 包装)+ Task 4(rootDir 变化时恢复)✓
  - 浏览器验证 → Task 5 ✓
- **Placeholder scan**:无 TBD/TODO,代码块完整。
- **类型一致性**:`setWorkspaceCwdHistory(hist: string[])` 在 Task 2 接口声明 + Task 4 调用一致;`isUnderRoot/resolveCwdForRoot/loadCwdMemory/saveCwdMemory/loadCwdHistoryMemory/saveCwdHistoryMemory` 命名贯穿一致。
- **预存在失败测试**:Task 4 步骤 4 已显式标注绕开(memory `project_preexisting-failing-tests.md`),不要误判为回归。

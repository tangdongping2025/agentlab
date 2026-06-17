# 设置页低风险整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让右上角设置页准确表达旧版 Chat 设置边界，并补充只读系统信息与当前 rootDir 的 cwd 记忆清理入口。

**Architecture:** 只改前端 `SettingsModal`，复用 `dbApi.fetchRootDir()` 获取 rootDir，直接读写已存在的 `agentlab.cwd:` / `agentlab.cwdHistory:` localStorage key。旧版 Chat 设置仍走原 `useAppStore` action，不改变运行时行为。

**Tech Stack:** React 18 + TypeScript + Zustand + Vite。

---

## Files

- Modify: `src/components/SettingsModal.tsx`
- No backend changes
- No schema changes

---

### Task 1: SettingsModal 低风险整理

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: 扩展 imports**

加入 `dbApi`：

```typescript
import { dbApi } from '../services/dbApi';
```

- [ ] **Step 2: 增加系统信息状态**

在组件内增加：

```typescript
const [rootDir, setRootDir] = React.useState('');
const [rootDirError, setRootDirError] = React.useState('');
const [memoryVersion, setMemoryVersion] = React.useState(0);
```

新增 helper：

```typescript
const cwdKey = rootDir ? `agentlab.cwd:${rootDir}` : '';
const cwdHistoryKey = rootDir ? `agentlab.cwdHistory:${rootDir}` : '';
const cwdMemory = cwdKey ? localStorage.getItem(cwdKey) : null;
const cwdHistoryMemory = cwdHistoryKey ? localStorage.getItem(cwdHistoryKey) : null;
```

- [ ] **Step 3: 打开弹窗时加载 rootDir**

```typescript
React.useEffect(() => {
  if (!isOpen) return;
  dbApi.fetchRootDir()
    .then(r => {
      setRootDir(r.root_dir);
      setRootDirError('');
    })
    .catch(err => {
      setRootDir('');
      setRootDirError(err instanceof Error ? err.message : '加载失败');
    });
}, [isOpen]);
```

- [ ] **Step 4: tabs 改为 system/context/api**

```typescript
const tabs = [
  { id: 'system', label: '系统信息', icon: 'ℹ️' },
  { id: 'context', label: '旧版 Chat', icon: '🧠' },
  { id: 'api', label: '旧版 API', icon: '🔑' },
] as const;
```

默认 `activeTab` 改为 `'system'`。

- [ ] **Step 5: 增加系统信息 tab UI**

在右侧内容区最前面加：

```tsx
{activeTab === 'system' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <SectionTitle>当前环境</SectionTitle>
    <InfoRow label="前端地址" value={window.location.origin} />
    <InfoRow label="Agent Runtime API" value="/api/agents" />
    <InfoRow label="后端 rootDir" value={rootDir || (rootDirError ? `加载失败：${rootDirError}` : '加载中...')} />

    <SectionTitle>工作目录记忆</SectionTitle>
    <InfoRow label="cwd key" value={cwdKey || '等待 rootDir'} />
    <InfoRow label="cwd 当前值" value={cwdMemory || '未记录'} />
    <InfoRow label="history key" value={cwdHistoryKey || '等待 rootDir'} />
    <InfoRow label="history 状态" value={cwdHistoryMemory ? '已记录' : '未记录'} />
    <button
      disabled={!rootDir}
      onClick={() => {
        if (!rootDir) return;
        localStorage.removeItem(`agentlab.cwd:${rootDir}`);
        localStorage.removeItem(`agentlab.cwdHistory:${rootDir}`);
        setMemoryVersion(v => v + 1);
      }}
      style={buttonStyle}
    >
      清除当前 rootDir 的工作目录记忆
    </button>
    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
      只清理浏览器 localStorage 中当前 rootDir 的 cwd/cwdHistory，不影响 MySQL 会话。
    </div>
  </div>
)}
```

`memoryVersion` 用于触发重新渲染读取 localStorage，变量本身无需展示。

- [ ] **Step 6: 给旧版 Chat 设置加范围提示**

在 context tab 顶部加入：

```tsx
<div style={noticeStyle}>这些设置仅影响旧版 Chat 实验页，不影响当前 Agent Runtime 智能体工作区。</div>
```

在上下文窗口大小下方加入说明：

```tsx
<div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-16px', marginBottom: '20px' }}>
  当前主要用于旧版 Chat 的显示/保存，不是 Agent Runtime 的真实模型窗口。
</div>
```

- [ ] **Step 7: 给旧版 API 设置加范围提示**

在 api tab 顶部加入同类提示：

```tsx
<div style={noticeStyle}>这些 API 设置仅影响旧版 Chat 实验页；Agent Runtime 使用后端环境变量配置。</div>
```

把 Base URL 下方说明改为：

```tsx
<div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>
  dev 环境真实代理目标由启动时 VITE_CLAUDE_BASE_URL / Vite proxy 决定；运行时修改这里不一定改变代理目标。
</div>
```

- [ ] **Step 8: 增加 InfoRow / style 常量**

文件底部增加：

```tsx
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13 }}>
      <div style={{ width: 110, flexShrink: 0, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
```

增加 `noticeStyle` / `buttonStyle` 常量。

- [ ] **Step 9: 验证**

Run:

```bash
npm run typecheck
npx vitest run src/components/agentRuntime/ src/stores/agentRuntimeStore.test.ts
```

Expected: PASS。

- [ ] **Step 10: 浏览器验证**

启动：

```bash
cd backend && .venv/Scripts/python.exe run_server.py
npm run dev
```

验证：
- 设置弹窗默认打开系统信息 tab。
- rootDir 可显示。
- 清除 cwd 记忆按钮可点击，localStorage 对应 key 删除。
- 旧版 Chat/API tab 仍能切换、原设置仍可点。

- [ ] **Step 11: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(settings): 标注旧版 Chat 范围并添加系统信息"
```

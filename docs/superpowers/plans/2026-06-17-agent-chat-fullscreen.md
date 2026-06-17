# 智能体对话窗口全屏化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent Runtime 主对话区增加全屏化能力，用户可在更大空间内查看对话并继续输入。

**Architecture:** 在 `ChatWorkspace` 内维护本地 `isFullscreen` 状态，抽取一份复用的对话面板渲染函数。常规模式渲染原布局；全屏模式用 fixed overlay 包裹同一份面板，保留消息、流式内容、事件、输入框、发送/停止和新对话行为。

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library, Vite。

---

## 文件结构

- Create: `src/components/agentRuntime/ChatWorkspace.test.tsx` — 覆盖全屏入口、保留输入框、Esc 退出。
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx` — 增加全屏状态、overlay、退出交互。
- Modify: `项目执行跟踪矩阵.md` — 增加 RQ 与时间线。

---

### Task 1: 写全屏交互测试

**Files:**
- Create: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests**

创建测试文件：

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChatWorkspace from './ChatWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

describe('ChatWorkspace fullscreen', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'assistant', name: '项目助手', description: '测试智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'assistant',
      workspaceMessages: [{ role: 'assistant', content: '已有回复' }],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
    });
  });

  it('opens fullscreen from header and keeps the input box', () => {
    render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));

    expect(screen.getByRole('button', { name: '退出全屏' })).toBeInTheDocument();
    expect(screen.getByText('已有回复')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument();
  });

  it('closes fullscreen with Escape', () => {
    render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '全屏' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: '退出全屏' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全屏' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx --run
```

Expected: FAIL because `全屏` button is missing.

- [ ] **Step 3: Commit test if desired**

测试可与实现同 commit；不单独提交也可以。

---

### Task 2: 实现 ChatWorkspace 全屏 overlay

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Add state and Escape handling**

在 `ChatWorkspace` 内新增：

```tsx
const [isFullscreen, setIsFullscreen] = useState(false);

useEffect(() => {
  if (!isFullscreen) return;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setIsFullscreen(false);
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [isFullscreen]);
```

- [ ] **Step 2: Extract reusable panel renderer**

把当前 return 内容抽成 `renderPanel(fullscreen: boolean)`，头部按钮区包含：

```tsx
<div style={{ display: 'flex', gap: 8 }}>
  <button onClick={() => setIsFullscreen(!fullscreen)} style={btnStyle}>{fullscreen ? '退出全屏' : '全屏'}</button>
  <button onClick={resetWorkspace} style={btnStyle}>新对话</button>
</div>
```

- [ ] **Step 3: Add fullscreen overlay**

常规 return 结构：

```tsx
<>
  {renderPanel(false)}
  {isFullscreen && (
    <div
      role="presentation"
      onClick={event => { if (event.target === event.currentTarget) setIsFullscreen(false); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 120, display: 'flex' }}
    >
      <div style={{ margin: 24, flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 18px 48px rgba(0,0,0,0.35)' }}>
        {renderPanel(true)}
      </div>
    </div>
  )}
</>
```

确保消息列表 `minHeight: 0`，输入区 `flexShrink: 0`。

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx --run
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(agent-runtime): 对话窗口支持全屏"
```

---

### Task 3: 验证与跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npm run test -- src/components/agentRuntime/ChatWorkspace.test.tsx src/components/agentRuntime/MessageBubble.test.tsx --run
```

Expected: PASS。

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS；build 可能保留既有 chunk size warning。

- [ ] **Step 3: Browser verification**

启动服务：

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab backend/.venv/Scripts/python.exe backend/run_server.py
npm run dev -- --host 127.0.0.1
```

在 `http://127.0.0.1:5173/` 验证：

- 对话头部显示“全屏”。
- 点击后主对话区覆盖页面，消息和输入框都保留。
- 全屏时可输入并发送。
- 点击“退出全屏”、Esc、遮罩均可退出。

- [ ] **Step 4: Update tracking matrix**

新增 RQ-042，引用本 spec 和 plan，记录验证结果。

- [ ] **Step 5: Commit tracking matrix**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录智能体对话窗口全屏化"
```

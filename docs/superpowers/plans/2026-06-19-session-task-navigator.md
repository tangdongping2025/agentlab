# 会话内任务浮层目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AgentRuntime 主工作台聊天窗口中增加右侧可收起任务浮层目录，从当前会话的每条用户消息中派生任务，并点击定位原始消息。

**Architecture:** 使用纯函数 `deriveSessionTasks(messages)` 从 `workspaceMessages` 的用户消息派生任务，不改 store、后端或数据库。新增 `SessionTaskNavigator` 渲染任务入口和右侧浮层，`ChatWorkspace` 只负责消息 ref、滚动定位和短暂高亮。

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library, Vite。

---

## File Structure

- Create: `src/components/agentRuntime/sessionTasks.ts`
  - 纯函数和类型：`ChatMessageLike`、`SessionTask`、`deriveSessionTasks()`。
  - 不依赖 React、Zustand、DOM 或后端。
- Create: `src/components/agentRuntime/sessionTasks.test.ts`
  - 覆盖用户消息识别、assistant 消息排除、message index、标题截断。
- Create: `src/components/agentRuntime/SessionTaskNavigator.tsx`
  - 渲染 `任务 N` 按钮、右侧浮层、任务项和空态。
  - 接收 `messages`、`activeMessageIndex`、`onJumpToMessage`。
- Create: `src/components/agentRuntime/SessionTaskNavigator.test.tsx`
  - 覆盖数量、标题、空态、点击回调和暖白样式。
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
  - 引入 `SessionTaskNavigator`。
  - 给消息外层增加可定位容器和高亮。
  - 实现 `scrollIntoView({ block: 'center' })`。
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
  - 覆盖任务入口、展开目录、点击任务定位和目标高亮。

---

### Task 1: Session Task Derivation

**Files:**
- Create: `src/components/agentRuntime/sessionTasks.test.ts`
- Create: `src/components/agentRuntime/sessionTasks.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/agentRuntime/sessionTasks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveSessionTasks } from './sessionTasks';

describe('deriveSessionTasks', () => {
  it('creates tasks from every user message', () => {
    const tasks = deriveSessionTasks([
      { role: 'user', content: '帮我实现会话内任务浮层目录' },
      { role: 'assistant', content: '好的' },
      { role: 'user', content: '这个功能是什么意思？' },
      { role: 'user', content: '可以使用 python 编一个五子棋游戏吗' },
    ]);

    expect(tasks).toEqual([
      {
        id: 'task-0',
        messageIndex: 0,
        taskNumber: 1,
        title: '帮我实现会话内任务浮层目录',
      },
      {
        id: 'task-2',
        messageIndex: 2,
        taskNumber: 2,
        title: '这个功能是什么意思？',
      },
      {
        id: 'task-3',
        messageIndex: 3,
        taskNumber: 3,
        title: '可以使用 python 编一个五子棋游戏吗',
      },
    ]);
  });

  it('does not create tasks from assistant messages', () => {
    const tasks = deriveSessionTasks([
      { role: 'assistant', content: '解释一下' },
    ]);

    expect(tasks).toEqual([]);
  });

  it('uses the first line as title and truncates long titles', () => {
    const tasks = deriveSessionTasks([
      {
        role: 'user',
        content: '优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验\n第二行细节',
      },
    ]);

    expect(tasks[0].title).toBe('优化这个特别特别特别特别特别特别特别特别特别特别长的聊天窗口定位体验…');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/sessionTasks.test.ts
```

Expected: FAIL because `./sessionTasks` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/agentRuntime/sessionTasks.ts`:

```ts
export interface ChatMessageLike {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionTask {
  id: string;
  messageIndex: number;
  taskNumber: number;
  title: string;
}

const MAX_TASK_TITLE_LENGTH = 36;

function createTaskTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= MAX_TASK_TITLE_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_TASK_TITLE_LENGTH)}…`;
}

export function deriveSessionTasks(messages: ChatMessageLike[]): SessionTask[] {
  const tasks: SessionTask[] = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== 'user') return;

    tasks.push({
      id: `task-${messageIndex}`,
      messageIndex,
      taskNumber: tasks.length + 1,
      title: createTaskTitle(message.content),
    });
  });

  return tasks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:run -- src/components/agentRuntime/sessionTasks.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/agentRuntime/sessionTasks.ts src/components/agentRuntime/sessionTasks.test.ts
git commit -m "$(cat <<'EOF'
feat(runtime): 派生会话内用户任务
EOF
)"
```

---

### Task 2: Session Task Navigator Component

**Files:**
- Create: `src/components/agentRuntime/SessionTaskNavigator.test.tsx`
- Create: `src/components/agentRuntime/SessionTaskNavigator.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/agentRuntime/SessionTaskNavigator.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SessionTaskNavigator from './SessionTaskNavigator';

describe('SessionTaskNavigator', () => {
  it('shows task count and derived task titles', () => {
    render(
      <SessionTaskNavigator
        messages={[
          { role: 'user', content: '帮我实现任务目录' },
          { role: 'assistant', content: '好的' },
          { role: 'user', content: '普通问题是什么？' },
          { role: 'user', content: '优化聊天定位体验' },
        ]}
        activeMessageIndex={null}
        onJumpToMessage={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '任务 3' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '任务 3' }));

    expect(screen.getByText('帮我实现任务目录')).toBeInTheDocument();
    expect(screen.getByText('普通问题是什么？')).toBeInTheDocument();
    expect(screen.getByText('优化聊天定位体验')).toBeInTheDocument();
    expect(screen.getByText('第 1 条用户任务')).toBeInTheDocument();
    expect(screen.getByText('第 2 条用户任务')).toBeInTheDocument();
    expect(screen.getByText('第 3 条用户任务')).toBeInTheDocument();
  });

  it('shows an empty state when there are no user messages', () => {
    render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '这是什么？' }]}
        activeMessageIndex={null}
        onJumpToMessage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 0' }));

    expect(screen.getByText('本会话暂无用户任务')).toBeInTheDocument();
  });

  it('calls onJumpToMessage when clicking a task item', () => {
    const onJumpToMessage = vi.fn();

    render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '修改聊天窗口' }]}
        activeMessageIndex={null}
        onJumpToMessage={onJumpToMessage}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 1' }));
    fireEvent.click(screen.getByRole('button', { name: /修改聊天窗口/ }));

    expect(onJumpToMessage).toHaveBeenCalledWith(0);
  });

  it('uses warm floating panel styles', () => {
    const { container } = render(
      <SessionTaskNavigator
        messages={[{ role: 'user', content: '新增任务目录' }]}
        activeMessageIndex={0}
        onJumpToMessage={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '任务 1' }));

    const panel = container.querySelector('[data-testid="session-task-panel"]') as HTMLElement;
    const item = screen.getByRole('button', { name: /新增任务目录/ }) as HTMLElement;

    expect(panel.style.background).toBe('rgb(237, 232, 223)');
    expect(item.style.background).toBe('rgb(255, 255, 255)');
    expect(item.style.border).toContain('rgb(37, 99, 235)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/SessionTaskNavigator.test.tsx
```

Expected: FAIL because `./SessionTaskNavigator` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/agentRuntime/SessionTaskNavigator.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { deriveSessionTasks, type ChatMessageLike } from './sessionTasks';

interface Props {
  messages: ChatMessageLike[];
  activeMessageIndex: number | null;
  onJumpToMessage: (messageIndex: number) => void;
}

const SessionTaskNavigator: React.FC<Props> = ({ messages, activeMessageIndex, onJumpToMessage }) => {
  const [expanded, setExpanded] = useState(false);
  const tasks = useMemo(() => deriveSessionTasks(messages), [messages]);

  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        style={{
          border: '1px solid #D6CFC4',
          borderRadius: 999,
          background: '#FFFFFF',
          color: '#1A1A1A',
          cursor: 'pointer',
          fontSize: 12,
          padding: '5px 10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}
      >
        任务 {tasks.length}
      </button>

      {expanded && (
        <div
          data-testid="session-task-panel"
          style={{
            width: 208,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#EDE8DF',
            border: '1px solid #D6CFC4',
            borderRadius: 12,
            padding: 10,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>本会话任务</div>
          {tasks.length === 0 && (
            <div style={{ fontSize: 12, color: '#555555', lineHeight: 1.5 }}>本会话暂无用户任务</div>
          )}
          {tasks.map(task => {
            const active = task.messageIndex === activeMessageIndex;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onJumpToMessage(task.messageIndex)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'block',
                  border: `1px solid ${active ? '#2563EB' : '#D6CFC4'}`,
                  borderRadius: 8,
                  background: '#FFFFFF',
                  color: '#1A1A1A',
                  cursor: 'pointer',
                  padding: '8px 9px',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 650, lineHeight: 1.4 }}>
                  {task.taskNumber}. {task.title}
                </div>
                <div style={{ fontSize: 11, color: '#555555', marginTop: 3 }}>第 {task.taskNumber} 条用户任务</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SessionTaskNavigator;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:run -- src/components/agentRuntime/SessionTaskNavigator.test.tsx src/components/agentRuntime/sessionTasks.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/agentRuntime/SessionTaskNavigator.tsx src/components/agentRuntime/SessionTaskNavigator.test.tsx
git commit -m "$(cat <<'EOF'
feat(runtime): 新增会话任务浮层目录
EOF
)"
```

---

### Task 3: ChatWorkspace Jump and Highlight Integration

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`

- [ ] **Step 1: Write the failing test**

Modify `src/components/agentRuntime/ChatWorkspace.test.tsx` imports and add a test inside `describe('ChatWorkspace fullscreen', () => { ... })`.

Change the first import from:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

to:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

Add this after the existing Yuanbao warm style test:

```tsx
  it('opens the session task navigator and jumps to the original user message', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    useAgentRuntimeStore.setState({
      agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'claude-sdk',
      workspaceMessages: [
        { role: 'user', content: '帮我实现任务目录' },
        { role: 'assistant', content: '可以' },
        { role: 'user', content: '这个是什么？' },
        { role: 'user', content: '优化定位体验' },
      ],
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceRunning: false,
      workspaceAbortController: null,
    });

    const { container } = render(<ChatWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: '任务 3' }));
    fireEvent.click(screen.getByRole('button', { name: /优化定位体验/ }));

    const target = container.querySelector('[data-message-index="3"]') as HTMLElement;

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(target.style.border).toContain('rgb(37, 99, 235)');
    expect(target.style.background).toBe('rgba(37, 99, 235, 0.08)');

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
```

If the test file does not use `afterEach`, remove `afterEach` from the import after implementing. Do not leave unused imports.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: FAIL because `ChatWorkspace` does not render `任务 3` yet.

- [ ] **Step 3: Write minimal implementation**

Modify `src/components/agentRuntime/ChatWorkspace.tsx`.

Change imports from:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import MessageBubble from './MessageBubble';
```

to:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import MessageBubble from './MessageBubble';
import SessionTaskNavigator from './SessionTaskNavigator';
```

Inside `ChatWorkspace`, after `const scrollRef = useRef<HTMLDivElement>(null);`, add:

```tsx
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
```

Before `const lastIdx = workspaceMessages.length - 1;`, add:

```tsx
  const jumpToMessage = (messageIndex: number) => {
    const target = messageRefs.current[messageIndex];
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    setActiveMessageIndex(messageIndex);
    window.setTimeout(() => {
      setActiveMessageIndex(current => current === messageIndex ? null : current);
    }, 1400);
  };
```

In `renderPanel`, change the message viewport wrapper from:

```tsx
      <div data-testid="chat-message-viewport" ref={fullscreen ? undefined : scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
        {workspaceMessages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            content={m.content}
            onRegenerate={m.role === 'assistant' && i === lastIdx && !workspaceRunning ? regenerateLast : undefined}
          />
        ))}
```

to:

```tsx
      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#F5F1EB' }}>
        <SessionTaskNavigator
          messages={workspaceMessages}
          activeMessageIndex={activeMessageIndex}
          onJumpToMessage={jumpToMessage}
        />
        <div data-testid="chat-message-viewport" ref={fullscreen ? undefined : scrollRef} style={{ height: '100%', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
        {workspaceMessages.map((m, i) => (
          <div
            key={i}
            data-message-index={i}
            ref={node => { messageRefs.current[i] = node; }}
            style={{
              border: activeMessageIndex === i ? '1px solid #2563EB' : '1px solid transparent',
              borderRadius: 14,
              background: activeMessageIndex === i ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
              transition: 'background 160ms ease, border-color 160ms ease',
            }}
          >
            <MessageBubble
              role={m.role}
              content={m.content}
              onRegenerate={m.role === 'assistant' && i === lastIdx && !workspaceRunning ? regenerateLast : undefined}
            />
          </div>
        ))}
```

After the existing `workspaceEvents.length > 0` block, close the two wrappers correctly:

```tsx
        {workspaceEvents.length > 0 && (
          <div style={{ alignSelf: 'stretch', background: 'var(--bg-deep)', borderRadius: 8, padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {workspaceEvents.map((e, i) => <div key={i}>• {e.label}</div>)}
          </div>
        )}
        </div>
      </div>
```

The complete middle portion of `renderPanel` should preserve the existing header, streaming message, events block, and input area.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx src/components/agentRuntime/SessionTaskNavigator.test.tsx src/components/agentRuntime/sessionTasks.test.ts
```

Expected: PASS, all tests in these files.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "$(cat <<'EOF'
feat(runtime): 接入会话任务定位
EOF
)"
```

---

### Task 4: Regression, Tracking Matrix, and Browser Verification

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/sessionTasks.test.ts src/components/agentRuntime/SessionTaskNavigator.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx src/components/agentRuntime/DefaultWorkbenchMode.test.tsx src/components/agentRuntime/YuanbaoWarmTheme.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Update tracking matrix**

Modify `项目执行跟踪矩阵.md`.

Update summary counts by adding one requirement:

```md
- **总数**：55
- **已完成**：47
- **进行中**：8
```

Add this row after RQ-056:

```md
| RQ-057 | 会话内任务浮层目录 | [`2026-06-19-session-task-navigator-design.md`](docs/superpowers/specs/2026-06-19-session-task-navigator-design.md) | [`2026-06-19-session-task-navigator.md`](docs/superpowers/plans/2026-06-19-session-task-navigator.md) | ✅ | 🔍 浏览器验收待确认 |
```

- [ ] **Step 4: Commit tracking matrix**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "$(cat <<'EOF'
docs(tracking): 补录会话内任务浮层目录
EOF
)"
```

- [ ] **Step 5: Start or reuse dev server for browser verification**

If the existing Vite dev server is still running, use it. If not, start one:

```bash
npm run dev -- --host 127.0.0.1 --port 5310
```

Expected: Vite reports a local URL, possibly a fallback port if 5310 is occupied.

- [ ] **Step 6: Browser verification checklist**

Open the AgentRuntime main workspace and verify:

- Default workbench still enters Claude SDK chat workspace.
- The chat window shows a `任务 N` button near the top-right of the message area.
- The `任务 N` button remains visible while scrolling a long chat.
- Sending or loading user messages makes them appear in the task floating panel.
- Ordinary questions also appear in the task panel as user tasks.
- Clicking a task item scrolls to the original user message.
- The target user message is briefly highlighted.
- Warm theme still matches the Yuanbao-style chat surface.
- Left and right sidebars remain collapsed by default.

Do not mark browser verification complete until the user confirms the interaction is OK.

- [ ] **Step 7: Commit only if verification changes were needed**

If browser verification required code or docs changes, commit the exact touched files with a focused message. If no changes were needed, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: Task 1 covers task derivation rules; Task 2 covers floating task panel and empty state; Task 3 covers ChatWorkspace positioning, scroll, and highlight; Task 4 covers regression, tracking, and browser verification.
- Scope: no backend, database, prompt, history page, or settings changes are included.
- Type consistency: `ChatMessageLike`, `SessionTask`, `deriveSessionTasks`, `SessionTaskNavigator`, `activeMessageIndex`, and `onJumpToMessage` are consistently named across tasks.
- Placeholder scan: no placeholder implementation steps remain.

# Yuanbao Warm Chat Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AgentRuntime main workbench use a Yuanbao-inspired warm white chat theme without changing history, settings, backend, prompts, or data structures.

**Architecture:** Keep the existing component boundaries and inline-style pattern. Add only focused warm-theme style changes in AgentRuntime-related components, plus tests that assert key visual tokens and existing default-workbench behavior still exist.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, Testing Library.

---

## File Structure

- Modify: `src/components/agentRuntime/MessageBubble.tsx` — apply warm white assistant card and warm gray user bubble.
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx` — update/add visual assertions for assistant and user message colors.
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx` — apply warm chat panel, message viewport, input area, input field, and send button styles.
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx` — add warm-theme assertions for panel/input/send button.
- Modify: `src/components/agentRuntime/Markdown.tsx` — apply warm Markdown blockquote/table/inline-code/link styling.
- Modify: `src/components/agentRuntime/CodeBlock.tsx` — align code block dark background and radius with the spec.
- Create: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx` — focused tests for Markdown, CodeBlock, sidebars, status bar, and runtime shell visual tokens.
- Modify: `src/components/agentRuntime/AgentRuntimeView.tsx` — use warm background for the workbench shell.
- Modify: `src/components/agentRuntime/AgentLibrary.tsx` — use warm gray/white sidebar colors in collapsed and expanded states.
- Modify: `src/components/agentRuntime/AssistantSidebar.tsx` — use warm gray/white sidebar colors in collapsed and expanded states.
- Modify: `src/components/agentRuntime/ObservabilityBar.tsx` — use warm white/warm gray status bar colors while preserving summary content.
- Modify: `项目执行跟踪矩阵.md` — add RQ-056 after verification.

## Task 1: Warm Message Bubbles and Chat Input

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Add failing tests for warm message bubbles**

In `src/components/agentRuntime/MessageBubble.test.tsx`, replace the existing assistant card background assertion with the Yuanbao warm values and add a user bubble assertion:

```tsx
it('AI assistant card uses the Yuanbao warm white reading background', () => {
  const { container } = render(<MessageBubble role="assistant" content="正文" />);

  const card = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;
  expect(card).toBeTruthy();
  expect(card.style.background).toBe('rgb(255, 255, 255)');
  expect(card.style.border).toContain('rgb(214, 207, 196)');
  expect(card.style.borderRadius).toBe('12px');
});

it('user message uses the Yuanbao warm gray bubble', () => {
  const { container } = render(<MessageBubble role="user" content="hello" />);

  const bubble = container.querySelector('[data-testid="user-message-bubble"]') as HTMLElement;
  expect(bubble).toBeTruthy();
  expect(bubble.style.background).toBe('rgb(232, 226, 217)');
  expect(bubble.style.color).toBe('rgb(26, 26, 26)');
  expect(bubble.style.borderRadius).toBe('18px 18px 4px');
});
```

- [ ] **Step 2: Add failing tests for warm chat input area**

In `src/components/agentRuntime/ChatWorkspace.test.tsx`, add this test inside the existing `describe('ChatWorkspace fullscreen', () => { ... })` block:

```tsx
it('uses Yuanbao warm chat panel and input styles', () => {
  const { container } = render(<ChatWorkspace />);

  const panel = container.querySelector('[data-testid="chat-workspace-panel"]') as HTMLElement;
  const viewport = container.querySelector('[data-testid="chat-message-viewport"]') as HTMLElement;
  const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement;
  const sendButton = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;

  expect(panel.style.background).toBe('rgb(245, 241, 235)');
  expect(viewport.style.background).toBe('rgb(245, 241, 235)');
  expect(input.style.background).toBe('rgb(255, 255, 255)');
  expect(input.style.border).toContain('rgb(214, 207, 196)');
  expect(input.style.borderRadius).toBe('24px');
  expect(sendButton.style.background).toBe('rgb(37, 99, 235)');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: FAIL because current assistant card uses `#fbfcff`, user bubble uses blue, and `ChatWorkspace` does not expose the new test IDs or warm input styles.

- [ ] **Step 4: Implement warm message bubble styles**

In `src/components/agentRuntime/MessageBubble.tsx`, change the assistant card style to:

```tsx
style={{
  flex: 1,
  minWidth: 0,
  background: '#FFFFFF',
  color: '#1A1A1A',
  border: '1px solid #D6CFC4',
  borderRadius: 12,
  padding: '16px 20px 12px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
}}
```

Change the user message return block to include `data-testid="user-message-bubble"` and this style:

```tsx
<div
  data-testid="user-message-bubble"
  style={{
    alignSelf: 'flex-end',
    maxWidth: '80%',
    padding: '12px 18px',
    borderRadius: '18px 18px 4px 18px',
    background: '#E8E2D9',
    color: '#1A1A1A',
    fontSize: 15,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }}
>
  {content}
</div>
```

- [ ] **Step 5: Implement warm chat panel and input styles**

In `src/components/agentRuntime/ChatWorkspace.tsx`:

Change `btnStyle` to:

```tsx
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 999, border: '1px solid #2563EB',
  background: '#2563EB', color: '#fff', cursor: 'pointer', fontSize: 12,
};
```

Add `data-testid="chat-workspace-panel"` to the outer panel returned by `renderPanel` and change its background:

```tsx
<div data-testid="chat-workspace-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
```

Change the header style to use warm colors:

```tsx
<div style={{ padding: '10px 16px', borderBottom: '1px solid #D6CFC4', background: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
```

Add `data-testid="chat-message-viewport"` to the message viewport and set its background:

```tsx
<div ref={fullscreen ? undefined : scrollRef} data-testid="chat-message-viewport" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
```

Change the input-area wrapper style to:

```tsx
<div style={{ padding: 12, borderTop: '1px solid #D6CFC4', background: '#F5F1EB', display: 'flex', gap: 8, flexShrink: 0 }}>
```

Change the input style to:

```tsx
style={{ flex: 1, padding: '10px 18px', borderRadius: 24, border: '1px solid #D6CFC4', background: '#FFFFFF', color: '#1A1A1A', fontSize: 14 }}
```

Keep the existing send/stop behavior, only let the normal send button use `#2563EB` and stop button keep red.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(chat): 应用元宝暖白消息与输入样式"
```

## Task 2: Warm Markdown and Code Blocks

**Files:**
- Modify: `src/components/agentRuntime/Markdown.tsx`
- Modify: `src/components/agentRuntime/CodeBlock.tsx`
- Create: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`

- [ ] **Step 1: Add failing tests for Markdown and CodeBlock warm tokens**

Create `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Markdown from './Markdown';
import CodeBlock from './CodeBlock';

describe('Yuanbao warm theme details', () => {
  it('uses warm markdown quote, table, link, and inline code styles', () => {
    const { container } = render(
      <Markdown content={'> 引用\n\n| 维度 | 说明 |\n|---|---|\n| A | B |\n\n[链接](https://example.com)\n\n`inline`'} />
    );

    const quote = container.querySelector('blockquote') as HTMLElement;
    const th = container.querySelector('th') as HTMLElement;
    const link = container.querySelector('a') as HTMLElement;
    const inlineCode = container.querySelector('p code') as HTMLElement;

    expect(quote.style.borderLeft).toContain('rgb(214, 207, 196)');
    expect(quote.style.color).toBe('rgb(85, 85, 85)');
    expect(th.style.background).toBe('rgb(237, 232, 223)');
    expect(link.style.color).toBe('rgb(37, 99, 235)');
    expect(inlineCode.style.background).toBe('rgb(237, 232, 223)');
  });

  it('uses a dark rounded code block compatible with warm chat cards', () => {
    const { container } = render(<CodeBlock language="ts" code="const a = 1;" />);

    const wrapper = container.firstElementChild as HTMLElement;
    const header = wrapper.firstElementChild as HTMLElement;

    expect(wrapper.style.borderRadius).toBe('8px');
    expect(header.style.background).toBe('rgb(30, 30, 30)');
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/YuanbaoWarmTheme.test.tsx
```

Expected: FAIL because current Markdown quote/table/inline-code and CodeBlock header do not use the new warm/dark tokens.

- [ ] **Step 3: Implement Markdown warm styles**

In `src/components/agentRuntime/Markdown.tsx`:

Change `markdownStyle` to:

```tsx
const markdownStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: '#1A1A1A',
  fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif',
};
```

Change heading color in `headingStyle` to `#1A1A1A`.

Change `tableCellStyle.border` to:

```tsx
border: '1px solid #D6CFC4',
```

Change `strong` style color to `#1A1A1A`; keep the yellow highlight so重点仍明显.

Change `blockquote` style to:

```tsx
<blockquote style={{
  margin: '12px 0',
  padding: '8px 12px 8px 14px',
  borderLeft: '4px solid #D6CFC4',
  background: 'transparent',
  borderRadius: 0,
  color: '#555555',
}}>
```

Change `hr` border color to `#D6CFC4`.

Change link style to:

```tsx
style={{ color: '#2563EB', textDecoration: 'none' }}
```

Change `th` background to `#EDE8DF`.

Change inline code return style to:

```tsx
return <code className={className} style={{ background: '#EDE8DF', color: '#1A1A1A', padding: '1px 5px', borderRadius: 4, fontSize: 13 }} {...props}>{children}</code>;
```

- [ ] **Step 4: Implement CodeBlock dark style**

In `src/components/agentRuntime/CodeBlock.tsx`, change the wrapper and header/customStyle to:

```tsx
<div style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2A2A' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: '#1E1E1E', color: '#D4D4D4', fontSize: 11 }}>
```

and:

```tsx
customStyle={{ margin: 0, fontSize: 13, background: '#1E1E1E' }}
codeTagProps={{ style: { fontFamily: '"SF Mono", "Fira Code", Consolas, monospace' } }}
```

Change the copy button color to `#D4D4D4`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/agentRuntime/Markdown.tsx src/components/agentRuntime/CodeBlock.tsx src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(chat): 适配元宝暖白 Markdown 与代码块"
```

## Task 3: Warm Workbench Shell, Sidebars, and Status Bar

**Files:**
- Modify: `src/components/agentRuntime/AgentRuntimeView.tsx`
- Modify: `src/components/agentRuntime/AgentLibrary.tsx`
- Modify: `src/components/agentRuntime/AssistantSidebar.tsx`
- Modify: `src/components/agentRuntime/ObservabilityBar.tsx`
- Modify: `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`
- Modify: `src/components/agentRuntime/DefaultWorkbenchMode.test.tsx`

- [ ] **Step 1: Add failing tests for shell, sidebars, and status bar**

Append these tests to `src/components/agentRuntime/YuanbaoWarmTheme.test.tsx`:

```tsx
import AgentRuntimeView from './AgentRuntimeView';
import AgentLibrary from './AgentLibrary';
import AssistantSidebar from './AssistantSidebar';
import ObservabilityBar from './ObservabilityBar';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import { vi, beforeEach } from 'vitest';

vi.mock('../../services/agentRuntimeApi', () => ({
  listAgents: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock('../../services/dbApi', () => ({
  dbApi: {
    querySessions: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    getSession: vi.fn(),
  },
}));

beforeEach(() => {
  useAgentRuntimeStore.setState({
    agents: [{ id: 'claude-sdk', name: 'Claude SDK Agent', description: 'SDK agent', workspace: { type: 'chat' }, capabilities: ['Read', 'Edit', 'Bash', 'WebSearch'] }],
    currentAgentId: 'claude-sdk',
    workspaceMessages: [],
    workspaceStreaming: '',
    workspaceEvents: [],
    workspaceObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
    workspaceRunning: false,
    workspaceCwd: null,
    assistantMessages: [],
    assistantStreaming: '',
    assistantEvents: [],
    assistantObservability: { steps: [], tokenUsage: { input: 0, output: 0 }, strategyEffect: null },
    assistantRunning: false,
  });
});

it('uses warm workbench shell background', () => {
  const { container } = render(<AgentRuntimeView />);
  const shell = container.querySelector('[data-testid="agent-runtime-shell"]') as HTMLElement;

  expect(shell.style.background).toBe('rgb(245, 241, 235)');
});

it('uses warm collapsed sidebar rails', () => {
  const { container: left } = render(<AgentLibrary />);
  const { container: right } = render(<AssistantSidebar />);

  expect((left.firstElementChild as HTMLElement).style.background).toBe('rgb(237, 232, 223)');
  expect((right.firstElementChild as HTMLElement).style.background).toBe('rgb(237, 232, 223)');
});

it('uses warm status bar while preserving useful default summary', () => {
  const { container } = render(<ObservabilityBar />);
  const bar = container.firstElementChild as HTMLElement;

  expect(bar.style.background).toBe('rgb(237, 232, 223)');
  expect(container.textContent).toContain('消息 0');
  expect(container.textContent).toContain('默认沙箱');
  expect(container.textContent).toContain('等待首次运行');
});
```

- [ ] **Step 2: Run shell/theme tests to verify they fail**

Run:

```bash
npm run test:run -- src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/components/agentRuntime/DefaultWorkbenchMode.test.tsx
```

Expected: FAIL because shell lacks `data-testid="agent-runtime-shell"` and sidebars/status bar still use existing CSS variables.

- [ ] **Step 3: Implement warm workbench shell**

In `src/components/agentRuntime/AgentRuntimeView.tsx`, change the root div to:

```tsx
<div data-testid="agent-runtime-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F1EB' }}>
```

- [ ] **Step 4: Implement warm sidebars**

In `src/components/agentRuntime/AgentLibrary.tsx`:

For collapsed rail, change background and border:

```tsx
<div style={{ width: 32, background: '#EDE8DF', borderRight: '1px solid #D6CFC4', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
```

For expanded wrapper, change:

```tsx
<div style={{ width, background: '#EDE8DF', borderRight: '1px solid #D6CFC4', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
```

For agent card default background and selected background, use:

```tsx
background: currentAgentId === a.id ? '#FFFFFF' : '#F5F1EB',
border: `1px solid ${currentAgentId === a.id ? '#2563EB' : '#D6CFC4'}`,
```

In `src/components/agentRuntime/AssistantSidebar.tsx`:

For collapsed rail, use:

```tsx
<div style={{ width: 32, background: '#EDE8DF', borderLeft: '1px solid #D6CFC4', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
```

For expanded wrapper/header/input area, use warm backgrounds and `#D6CFC4` borders. The assistant message list background should be `#F5F1EB`, assistant response bubble `#FFFFFF`, user bubble `#E8E2D9`, input white with 24px radius.

- [ ] **Step 5: Implement warm status bar**

In `src/components/agentRuntime/ObservabilityBar.tsx`:

Change `baseStyle` to:

```tsx
const baseStyle: React.CSSProperties = {
  borderTop: '1px solid #D6CFC4', background: '#EDE8DF',
  flexShrink: 0, display: 'flex', flexDirection: 'column',
};
```

Keep all summary labels from RQ-055 unchanged. Update select/button borders and expanded panel borders from `var(--border-subtle)` / `var(--border-default)` to `#D6CFC4`, and expanded panel background where needed to `#FFFFFF`.

- [ ] **Step 6: Run focused shell/status tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/components/agentRuntime/DefaultWorkbenchMode.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/components/agentRuntime/AgentRuntimeView.tsx src/components/agentRuntime/AgentLibrary.tsx src/components/agentRuntime/AssistantSidebar.tsx src/components/agentRuntime/ObservabilityBar.tsx src/components/agentRuntime/YuanbaoWarmTheme.test.tsx src/components/agentRuntime/DefaultWorkbenchMode.test.tsx
git commit -m "feat(runtime): 应用元宝暖白工作台外壳"
```

## Task 4: Verification, Tracking, and Browser Check

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run focused test suite**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx src/components/agentRuntime/DefaultWorkbenchMode.test.tsx src/components/agentRuntime/YuanbaoWarmTheme.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Update tracking matrix**

In `项目执行跟踪矩阵.md`, update summary:

```md
- **总数**：54
- **已完成**：47
- **进行中**：7
```

Add this row after RQ-055:

```md
| RQ-056 | 元宝暖白聊天主题 | [`2026-06-19-yuanbao-warm-chat-theme-design.md`](docs/superpowers/specs/2026-06-19-yuanbao-warm-chat-theme-design.md) | [`2026-06-19-yuanbao-warm-chat-theme.md`](docs/superpowers/plans/2026-06-19-yuanbao-warm-chat-theme.md) | ✅ | 🔍 浏览器验收待确认 |
```

- [ ] **Step 4: Commit tracking update**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录元宝暖白聊天主题"
```

- [ ] **Step 5: Browser verification**

Open the running frontend at the active Vite URL.

Expected:
- Default Claude SDK workbench uses warm white background.
- Left and right sidebars are collapsed by default and use warm gray rails.
- Assistant messages are white cards with dark text.
- User messages are warm gray bubbles with dark text.
- Input box is white with warm gray border and rounded shape.
- Send button remains blue.
- Markdown quote/table/link/inline-code/code-block content remains readable.
- Bottom status bar still shows current agent, state, message count, capabilities, sandbox/default directory, and Token state.

## Self-Review

- Spec coverage: All AgentRuntime components named in the spec are covered by Tasks 1-3; tracking and browser verification are covered by Task 4.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: Test IDs and component names match current files; no backend or data structure changes are introduced.

# ChatWorkspace 对话窗口专业化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ChatWorkspace 从朴素文本气泡升级为专业对话窗口(markdown 渲染 + 代码块高亮复制 + 流式平滑 + 消息操作栏 + LaTeX + 头像卡片 + 字号规范),参考 deepseek。

**Architecture:** 抽 3 个小组件:`CodeBlock`(react-syntax-highlighter 高亮 + 复制)、`Markdown`(react-markdown + remark-gfm + remark-math + rehype-katex,code 组件走 CodeBlock)、`MessageBubble`(角色头像 + 内容 + 操作栏)。ChatWorkspace 用 MessageBubble 渲染,AI 走 Markdown / 用户纯文本。store 加 `regenerateLast`。

**Tech Stack:** React 18 + react-markdown@10 + remark-gfm(已有)+ react-syntax-highlighter + remark-math + rehype-katex + katex(新);vitest + @testing-library/react 测试。

**关键约束(来自 spec `2026-06-16-chat-workspace-pro-design.md`):**
- 不做逐字延迟打字机(delta 流式即打字机);流式渲染用 memo 稳定防闪
- 代码块横向滚动不换行;字号:消息 14 / 代码·输入 13
- 重新生成替换最后一条 assistant(不追加)
- 用户消息不渲染 markdown(原样纯文本)

---

### Task 1: 安装新依赖

- [ ] **Step 1: 安装**

Run(项目根):
```bash
npm install react-syntax-highlighter @types/react-syntax-highlighter remark-math rehype-katex katex
```
Expected: 安装成功,package.json 加 5 项(react-syntax-highlighter / @types / remark-math / rehype-katex / katex)

- [ ] **Step 2: typecheck 确认无破坏**

Run: `npm run typecheck`
Expected: 无错

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(chat-pro): 加依赖 react-syntax-highlighter/remark-math/rehype-katex/katex"
```

---

### Task 2: CodeBlock 组件(高亮 + 复制)

**Files:**
- Create: `src/components/agentRuntime/CodeBlock.tsx`
- Create: `src/components/agentRuntime/CodeBlock.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/agentRuntime/CodeBlock.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('renders language label + code', () => {
    render(<CodeBlock language="python" code="print('hi')" />);
    expect(screen.getByText('python')).toBeTruthy();
  });
  it('copy button writes code to clipboard', () => {
    render(<CodeBlock language="js" code="const x = 1" />);
    fireEvent.click(screen.getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1');
  });
  it('shows 已复制 after click', () => {
    render(<CodeBlock language="js" code="x" />);
    fireEvent.click(screen.getByText('复制'));
    expect(screen.getByText('已复制')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/agentRuntime/CodeBlock.test.tsx`
Expected: FAIL —— CodeBlock 不存在

- [ ] **Step 3: 实现 CodeBlock.tsx**

```typescript
import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 不可用时静默 */ }
  };
  return (
    <div style={{ margin: '8px 0', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: '#282c34', color: '#abb2bf', fontSize: 11 }}>
        <span>{language || 'text'}</span>
        <button onClick={copy} style={{ background: 'transparent', border: 'none', color: '#abb2bf', cursor: 'pointer', fontSize: 11, padding: 0 }}>{copied ? '已复制' : '复制'}</button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, fontSize: 13, background: '#282c34' }}
        codeTagProps={{ style: { fontFamily: 'monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/agentRuntime/CodeBlock.test.tsx`
Expected: PASS(3)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/CodeBlock.tsx src/components/agentRuntime/CodeBlock.test.tsx
git commit -m "feat(chat-pro): CodeBlock 代码块高亮 + 复制"
```

---

### Task 3: Markdown 组件(react-markdown + katex + CodeBlock)

**Files:**
- Create: `src/components/agentRuntime/Markdown.tsx`

> 说明:react-markdown@10 的 `code` 组件收 `{ className, children, ...props }`,fenced block 的 className 含 `language-xxx`;用 `pre` 透传避免 `pre>div` 嵌套。inline code(无 language)走默认 `<code>`。

- [ ] **Step 1: 创建 Markdown.tsx**

```typescript
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import CodeBlock from './CodeBlock';

const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)' }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children ?? '').replace(/\n$/, '');
          if (match) return <CodeBlock language={match[1]} code={codeStr} />;
          if (codeStr.includes('\n')) return <CodeBlock language="text" code={codeStr} />;
          return <code className={className} style={{ background: 'var(--bg-deep)', padding: '1px 4px', borderRadius: 3, fontSize: 13 }} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default Markdown;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错(若 react-markdown 类型报错,`code` props 用 `any` 已兼容)

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/Markdown.tsx
git commit -m "feat(chat-pro): Markdown 组件(gfm+katex+CodeBlock 集成)"
```

---

### Task 4: MessageBubble 组件(角色 + 内容 + 操作栏)

**Files:**
- Create: `src/components/agentRuntime/MessageBubble.tsx`
- Create: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/agentRuntime/MessageBubble.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageBubble from './MessageBubble';

describe('MessageBubble', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('user message renders raw text (no markdown)', () => {
    render(<MessageBubble role="user" content="hello **world**" />);
    expect(screen.getByText('hello **world**')).toBeTruthy(); // 原样,不渲染粗体
  });
  it('AI message renders markdown bold', () => {
    const { container } = render(<MessageBubble role="assistant" content="**hi**" />);
    expect(container.querySelector('strong')).toBeTruthy();
  });
  it('AI copy button copies content', () => {
    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reply text');
  });
  it('regenerate button only when onRegenerate provided', () => {
    const fn = vi.fn();
    const { rerender } = render(<MessageBubble role="assistant" content="x" />);
    expect(screen.queryByText('重新生成')).toBeNull();
    rerender(<MessageBubble role="assistant" content="x" onRegenerate={fn} />);
    fireEvent.click(screen.getByText('重新生成'));
    expect(fn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx`
Expected: FAIL —— MessageBubble 不存在

- [ ] **Step 3: 实现 MessageBubble.tsx**

```typescript
import React, { useState, memo } from 'react';
import Markdown from './Markdown';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
}

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%' }}>
        <div style={AI_AVATAR}>AI</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Markdown content={content} />
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
            {onRegenerate && (
              <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: 'var(--accent-blue)', color: '#fff', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {content}
    </div>
  );
};

export default memo(MessageBubble);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx`
Expected: PASS(4)

- [ ] **Step 5: Commit**

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(chat-pro): MessageBubble(AI markdown+操作栏 / 用户气泡)"
```

---

### Task 5: store.regenerateLast(重新生成最后一条)

**Files:**
- Modify: `src/stores/agentRuntimeStore.ts`
- Modify: `src/stores/agentRuntimeStore.test.ts`

- [ ] **Step 1: 写失败测试**

追加到 `src/stores/agentRuntimeStore.test.ts` 的 describe 块内:

```typescript
  it('regenerateLast drops last assistant + re-sends last user', async () => {
    const { runAgent } = await import('../services/agentRuntimeApi');
    (runAgent as any).mockImplementation(async (_id: string, _msgs: any, _cwd: any, _onEvent: any, onDone: any) => { onDone(); });
    updateSession.mockResolvedValue({});
    useAgentRuntimeStore.setState({
      agents: [{ id: 'echo', name: 'Echo', description: '', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'echo',
      workspaceSessionId: 's1',
      workspaceCwdHistory: [],
      workspaceMessages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ],
    });
    await useAgentRuntimeStore.getState().regenerateLast();
    const call = (runAgent as any).mock.calls[0];
    expect(call[1].map((m: any) => m.content)).toEqual(['q1', 'a1', 'q2']);
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: FAIL —— regenerateLast 不存在

- [ ] **Step 3: 实现 regenerateLast**

`src/stores/agentRuntimeStore.ts`:

interface 加方法声明(在 `setWorkspaceCwd` 后):
```typescript
  setWorkspaceCwd: (cwd: string) => void;
  regenerateLast: () => Promise<void>;
```

实现(在 `setWorkspaceCwd` 实现后、`}))` 前):
```typescript
  regenerateLast: async () => {
    const msgs = get().workspaceMessages;
    // 去掉最后一条 assistant(若有)
    let trimmed = msgs;
    if (msgs.length && msgs[msgs.length - 1].role === 'assistant') {
      trimmed = msgs.slice(0, -1);
    }
    // 找最后一条 user
    let lastUserIdx = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const lastUserContent = trimmed[lastUserIdx].content;
    // 截断到该 user 之前,再走 runWorkspace 重发(会追加 user + 跑)
    set({
      workspaceMessages: trimmed.slice(0, lastUserIdx),
      workspaceStreaming: '',
      workspaceEvents: [],
      workspaceObservability: EMPTY_OBS,
      workspaceRunning: false,
    });
    await get().runWorkspace(lastUserContent);
  },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test:run -- src/stores/agentRuntimeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/agentRuntimeStore.ts src/stores/agentRuntimeStore.test.ts
git commit -m "feat(chat-pro): store regenerateLast(重发最后 user,替换最后 assistant)"
```

---

### Task 6: ChatWorkspace 改造(用 MessageBubble + 流式 Markdown + 字号)

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`

- [ ] **Step 1: 整体替换 ChatWorkspace.tsx**

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import MessageBubble from './MessageBubble';
import Markdown from './Markdown';

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-default)',
  background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 12,
};

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

const ChatWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceMessages, workspaceStreaming, workspaceEvents, workspaceRunning, runWorkspace, resetWorkspace, regenerateLast } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const agent = agents.find(a => a.id === currentAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [workspaceMessages, workspaceStreaming]);

  const send = () => {
    if (!input.trim() || workspaceRunning) return;
    runWorkspace(input.trim());
    setInput('');
  };

  const lastIdx = workspaceMessages.length - 1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>{agent?.name || '未选'}</strong> <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{agent?.description}</span></div>
        <button onClick={resetWorkspace} style={btnStyle}>新对话</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {workspaceMessages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            content={m.content}
            onRegenerate={m.role === 'assistant' && i === lastIdx && !workspaceRunning ? regenerateLast : undefined}
          />
        ))}
        {workspaceStreaming && (
          <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%' }}>
            <div style={AI_AVATAR}>AI</div>
            <div style={{ flex: 1, minWidth: 0 }}><Markdown content={workspaceStreaming} /></div>
          </div>
        )}
        {workspaceEvents.length > 0 && (
          <div style={{ alignSelf: 'stretch', background: 'var(--bg-deep)', borderRadius: 8, padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {workspaceEvents.map((e, i) => <div key={i}>• {e.label}</div>)}
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13 }}
        />
        <button onClick={send} disabled={workspaceRunning || !currentAgentId} style={{ ...btnStyle, opacity: (workspaceRunning || !currentAgentId) ? 0.5 : 1 }}>
          {workspaceRunning ? '运行中...' : '发送'}
        </button>
      </div>
    </div>
  );
};

export default ChatWorkspace;
```

- [ ] **Step 2: typecheck + 测试不回归**

Run: `npm run typecheck && npm run test:run -- src/components/agentRuntime/CodeBlock.test.tsx src/components/agentRuntime/MessageBubble.test.tsx src/stores/agentRuntimeStore.test.ts`
Expected: typecheck 无错 + 测试 PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx
git commit -m "feat(chat-pro): ChatWorkspace 改用 MessageBubble + 流式 Markdown + 字号 14/13"
```

---

### Task 7: 全测试 + 手动验证 + 跟踪矩阵

- [ ] **Step 1: 前端全关键测试**

Run: `npm run typecheck && npm run test:run -- src/components/agentRuntime/CodeBlock.test.tsx src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/filesUtils.test.ts src/stores/agentRuntimeStore.test.ts src/components/HistoryPage.test.tsx`
Expected: typecheck 无错 + 全 PASS

- [ ] **Step 2: 手动验证(后端 run_server.py :8000 + 前端 :5173)**

浏览器 Ctrl+Shift=refresh 后,选 echo agent(对话不依赖 claude-sdk,避免代理 server_error 干扰):
1. 发 `**粗体** 和 \`代码\` 和 # 标题` → AI 回复渲染粗体/inline code/标题
2. 发含代码块消息 ```python\nprint(1)``` → 代码块高亮 + 语言标识 + 复制按钮(点→已复制)
3. 发 `$$E=mc^2$$` → LaTeX 公式渲染
4. AI 消息 hover → 复制按钮(复制整条)+ 重新生成按钮(仅最后一条)
5. 点重新生成 → 重新流式(替换最后 assistant,不追加)
6. 用户消息:右气泡,纯文本(markdown 不渲染)
7. 字号:消息 14,代码/输入 13(比之前小)

- [ ] **Step 3: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 末尾加 2026-06-16 ChatWorkspace 专业化条目(7 Task)。

- [ ] **Step 4: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "chore(chat-pro): 跟踪矩阵补录 ChatWorkspace 专业化"
```

---

## 验证清单

- [ ] 前端 typecheck 无错 + CodeBlock/MessageBubble/store/HistoryPage 测试 PASS
- [ ] 手动:markdown(标题/列表/表格/粗体/链接)+ 代码块高亮复制 + LaTeX + 流式 markdown + 操作栏(复制/重新生成)+ 用户纯文本气泡 + 字号 14/13
- [ ] 不回归:HistoryPage / 其他 agent(echo/research/assistant)chat 型

## 已知风险

1. **react-markdown@10 的 code 组件 API**:若 fenced block 未正确走 CodeBlock(显示原始 ```),检查 `pre`/`code` 组件签名(v10 用 `({className, children})`,已用 any 兼容)
2. **react-syntax-highlighter 体积**:prism 全语言包较大;若构建告警可改 `PrismLight` + 按需注册语言(本次不做,先全量)
3. **katex CSS 全局**:`import 'katex/dist/katex.min.css'` 全局生效;若影响其他页面样式,后续抽到 Markdown 懒加载
4. **重新生成并发**:regenerateLast 依赖 workspaceRunning=false 才显示按钮(ChatWorkspace 已门控);流式中点不到

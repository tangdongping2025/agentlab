# AI Markdown Reading Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assistant Markdown replies render as a polished article-style reading card instead of plain-looking browser-default Markdown.

**Architecture:** Keep the current `react-markdown` pipeline and existing `CodeBlock`. Add explicit Markdown element renderers in `Markdown.tsx`, wrap assistant replies in a reusable article-card layout in `MessageBubble.tsx`, and make streaming replies in `ChatWorkspace.tsx` reuse the same assistant message component.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, react-markdown, remark-gfm, remark-math, rehype-katex, react-syntax-highlighter.

---

## File Structure

- Modify: `src/components/agentRuntime/Markdown.tsx` — add explicit renderers and styles for headings, paragraphs, lists, blockquotes, tables, links, and horizontal rules.
- Modify: `src/components/agentRuntime/MessageBubble.tsx` — add assistant article-card container and keep copy/regenerate actions inside the card footer.
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx` — render `workspaceStreaming` through `MessageBubble role="assistant"` so streaming and persisted assistant messages share the same visual structure.
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx` — add tests proving assistant Markdown gets article-card and structural Markdown styles while user messages stay raw text.
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx` — add test proving streaming assistant content uses the same assistant message component/card.

## Task 1: Markdown Structural Rendering

**Files:**
- Modify: `src/components/agentRuntime/Markdown.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing tests for Markdown structure styling**

Add these tests to `src/components/agentRuntime/MessageBubble.test.tsx` inside the existing `describe('MessageBubble', () => { ... })` block:

```tsx
  it('AI markdown renders article-style structural elements', () => {
    const { container } = render(
      <MessageBubble
        role="assistant"
        content={[
          '## 核心判断',
          '',
          '一句话结论。',
          '',
          '> 关键提示。',
          '',
          '- 子点一',
          '- 子点二',
          '',
          '| 维度 | 说明 |',
          '|---|---|',
          '| 条目A | 内容 |',
          '',
          '---',
          '',
          '[链接](https://example.com)',
        ].join('\n')}
      />
    );

    expect(container.querySelector('[data-testid="assistant-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="markdown-content"]')).toBeTruthy();
    expect(container.querySelector('h2')?.textContent).toBe('核心判断');
    expect(container.querySelector('blockquote')?.textContent).toContain('关键提示');
    expect(container.querySelector('ul li')?.textContent).toBe('子点一');
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('hr')).toBeTruthy();

    const link = container.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('AI markdown table is wrapped for horizontal scrolling', () => {
    const { container } = render(
      <MessageBubble role="assistant" content={'| 维度 | 说明 |\n|---|---|\n| A | B |'} />
    );

    expect(container.querySelector('[data-testid="markdown-table-scroll"] table')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: FAIL because `assistant-card`, `markdown-content`, table wrapper, and link attributes are not implemented yet.

- [ ] **Step 3: Implement Markdown structural renderers**

Replace the body of `src/components/agentRuntime/Markdown.tsx` with this implementation:

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import CodeBlock from './CodeBlock';

const markdownStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.75,
  color: 'var(--text-primary)',
};

const headingStyle = (fontSize: number, marginTop: number): React.CSSProperties => ({
  fontSize,
  lineHeight: 1.35,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: `${marginTop}px 0 8px`,
});

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 10px',
};

const listStyle: React.CSSProperties = {
  margin: '6px 0 10px',
  paddingLeft: 22,
};

const listItemStyle: React.CSSProperties = {
  margin: '4px 0',
};

const tableCellStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  padding: '8px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};

const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <div data-testid="markdown-content" className="markdown-body" style={markdownStyle}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => <h2 style={headingStyle(18, 0)}>{children}</h2>,
        h2: ({ children }) => <h2 style={headingStyle(18, 0)}>{children}</h2>,
        h3: ({ children }) => <h3 style={headingStyle(16, 12)}>{children}</h3>,
        h4: ({ children }) => <h4 style={headingStyle(15, 10)}>{children}</h4>,
        p: ({ children }) => <p style={paragraphStyle}>{children}</p>,
        ul: ({ children }) => <ul style={listStyle}>{children}</ul>,
        ol: ({ children }) => <ol style={listStyle}>{children}</ol>,
        li: ({ children }) => <li style={listItemStyle}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote style={{
            margin: '10px 0',
            padding: '8px 12px',
            borderLeft: '3px solid var(--accent-blue)',
            background: 'var(--bg-deep)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
          }}>
            {children}
          </blockquote>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '16px 0' }} />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div data-testid="markdown-table-scroll" style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ ...tableCellStyle, background: 'var(--bg-deep)', fontWeight: 650 }}>{children}</th>
        ),
        td: ({ children }) => <td style={tableCellStyle}>{children}</td>,
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

- [ ] **Step 4: Run MessageBubble tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: tests still fail only for `assistant-card`, because Markdown structural renderers now exist but the assistant card is not implemented until Task 2.

- [ ] **Step 5: Commit Task 1**

If Task 1 tests fail only for missing assistant-card, do not commit yet because the test intentionally spans Task 2. Continue directly to Task 2. If you split the tests so Task 1 is independently green, commit with:

```bash
git add src/components/agentRuntime/Markdown.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(chat): 优化 AI Markdown 结构排版"
```

## Task 2: Assistant Article Card

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Confirm failing card test**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: FAIL because `data-testid="assistant-card"` does not exist.

- [ ] **Step 2: Implement assistant article card**

Replace the assistant branch in `src/components/agentRuntime/MessageBubble.tsx` with this structure while keeping imports and user branch intact:

```tsx
  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%', width: 'fit-content' }}>
        <div style={AI_AVATAR}>AI</div>
        <div
          data-testid="assistant-card"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '14px 16px 10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Markdown content={content} />
          <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
            {onRegenerate && (
              <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
            )}
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Run MessageBubble tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit Tasks 1 and 2 together if Task 1 was not committed**

Run:

```bash
git add src/components/agentRuntime/Markdown.tsx src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(chat): 优化 AI 回复 Markdown 阅读卡片"
```

Expected: one commit containing Markdown structural styling and assistant article card.

## Task 3: Streaming Reply Uses Same Card

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx`
- Modify: `src/components/agentRuntime/ChatWorkspace.test.tsx`

- [ ] **Step 1: Write failing streaming card test**

Add this test to `src/components/agentRuntime/ChatWorkspace.test.tsx` inside `describe('ChatWorkspace fullscreen', () => { ... })`:

```tsx
  it('renders streaming assistant content with the same article card', () => {
    useAgentRuntimeStore.setState({
      agents: [{ id: 'assistant', name: '项目助手', description: '测试智能体', workspace: { type: 'chat' }, capabilities: [] }],
      currentAgentId: 'assistant',
      workspaceMessages: [],
      workspaceStreaming: '## 核心判断\n\n正在流式输出',
      workspaceEvents: [],
      workspaceRunning: true,
      workspaceAbortController: null,
    });

    const { container } = render(<ChatWorkspace />);

    expect(container.querySelector('[data-testid="assistant-card"] h2')?.textContent).toBe('核心判断');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: FAIL because streaming currently renders bare `Markdown` instead of `MessageBubble`.

- [ ] **Step 3: Replace streaming bare Markdown with MessageBubble**

In `src/components/agentRuntime/ChatWorkspace.tsx`, replace this block:

```tsx
        {workspaceStreaming && (
          <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%' }}>
            <div style={AI_AVATAR}>AI</div>
            <div style={{ flex: 1, minWidth: 0 }}><Markdown content={workspaceStreaming} /></div>
          </div>
        )}
```

with:

```tsx
        {workspaceStreaming && (
          <MessageBubble role="assistant" content={workspaceStreaming} />
        )}
```

Then remove the unused `Markdown` import and `AI_AVATAR` constant from `ChatWorkspace.tsx`.

- [ ] **Step 4: Run ChatWorkspace tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run focused agentRuntime tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "feat(chat): 统一流式回复文章卡渲染"
```

Expected: one commit containing streaming visual consistency.

## Task 4: Verification and Tracking

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Update tracking matrix**

Add a new row to `项目执行跟踪矩阵.md` after RQ-051:

```md
| RQ-052 | AI 回复 Markdown 阅读体验专业化 | [`2026-06-19-ai-markdown-reading-experience-design.md`](docs/superpowers/specs/2026-06-19-ai-markdown-reading-experience-design.md) | [`2026-06-19-ai-markdown-reading-experience.md`](docs/superpowers/plans/2026-06-19-ai-markdown-reading-experience.md) | ✅ | 🔍 浏览器验收待确认 |
```

Update the summary near the top:

```md
- **总数**：50
- **已完成**：47
- **进行中**：3
```

Keep existing RQ-050 and RQ-051 browser-verification statuses unchanged.

- [ ] **Step 4: Commit tracking update**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 AI Markdown 阅读体验专业化"
```

Expected: tracking matrix update is committed. The plan document must already be committed before implementation starts.

- [ ] **Step 5: Start the app for browser verification**

Run backend if needed:

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn main:app --port 8000
```

Run frontend if needed:

```bash
npm run dev
```

Expected: frontend is available on Vite dev server and backend health is available at `/api/db/health`.

- [ ] **Step 6: Manual browser verification**

Use an assistant reply sample containing this Markdown:

```md
## 核心判断

一句话概括结论。

---

## 1. 要点一

具体展开内容。

- 子点一
- 子点二
- 子点三

## 2. 要点二

具体展开内容。

> 引用说明或关键提示。

## 3. 要点三

| 维度 | 说明 |
|---|---|
| 条目A | 内容 |
| 条目B | 内容 |
| 条目C | 内容 |

```ts
const ok = true;
```

---

## 总结

收尾结论或下一步建议。
```

Expected:
- AI reply appears as an article card.
- Headings, paragraph spacing, list spacing, blockquote, table, horizontal rules, and code block are visually distinct.
- User messages remain right-aligned blue raw-text bubbles.
- Fullscreen mode shows the same article card.
- Streaming assistant text uses the same article card.

- [ ] **Step 7: Update tracking matrix after user confirms browser verification**

After the user confirms browser verification is acceptable, change RQ-052 status to:

```md
✅ 已完成
```

Then commit:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 完成 AI Markdown 阅读体验验收"
```

## Self-Review

- Spec coverage: Markdown element styling, assistant article card, streaming consistency, user raw-text behavior, code block preservation, no new dependencies, and browser verification are covered.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: `MessageBubble` props remain `role`, `content`, `onRegenerate`; test selectors are `assistant-card`, `markdown-content`, and `markdown-table-scroll`.

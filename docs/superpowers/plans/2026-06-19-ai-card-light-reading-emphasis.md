# AI Card Light Reading Emphasis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assistant article cards feel like light reading surfaces and make Markdown bold text visibly stand out.

**Architecture:** Keep the current `MessageBubble` and `Markdown` component boundaries. Update only assistant card inline styles and Markdown structural renderers; do not change user message rendering, prompt behavior, runtime behavior, or `CodeBlock`.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, react-markdown.

---

## File Structure

- Modify: `src/components/agentRuntime/MessageBubble.tsx` — change assistant card background, border, and shadow to a light reading surface.
- Modify: `src/components/agentRuntime/Markdown.tsx` — add `strong` renderer and lighten blockquote/table header auxiliary surfaces.
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx` — add tests for light card background and strong emphasis rendering.
- Modify: `项目执行跟踪矩阵.md` — add RQ-054 after verification.

## Task 1: Light Card and Strong Emphasis

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Modify: `src/components/agentRuntime/Markdown.tsx`
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Add failing tests**

Add tests to `src/components/agentRuntime/MessageBubble.test.tsx` inside `describe('MessageBubble', () => { ... })`:

```tsx
  it('AI assistant card uses a light reading background', () => {
    const { container } = render(<MessageBubble role="assistant" content="正文" />);

    const card = container.querySelector('[data-testid="assistant-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.background).toBe('rgb(251, 252, 255)');
    expect(card.style.border).toContain('rgba(148, 163, 184, 0.22)');
  });

  it('AI markdown bold text is visibly emphasized', () => {
    const { container } = render(<MessageBubble role="assistant" content="这是 **重点内容**" />);

    const strong = container.querySelector('[data-testid="markdown-strong"]') as HTMLElement;
    expect(strong).toBeTruthy();
    expect(strong.textContent).toBe('重点内容');
    expect(strong.style.background).toBe('rgba(250, 204, 21, 0.18)');
    expect(strong.style.fontWeight).toBe('700');
  });
```

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: tests fail because the light card background and `strong` renderer are not implemented.

- [ ] **Step 2: Implement assistant card light background**

In `src/components/agentRuntime/MessageBubble.tsx`, update the assistant card style:

```tsx
background: '#fbfcff',
border: '1px solid rgba(148, 163, 184, 0.22)',
boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
```

Keep `data-testid="assistant-card"`, padding, border radius, copy/regenerate behavior, and user branch unchanged.

- [ ] **Step 3: Implement strong emphasis and light auxiliary surfaces**

In `src/components/agentRuntime/Markdown.tsx`, add a `strong` renderer:

```tsx
strong: ({ children }) => (
  <strong
    data-testid="markdown-strong"
    style={{
      fontWeight: 700,
      color: '#0f172a',
      background: 'rgba(250, 204, 21, 0.18)',
      borderRadius: 4,
      padding: '0 3px',
    }}
  >
    {children}
  </strong>
),
```

Also change auxiliary backgrounds:

```tsx
background: 'rgba(59, 130, 246, 0.08)'
```

for `blockquote`, and:

```tsx
background: 'rgba(148, 163, 184, 0.12)'
```

for `th`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/Markdown.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(chat): 优化 AI 文章卡阅读背景与重点样式"
```

Expected: one implementation commit.

## Task 2: Verification and Tracking

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Update tracking matrix**

Add this row after RQ-053:

```md
| RQ-054 | AI 回复文章卡浅色阅读与重点样式 | [`2026-06-19-ai-card-light-reading-emphasis-design.md`](docs/superpowers/specs/2026-06-19-ai-card-light-reading-emphasis-design.md) | [`2026-06-19-ai-card-light-reading-emphasis.md`](docs/superpowers/plans/2026-06-19-ai-card-light-reading-emphasis.md) | ✅ | 🔍 浏览器验收待确认 |
```

Update summary:

```md
- **总数**：52
- **已完成**：47
- **进行中**：5
```

- [ ] **Step 3: Commit tracking update**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 AI 文章卡浅色阅读与重点样式"
```

Expected: tracking update commit is created.

## Task 3: Browser Verification

**Files:**
- No file changes.

- [ ] **Step 1: Verify visual appearance in browser**

Ask the assistant to output Markdown containing `**重点内容**`, blockquote, table, and code block.

Expected:
- AI card is light, not black.
- Bold text is visibly emphasized.
- Blockquote and table header use light auxiliary backgrounds.
- Code block remains unchanged.
- User messages remain right-aligned blue raw-text bubbles.

## Self-Review

- Spec coverage: light card, strong emphasis, auxiliary surface updates, user message unchanged, prompt unchanged, and CodeBlock unchanged are covered.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: test selectors match `assistant-card` and `markdown-strong`.

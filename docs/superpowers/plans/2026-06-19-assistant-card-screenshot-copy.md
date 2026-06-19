# Assistant 卡片截图复制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 assistant 回复卡片底部增加“截图复制”，把当前卡片复制为 PNG 图片写入剪贴板。

**Architecture:** 功能只接入 `MessageBubble` 的 assistant 卡片。组件持有卡片 DOM ref，点击按钮时使用原生 DOM clone → SVG `foreignObject` → canvas → PNG blob → `navigator.clipboard.write()`，不新增依赖，不改现有文本复制和重新生成流程。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、浏览器 Clipboard API、SVG、Canvas。

---

## File Structure

- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`
  - 增加截图复制按钮、成功写入、隐藏动作区、失败状态测试。
  - 在测试内 mock `navigator.clipboard.write`、`ClipboardItem`、`Image`、`HTMLCanvasElement.getContext` 和 `HTMLCanvasElement.toBlob`。
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
  - 为 assistant 卡片增加 `useRef<HTMLDivElement>(null)`。
  - 增加 `copyScreenshot()`，将当前卡片转成 PNG blob 并写入剪贴板。
  - 在操作区增加“截图复制”按钮和短暂状态。
- Modify: `项目执行跟踪矩阵.md`
  - 将总数 +1、进行中 +1。
  - 增加 RQ-059 行，指向 spec 和 plan。

---

### Task 1: MessageBubble 截图复制测试

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these test helpers near the top of `src/components/agentRuntime/MessageBubble.test.tsx`, after imports:

```tsx
class TestClipboardItem {
  items: Record<string, Blob>;

  constructor(items: Record<string, Blob>) {
    this.items = items;
  }
}

const originalImage = globalThis.Image;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

function installScreenshotMocks(options: { toBlob?: Blob | null } = {}) {
  const blob = options.toBlob === undefined ? new Blob(['png'], { type: 'image/png' }) : options.toBlob;
  const drawImage = vi.fn();

  Object.defineProperty(globalThis, 'ClipboardItem', {
    configurable: true,
    writable: true,
    value: TestClipboardItem,
  });

  URL.createObjectURL = vi.fn(() => 'blob:assistant-card');
  URL.revokeObjectURL = vi.fn();

  class MockImage {
    width = 0;
    height = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  }

  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as any;
  HTMLCanvasElement.prototype.toBlob = vi.fn(callback => callback(blob)) as any;

  return { drawImage, blob };
}
```

Replace the existing `beforeEach` block with:

```tsx
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      },
    });
  });
```

Add this `afterEach` block after `beforeEach`:

```tsx
  afterEach(() => {
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
  });
```

Update the import on line 1 to include `afterEach`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

Add these tests before the existing regenerate test:

```tsx
  it('assistant message shows screenshot copy action by default', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByText('截图复制')).toBeInTheDocument();
  });

  it('assistant message hides screenshot copy action when showActions is false', () => {
    render(<MessageBubble role="assistant" content="reply text" showActions={false} />);

    expect(screen.queryByText('截图复制')).not.toBeInTheDocument();
  });

  it('screenshot copy writes a png image to clipboard', async () => {
    const { blob } = installScreenshotMocks();

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByText('截图复制'));

    await waitFor(() => {
      expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    });

    const [[clipboardItem]] = (navigator.clipboard.write as any).mock.calls[0];
    expect(clipboardItem).toBeInstanceOf(TestClipboardItem);
    expect(clipboardItem.items['image/png']).toBe(blob);
    expect(await screen.findByText('截图已复制')).toBeTruthy();
  });

  it('screenshot copy shows failure state when png rendering fails', async () => {
    installScreenshotMocks({ toBlob: null });

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByText('截图复制'));

    expect(await screen.findByText('截图失败')).toBeTruthy();
    expect(navigator.clipboard.write).not.toHaveBeenCalled();
    expect(screen.getByText('复制')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: FAIL because `截图复制` button does not exist yet.

- [ ] **Step 3: Commit failing tests is not required**

Do not commit red tests. Continue to Task 2.

---

### Task 2: MessageBubble 截图复制实现

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx`
- Test: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Update React imports**

Change the first line of `src/components/agentRuntime/MessageBubble.tsx` to:

```tsx
import React, { useRef, useState, memo } from 'react';
```

- [ ] **Step 2: Add screenshot state and ref**

Inside `MessageBubble`, after the existing `copied` state, add:

```tsx
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const assistantCardRef = useRef<HTMLDivElement>(null);
```

The top of the component should become:

```tsx
const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true }) => {
  const [copied, setCopied] = useState(false);
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const assistantCardRef = useRef<HTMLDivElement>(null);
  const copy = async () => {
```

- [ ] **Step 3: Add screenshot helper inside component**

Add this function after `copy` and before `if (role === 'assistant')`:

```tsx
  const copyScreenshot = async () => {
    const card = assistantCardRef.current;
    if (!card) return;

    try {
      const { width, height } = card.getBoundingClientRect();
      const clonedCard = card.cloneNode(true) as HTMLElement;
      clonedCard.style.width = `${Math.ceil(width)}px`;
      clonedCard.style.boxSizing = 'border-box';

      const actionBar = clonedCard.querySelector('[data-testid="assistant-card-actions"]');
      actionBar?.remove();

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">${clonedCard.outerHTML}</div>
          </foreignObject>
        </svg>
      `;
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(width);
          canvas.height = Math.ceil(height);
          const context = canvas.getContext('2d');
          if (!context) {
            URL.revokeObjectURL(url);
            reject(new Error('canvas context unavailable'));
            return;
          }

          context.drawImage(image, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('png blob unavailable'));
              return;
            }
            resolve(blob);
          }, 'image/png');
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('image render failed'));
        };
        image.src = url;
      });

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setScreenshotStatus('copied');
      setTimeout(() => setScreenshotStatus('idle'), 1500);
    } catch {
      setScreenshotStatus('failed');
      setTimeout(() => setScreenshotStatus('idle'), 1500);
    }
  };
```

- [ ] **Step 4: Attach card ref and action test id**

Change the assistant card opening div from:

```tsx
        <div
          data-testid="assistant-card"
          style={{
```

to:

```tsx
        <div
          ref={assistantCardRef}
          data-testid="assistant-card"
          style={{
```

Change the action bar opening div from:

```tsx
            <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
```

to:

```tsx
            <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
```

- [ ] **Step 5: Add screenshot button**

Inside the action bar, immediately after the text copy button, add:

```tsx
              <button onClick={copyScreenshot} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{screenshotStatus === 'copied' ? '截图已复制' : screenshotStatus === 'failed' ? '截图失败' : '截图复制'}</button>
```

The action bar should become:

```tsx
            <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
              <button onClick={copyScreenshot} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{screenshotStatus === 'copied' ? '截图已复制' : screenshotStatus === 'failed' ? '截图失败' : '截图复制'}</button>
              {onRegenerate && (
                <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
              )}
            </div>
```

- [ ] **Step 6: Run focused test**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: PASS. Existing tests for text copy and regenerate still pass.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add src/components/agentRuntime/MessageBubble.tsx src/components/agentRuntime/MessageBubble.test.tsx
git commit -m "feat(runtime): 支持 assistant 卡片截图复制"
```

---

### Task 3: 跟踪矩阵与回归验证

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Update tracking matrix**

In `项目执行跟踪矩阵.md`, change the statistics block from:

```md
- **总数**：56
- **已完成**：47
- **进行中**：9
```

to:

```md
- **总数**：57
- **已完成**：47
- **进行中**：10
```

Add this row after RQ-058:

```md
| RQ-059 | Assistant 卡片截图复制 | [`2026-06-19-assistant-card-screenshot-copy-design.md`](docs/superpowers/specs/2026-06-19-assistant-card-screenshot-copy-design.md) | [`2026-06-19-assistant-card-screenshot-copy.md`](docs/superpowers/plans/2026-06-19-assistant-card-screenshot-copy.md) | ✅ | 🔍 浏览器验收待确认 |
```

- [ ] **Step 2: Run regression tests**

Run:

```bash
npm run test:run -- src/components/agentRuntime/MessageBubble.test.tsx src/components/agentRuntime/ChatWorkspace.test.tsx src/components/agentRuntime/CodeBlock.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit tracking matrix**

Run:

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录 assistant 卡片截图复制"
```

- [ ] **Step 5: Browser verification**

Start or reuse the dev server and verify in browser:

1. Open the chat workspace.
2. Confirm assistant message card has “复制 / 截图复制”。
3. Click “截图复制”。
4. Paste into a rich target that accepts images and confirm a PNG image appears.
5. Confirm text “复制” still copies raw content.
6. Confirm “重新生成” still appears only for the last assistant card with regenerate enabled.

---

## Self-Review

- Spec coverage: plan covers button display, PNG clipboard write, success/failure states, `showActions=false`, no new dependency, and existing actions preserved.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: plan consistently uses `copyScreenshot`, `screenshotStatus`, `assistantCardRef`, and `assistant-card-actions`.

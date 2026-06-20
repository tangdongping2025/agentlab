# Assistant 卡片语音播放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每张 assistant 回复卡片上增加手动“朗读/停止”按钮，用 Chrome 支持的 Web Speech API 播放该卡片纯文本内容。

**Architecture:** 语音播放逻辑放在 `MessageBubble` 内部，复用现有 `toPlainText(content)`，不引入后端或云端 TTS。每张卡片维护自己的播放按钮状态；点击朗读前调用 `speechSynthesis.cancel()`，确保同一时间只有一段浏览器朗读在播放。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Web Speech API (`window.speechSynthesis`, `SpeechSynthesisUtterance`)。

---

## File Structure

- Modify: `src/components/agentRuntime/MessageBubble.tsx`
  - 继续负责单条消息气泡渲染。
  - 在 assistant 卡片操作区增加“朗读/停止”按钮。
  - 在组件内封装最小播放状态和 `speechSynthesis` 调用。
- Modify: `src/components/agentRuntime/MessageBubble.test.tsx`
  - 在现有 MessageBubble 测试中新增 Web Speech API mock。
  - 覆盖按钮显示、朗读调用、停止调用、不支持时隐藏。

## Task 1: Assistant Card Speech Button

**Files:**
- Modify: `src/components/agentRuntime/MessageBubble.tsx:37-84`
- Test: `src/components/agentRuntime/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing tests**

Add `afterEach` to the import and append the following setup helpers/tests in `src/components/agentRuntime/MessageBubble.test.tsx`.

Change the first import to:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

Add these helpers inside `describe('MessageBubble', () => {`, after the existing `beforeEach` block:

```ts
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
  });

  function mockSpeechSynthesis() {
    const speak = vi.fn();
    const cancel = vi.fn();
    class MockSpeechSynthesisUtterance {
      text: string;
      lang = '';
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance,
    });

    return { speak, cancel };
  }
```

Append these tests before `it('regenerate button only when onRegenerate provided', () => {`:

```ts
  it('assistant message shows speech action when Web Speech API is supported', () => {
    mockSpeechSynthesis();

    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument();
  });

  it('assistant speech button speaks readable plain text', () => {
    const { speak, cancel } = mockSpeechSynthesis();
    const markdown = [
      '## 核心判断',
      '',
      '这是 **重点** 和 `代码`。',
    ].join('\n');

    render(<MessageBubble role="assistant" content={markdown} />);
    fireEvent.click(screen.getByRole('button', { name: '朗读' }));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe('核心判断\n\n这是 重点 和 代码。');
    expect(utterance.lang).toBe('zh-CN');
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  });

  it('assistant speech stop button cancels current speech', () => {
    const { cancel } = mockSpeechSynthesis();

    render(<MessageBubble role="assistant" content="reply text" />);
    fireEvent.click(screen.getByRole('button', { name: '朗读' }));
    fireEvent.click(screen.getByRole('button', { name: '停止' }));

    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument();
  });

  it('assistant message hides speech action when Web Speech API is unsupported', () => {
    render(<MessageBubble role="assistant" content="reply text" />);

    expect(screen.queryByRole('button', { name: '朗读' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: FAIL because the “朗读” button does not exist yet.

- [ ] **Step 3: Implement minimal speech button**

In `src/components/agentRuntime/MessageBubble.tsx`, update the import and `MessageBubble` component as follows.

Change the import to:

```ts
import React, { useState, memo, useEffect } from 'react';
```

Inside `MessageBubble`, after the existing `useState` calls, add:

```ts
  const [speaking, setSpeaking] = useState(false);
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
```

After `copyPlainText`, add:

```ts
  const toggleSpeech = () => {
    if (!supportsSpeech) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const text = toPlainText(content);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (speaking && supportsSpeech) window.speechSynthesis.cancel();
    };
  }, [speaking, supportsSpeech]);
```

In the assistant card actions, insert the speech button after “复制纯文本”:

```tsx
              {supportsSpeech && (
                <button onClick={toggleSpeech} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{speaking ? '停止' : '朗读'}</button>
              )}
```

- [ ] **Step 4: Run focused test to verify it passes**

Run:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: PASS for `MessageBubble.test.tsx`.

- [ ] **Step 5: Commit task**

Run:

```bash
git add "src/components/agentRuntime/MessageBubble.tsx" "src/components/agentRuntime/MessageBubble.test.tsx"
git commit -m "$(cat <<'EOF'
feat(runtime): 支持 assistant 卡片朗读
EOF
)"
```

## Task 2: Update Requirement Tracking Matrix

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: Read current matrix**

Run no shell command for file reading; use the Read tool on `项目执行跟踪矩阵.md` and find the section for recent runtime UX improvements.

- [ ] **Step 2: Add one tracking entry**

Add a concise row or bullet that records assistant card speech playback as completed, referencing:

```md
`docs/superpowers/specs/2026-06-20-assistant-card-speech-design.md`
`docs/superpowers/plans/2026-06-20-assistant-card-speech.md`
```

- [ ] **Step 3: Commit matrix update**

Run:

```bash
git add "项目执行跟踪矩阵.md"
git commit -m "$(cat <<'EOF'
docs(runtime): 更新语音播放跟踪矩阵
EOF
)"
```

## Verification

- [ ] Run focused component test:

```bash
npm run test -- src/components/agentRuntime/MessageBubble.test.tsx
```

Expected: PASS.

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] Start the app and manually verify in Chrome:

```bash
npm run dev
```

Expected manual checks:
- Open the chat workspace in Chrome.
- Generate or open an assistant reply card.
- Confirm the card has a “朗读” button.
- Click “朗读” and confirm Chrome reads the card content aloud.
- Confirm the button changes to “停止”.
- Click “停止” and confirm playback stops.
- Confirm copy buttons and regenerate still work.

---

## Self-Review

- Spec coverage: Task 1 covers assistant-only card button, manual single-card playback, Web Speech API, Markdown-to-plain-text reuse, unsupported browser hiding, streaming card exclusion through existing `showActions={false}` behavior. Task 2 covers project tracking matrix update.
- Placeholder scan: no TBD/TODO/implement-later placeholders remain.
- Type consistency: tests and implementation use `speechSynthesis`, `SpeechSynthesisUtterance`, `speaking`, `supportsSpeech`, and `toggleSpeech` consistently.

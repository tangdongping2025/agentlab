# 手机端长代码块撑爆 panel 修复 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复手机端 AI 回复含长代码块时,消息区右侧 + 发送按钮右半边被切看不见的问题。

**Architecture:** 根因是 CodeBlock 的 `react-syntax-highlighter` 渲染 `<pre white-space:pre>`,长代码行不换行、固有超宽,在 flex 链 `min-width:auto` + 移动端 viewport 未显式 `overflowX` 的环境下层层撑出 ChatWorkspace panel,被中间 row `overflow:hidden` 切右半。最小修:CodeBlock 自身约束 `maxWidth:100%` + 块内 `overflowX:auto` 横滚;ChatWorkspace viewport 显式 `overflowX:auto` 兜底。

**Tech Stack:** React 18 + TypeScript + Vite + Vitest + @testing-library/react;`react-syntax-highlighter` (Prism, oneLight)。

## Global Constraints

- 不改 `Markdown.tsx`(inline code / 长 URL / 表格均已正确处理:`overflow-wrap` 继承 + 表格自带 `overflowX:auto` 包裹)
- 不加 flex 链全局 `minWidth:0`(当前无其他超宽源,YAGNI)
- 桌面端零影响(桌面宽,代码块本就横滚)
- 测试只断言 inline style(jsdom 测不了真实横向溢出几何)
- 复用现有测试风格:vitest + @testing-library/react + `container.firstElementChild.style.xxx` / `screen.getByTestId`
- 复用现有 commit 风格:`fix(mobile): ...`

## File Structure

- Modify: `src/components/agentRuntime/CodeBlock.tsx` — 外层加 `maxWidth:100%`,SyntaxHighlighter 包一层 `overflowX:auto` 横滚 wrapper
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx:298` — 消息 viewport 显式补 `overflowX:'auto'`
- Test: `src/components/agentRuntime/CodeBlock.test.tsx` — 加宽度约束 + 块内横滚断言
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx` — 加 viewport `overflowX` 断言

---

### Task 1: CodeBlock 约束宽度 + 块内横滚

**Files:**
- Modify: `src/components/agentRuntime/CodeBlock.tsx`
- Test: `src/components/agentRuntime/CodeBlock.test.tsx`

**Interfaces:** 无新接口。CodeBlock 是纯展示组件,本次只调内部 JSX 结构与 inline style。

- [ ] **Step 1: 写失败测试**

在 `src/components/agentRuntime/CodeBlock.test.tsx` 现有 `describe('CodeBlock', ...)` 内追加:

```tsx
it('constrains width to parent and scrolls long code horizontally inside the block', () => {
  const longLine = 'const x = "' + 'a'.repeat(500) + '";';
  const { container } = render(<CodeBlock language="js" code={longLine} />);
  const wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.style.maxWidth).toBe('100%');
  const scroll = wrapper.querySelector('[data-testid="codeblock-scroll"]') as HTMLElement;
  expect(scroll).toBeTruthy();
  expect(scroll.style.overflowX).toBe('auto');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- CodeBlock`
Expected: FAIL — `wrapper.style.maxWidth` 为空(`''`),且找不到 `[data-testid="codeblock-scroll"]`。

- [ ] **Step 3: 改 CodeBlock.tsx(约束 + 横滚 wrapper)**

把 `src/components/agentRuntime/CodeBlock.tsx` 的 return 整段替换为(外层加 `maxWidth: '100%'`;SyntaxHighlighter 外包一层 `data-testid="codeblock-scroll"` 的横滚容器):

```tsx
return (
  <div style={{ margin: '8px 0', maxWidth: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #D6CFC4', background: '#FFFFFF' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: '#EDE8DF', color: '#555555', fontSize: 11 }}>
      <span>{language || 'text'}</span>
      <button onClick={copy} style={{ background: 'transparent', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 11, padding: 0 }}>{copied ? '已复制' : '复制'}</button>
    </div>
    <div data-testid="codeblock-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneLight}
        customStyle={{ margin: 0, fontSize: 13, background: '#FFFFFF', maxWidth: '100%' }}
        codeTagProps={{ style: { fontFamily: '"SF Mono", "Fira Code", Consolas, monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  </div>
);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- CodeBlock`
Expected: PASS(全部用例,含新增 + 原 3 个:language label / copy / 已复制)。

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/components/agentRuntime/CodeBlock.tsx src/components/agentRuntime/CodeBlock.test.tsx
git commit -m "fix(mobile): CodeBlock 约束宽度+块内横滚防撑爆 panel"
```

---

### Task 2: ChatWorkspace viewport 显式 overflowX:auto

**Files:**
- Modify: `src/components/agentRuntime/ChatWorkspace.tsx:298`
- Test: `src/components/agentRuntime/ChatWorkspace.test.tsx`

**Interfaces:** 无。viewport 的 `data-testid="chat-message-viewport"` 已存在,本任务只在其 inline style 补一项。

- [ ] **Step 1: 写失败测试**

在 `src/components/agentRuntime/ChatWorkspace.test.tsx` 现有 `describe('ChatWorkspace fullscreen', ...)` 内(`beforeEach` 之后)追加一个 `it`:

```tsx
it('viewport sets explicit overflowX to keep wide content from escaping sideways on mobile', () => {
  render(<ChatWorkspace />);
  const viewport = screen.getByTestId('chat-message-viewport');
  expect(viewport.style.overflowX).toBe('auto');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- ChatWorkspace`
Expected: FAIL — `viewport.style.overflowX` 为空(`''`,因为当前只设了 `overflowY`)。

- [ ] **Step 3: 改 ChatWorkspace.tsx(viewport 加 overflowX)**

在 `src/components/agentRuntime/ChatWorkspace.tsx` 第 298 行,给 `data-testid="chat-message-viewport"` 的 `style` 对象在 `overflowY: 'auto'` 之后追加 `overflowX: 'auto'`:

修改前(单行):
```tsx
<div data-testid="chat-message-viewport" ref={fullscreen ? fullscreenScrollRef : scrollRef} onScroll={handleViewportScroll} style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
```

修改后(在 `overflowY: 'auto',` 后插入 `overflowX: 'auto',`):
```tsx
<div data-testid="chat-message-viewport" ref={fullscreen ? fullscreenScrollRef : scrollRef} onScroll={handleViewportScroll} style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- ChatWorkspace`
Expected: PASS(全部用例)。

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/components/agentRuntime/ChatWorkspace.tsx src/components/agentRuntime/ChatWorkspace.test.tsx
git commit -m "fix(mobile): viewport 显式 overflowX 兜底横向溢出"
```

---

### Task 3: 移动模拟实测 + 更新跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

**Interfaces:** 无。

- [ ] **Step 1: 全量回归测试**

Run: `npm run test`
Expected: 全部 PASS(注意:main 上有预先存在的失败测试,见 memory `project_preexisting-failing-tests.md` — App.test / appStore / ChatInteraction / DetailModal / ToolInteractionDetails / sceneService,属技术债非本次回归;本次新增/相关的 CodeBlock、ChatWorkspace 用例须全绿)。

- [ ] **Step 2: dev server 移动模拟实测**

dev server 应已在 `http://localhost:5173/` 运行(Task 0 启动)。若无,Run: `npm run dev`。

在 Chrome 打开 `http://localhost:5173/`,F12 → 设备工具栏(Ctrl+Shift+M)→ 选一个手机机型(如 iPhone 12 / 390×844)→ 进任意 chat 型 agent → 让 AI 输出一段含长单行代码的回复(例如「写一段压缩的 JS」),或直接在 console 注入一条含超长行的 assistant 消息。

Expected:
- 代码块在块内出现横向滚动(长行不撑破气泡)
- 消息区右侧 + 发送按钮**全部可见**,不再被切
- 普通长 URL / inline code 仍自动换行(未回归)

- [ ] **Step 3: 更新跟踪矩阵**

在 `项目执行跟踪矩阵.md` 追加一行(沿用文件现有表格格式),需求编号按文件既有规则(推测 RQ-031 或承接最近条目),描述「手机端长代码块撑爆 panel 修复」,状态「已完成」,对应 commit 哈希留空(Step 4 填)。

- [ ] **Step 4: commit 跟踪矩阵**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs: 更新跟踪矩阵-手机端代码块溢出修复"
```

---

## Self-Review(写计划后自查)

1. **Spec 覆盖**:spec 两处改动(CodeBlock maxWidth + 横滚 / viewport overflowX)→ Task 1 / Task 2 ✓;测试 → 各 Task Step 1 ✓;实测 → Task 3 Step 2 ✓。
2. **Placeholder**:无 TBD/TODO,每步含完整代码与命令 ✓。
3. **类型一致**:`data-testid="codeblock-scroll"`(Task 1 实现)与测试查询一致 ✓;`data-testid="chat-message-viewport"` 为既有,Task 2 直接复用 ✓。

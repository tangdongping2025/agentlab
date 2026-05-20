# 系统提示词区域默认收缩优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the system prompt editor section collapsed by default, with an arrow icon to toggle expand/collapse, showing a summary when collapsed. This is similar to RQ-006's API interaction process collapsible feature.

**Architecture:** Use `useState` within the component that contains the system prompt editor to manage expand/collapse state locally. Show prompt summary when collapsed, show full editor when expanded.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

## File Structure

| File | Operation | Purpose |
|------|-----------|---------|
| `context-lab/src/components/PromptEditor.tsx` | Modify | Add collapsible functionality |
| `context-lab/src/__tests__/components/PromptEditor.test.tsx` | Modify | Add tests for collapsible behavior |

---

## Task Decomposition

### Task 1: Add Collapsible State to PromptEditor

**Files:**
- Modify: `context-lab/src/components/PromptEditor.tsx`
- Test: `context-lab/src/__tests__/components/PromptEditor.test.tsx`

- [ ] **Step 1: Read current PromptEditor**

Read the existing component to understand its structure.

```typescript
// Current PromptEditor likely has:
// - systemPrompt from the store
// - setSystemPrompt function
// - textarea for editing prompt
```

- [ ] **Step 2: Add useState hook**

Add expand/collapse state management.

```typescript
import { useState } from 'react';

function PromptEditor() {
  const { systemPrompt, setSystemPrompt } = useAppStore();
  
  // Add this line for collapsible state
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Rest of component...
}
```

- [ ] **Step 3: Update header with toggle button**

Add arrow icon to toggle expand/collapse.

```typescript
return (
  <section className="mb-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">
          系统提示词
        </h2>
        <span className="text-sm text-gray-500">
          ({systemPrompt.length} 字符)
        </span>
      </div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        aria-label={isExpanded ? "收起系统提示词" : "展开系统提示词"}
      >
        {isExpanded ? (
          <span className="text-lg">▼</span>
        ) : (
          <span className="text-lg">▶</span>
        )}
      </button>
    </div>
```

- [ ] **Step 4: Add collapsed state rendering**

Add the summary view when collapsed.

```typescript
    {/* System Prompt Content - Collapsible Logic */}
    {isExpanded ? (
      <div className="bg-gray-50 p-4 rounded-lg">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="请输入系统提示词..."
          className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
        />
      </div>
    ) : (
      <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
        <p>点击 ▶ 查看系统提示词 ({systemPrompt.length} 字符)</p>
      </div>
    )}
  </section>
);
```

- [ ] **Step 5: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/components/PromptEditor.tsx
git commit -m "feat: add collapsible system prompt section"
```

---

### Task 2: Add Tests for Collapsible Behavior

**Files:**
- Modify: `context-lab/src/__tests__/components/PromptEditor.test.tsx`

- [ ] **Step 1: Read current test file**

Read existing test file to understand structure.

```typescript
// Current tests likely verify:
// - Prompt is rendered
// - Edit functionality works
```

- [ ] **Step 2: Add test for default collapsed state**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../src/stores/appStore';
import PromptEditor from '../../src/components/PromptEditor';

// Test default collapsed state
test('system prompt section is collapsed by default', () => {
  useAppStore.setState({
    systemPrompt: '你是一个智能助手...'
  });

  render(<PromptEditor />);

  // Should show expand arrow by default
  expect(screen.getByText('▶')).toBeInTheDocument();
  
  // Should show summary, not full prompt
  expect(screen.getByText(/点击 ▶ 查看系统提示词/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add test for toggle functionality**

```typescript
test('toggles between collapsed and expanded when arrow is clicked', () => {
  useAppStore.setState({
    systemPrompt: '你是一个智能助手...'
  });

  render(<PromptEditor />);

  // Initially collapsed
  expect(screen.getByText('▶')).toBeInTheDocument();
  
  // Click to expand
  fireEvent.click(screen.getByText('▶'));
  
  // Should now be expanded
  expect(screen.getByText('▼')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeInTheDocument();

  // Click to collapse again
  fireEvent.click(screen.getByText('▼'));
  
  // Should be collapsed again
  expect(screen.getByText('▶')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run tests**

Run the tests to verify implementation:

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test:run -- __tests__/components/PromptEditor.test.tsx
```

Expected: All tests should pass.

- [ ] **Step 5: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/__tests__/components/PromptEditor.test.tsx
git commit -m "test: add tests for collapsible system prompt"
```

---

### Task 3: Build and Manual Test

**Files:**
- Build: `context-lab/dist/`

- [ ] **Step 1: Run TypeScript type check and build**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual test in browser**

1. Start dev server: `npm run dev`
2. Open browser to the app
3. Verify system prompt section is collapsed by default with "▶"
4. Click arrow, verify it expands to show prompt editor
5. Click again, verify it collapses back to summary
6. Verify prompt editing still works correctly

- [ ] **Step 3: No commit needed**

(No files to commit)

---

## 自检

### 1. 规格覆盖率检查

✅ **默认收缩:** useState(false) 实现默认收缩状态  
✅ **精简展示:** 点击 ▶ 查看系统提示词 (N 字符) 实现  
✅ **箭头图标交互:** Toggle button 实现  
✅ **展开/收起功能:** 完整实现  

### 2. 占位符检查

✅ 没有 "TBD" 或 "TODO"  
✅ 所有代码示例完整  
✅ 所有命令都有预期输出  

### 3. 类型一致性检查

✅ 类型定义和实现一致  
✅ isExpanded 在组件中正确使用  
✅ systemPrompt 在组件中正确使用  

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-05-15-prompt-editor-collapsible-implementation.md`.

**两种执行选项:**

**1. Subagent-Driven (推荐)** - 我为每个任务派一个新的子agent，任务之间进行审查，快速迭代

**2. 内联执行** - 在本会话中使用 executing-plans 执行，批量执行并带有检查点

**选择哪种方式?**

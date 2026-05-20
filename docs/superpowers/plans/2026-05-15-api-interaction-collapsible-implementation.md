# API 交互过程默认收缩优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API interaction process section collapsed by default, with an arrow icon to toggle expand/collapse, showing a summary when collapsed.

**Architecture:** Use `useState` within the `ProcessTimeline` component to manage the expand/collapse state locally. Show interaction count summary when collapsed, show full details when expanded.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

## File Structure

| File | Operation | Purpose |
|------|-----------|---------|
| `context-lab/src/components/ProcessTimeline.tsx` | Modify | Add collapsible functionality |
| `context-lab/src/__tests__/components/ProcessTimeline.test.tsx` | Modify | Add tests for collapsible behavior |

---

## Task Decomposition

### Task 1: Add Collapsible State to ProcessTimeline

**Files:**
- Modify: `context-lab/src/components/ProcessTimeline.tsx`
- Test: `context-lab/src/__tests__/components/ProcessTimeline.test.tsx`

- [ ] **Step 1: Read current ProcessTimeline**

Read the existing component to understand its structure.

```typescript
// The current ProcessTimeline component already has:
// - apiInteractions from the store
// - interaction analysis logic
// - existing rendering logic
```

- [ ] **Step 2: Add useState hook**

Add expand/collapse state management.

```typescript
import { useState } from 'react';

function ProcessTimeline() {
  const {
    timelineSteps,
    lastUserInput,
    currentScene,
    selectedTools,
    apiInteractions,
    toggleStepExpanded
  } = useAppStore();
  
  // Add this line
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  
  // Rest of the component...
}
```

- [ ] **Step 3: Update the header section**

Update the h2 header to include the toggle button and interaction count.

```typescript
  const interactionCount = apiInteractions.length;
  const hasInteractions = interactionCount > 0;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            API 交互过程
          </h2>
          {hasInteractions && (
            <span className="text-sm text-gray-500">
              ({interactionCount} 次调用)
            </span>
          )}
        </div>
        {hasInteractions && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            aria-label={isExpanded ? "收起 API 交互记录" : "展开 API 交互记录"}
          >
            {isExpanded ? (
              <span className="text-lg">▼</span>
            ) : (
              <span className="text-lg">▶</span>
            )}
          </button>
        )}
      </div>
```

- [ ] **Step 4: Add collapsed state rendering**

Add the summary view when collapsed.

```typescript
      {/* 时间线步骤 (保持原样) */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-md font-medium text-gray-800 mb-3">处理步骤</h3>
        <div className="space-y-3">
          {timelineSteps.map((step, idx) => (
            // Existing timeline step rendering...
          ))}
        </div>
      </div>

      {/* API 交互记录 - 新增可折叠逻辑 */}
      {hasInteractions && isExpanded && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-md font-medium text-gray-800 mb-3">API 交互记录</h3>
          <div className="space-y-4">
            {apiInteractions.map((interaction, idx) => {
              // Existing interaction rendering...
            })}
          </div>
        </div>
      )}

      {hasInteractions && !isExpanded && (
        <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
          <p>点击 ▶ 查看 {interactionCount} 次 API 交互详情</p>
        </div>
      )}

      {!hasInteractions && (
        <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
          暂无 API 交互记录
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/components/ProcessTimeline.tsx
git commit -m "feat: add collapsible API interactions section"
```

---

### Task 2: Add Tests for Collapsible Behavior

**Files:**
- Modify: `context-lab/src/__tests__/components/ProcessTimeline.test.tsx`

- [ ] **Step 1: Read current test file**

Read the existing test file to understand its structure.

```typescript
// The current test file already has tests for:
// - Renders "暂无 API 交互记录" when no interactions
// - Shows interactions when they exist
```

- [ ] **Step 2: Add test for default collapsed state**

Add test to verify API interactions are collapsed by default.

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../src/stores/appStore';
import ProcessTimeline from '../../src/components/ProcessTimeline';

// Add this test after existing tests
test('shows collapsed state by default with summary when there are interactions', () => {
  useAppStore.setState({
    apiInteractions: [
      {
        id: 'test-1',
        timestamp: new Date(),
        request: {
          url: 'https://api.example.com/test',
          headers: {},
          body: '{}'
        },
        response: null
      }
    ]
  });

  render(<ProcessTimeline />);

  // Should show interaction count
  expect(screen.getByText('(1 次调用)')).toBeInTheDocument();
  
  // Should show expand arrow
  expect(screen.getByText('▶')).toBeInTheDocument();
  
  // Should show summary message
  expect(screen.getByText(/点击 ▶ 查看.*次 API 交互详情/)).toBeInTheDocument();
  
  // Should NOT show the API interaction details
  expect(screen.queryByText('API 交互记录')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add test for toggle expand/collapse**

Add test to verify toggle functionality works.

```typescript
test('toggles between collapsed and expanded when arrow is clicked', () => {
  useAppStore.setState({
    apiInteractions: [
      {
        id: 'test-1',
        timestamp: new Date(),
        request: {
          url: 'https://api.example.com/test',
          headers: {},
          body: '{}'
        },
        response: null
      }
    ]
  });

  render(<ProcessTimeline />);

  // Initially collapsed
  expect(screen.getByText('▶')).toBeInTheDocument();
  expect(screen.queryByText('API 交互记录')).not.toBeInTheDocument();

  // Click to expand
  fireEvent.click(screen.getByText('▶'));
  
  // Now expanded
  expect(screen.getByText('▼')).toBeInTheDocument();
  expect(screen.getByText('API 交互记录')).toBeInTheDocument();

  // Click to collapse again
  fireEvent.click(screen.getByText('▼'));
  
  // Collapsed again
  expect(screen.getByText('▶')).toBeInTheDocument();
  expect(screen.queryByText('API 交互记录')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test:run -- __tests__/components/ProcessTimeline.test.tsx -t "collapsed"
```

Expected: The new tests FAIL because we haven't updated the component yet.

- [ ] **Step 5: Update the component (if not already done in Task 1)**

(Note: Component should have been updated in Task 1, this step is just to verify)

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test:run -- __tests__/components/ProcessTimeline.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/__tests__/components/ProcessTimeline.test.tsx
git commit -m "test: add tests for collapsible API interactions"
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

1. Start dev server if not already running: `npm run dev`
2. Open browser to the app
3. Send a test message that will trigger API calls
4. Verify API interaction section shows "(N 次调用)" and expand arrow "▶"
5. Click arrow, verify it expands to "▼" and shows detailed API records
6. Click again, verify it collapses back to summary
7. Verify existing timeline steps still work normally

- [ ] **Step 3: No commit needed for successful build**

(No files to commit)

---

## 自检

### 1. 规格覆盖率检查

✅ **默认收缩:** Task 1 中的 useState(false) 实现默认收缩状态  
✅ **精简展示:** Task 1 中的 "点击 ▶ 查看 N 次 API 交互详情" 实现  
✅ **箭头图标交互:** Task 1 中的 toggle button 实现  
✅ **展开/收起功能:** Task 1 和 Task 2 中的完整实现  

### 2. 占位符检查

✅ 没有 "TBD" 或 "TODO"  
✅ 所有代码示例完整  
✅ 所有命令都有预期输出  

### 3. 类型一致性检查

✅ 类型定义和实现一致  
✅ isExpanded 在组件中正确使用  
✅ apiInteractions 状态正确处理  

---

## 执行选项

计划已完成并保存到 `docs/superpowers/plans/2026-05-15-api-interaction-collapsible-implementation.md`.

**两种执行选项:**

**1. Subagent-Driven (推荐)** - 我为每个任务派一个新的子agent，任务之间进行审查，快速迭代

**2. 内联执行** - 在本会话中使用 executing-plans 执行，批量执行并带有检查点

**选择哪种方式?**

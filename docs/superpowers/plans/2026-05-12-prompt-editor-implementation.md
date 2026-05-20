# 系统提示词编辑器组件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现系统提示词编辑器组件，支持预设场景和自定义场景，提供实时 Token 计数、保存和恢复默认功能。

**Architecture:** 使用 React 受控组件，与 appStore 集成，通过 props 传递状态和回调函数。遵循 TDD 原则，先写测试再写实现。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Jest（Testing Library）

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `context-lab/src/components/PromptEditor.tsx` | 创建 | 系统提示词编辑器组件 |
| `context-lab/src/components/__tests__/PromptEditor.test.tsx` | 创建 | 单元测试 |
| `context-lab/src/App.tsx` | 修改 | 集成 PromptEditor 组件 |
| `context-lab/src/stores/appStore.ts` | 修改 | 添加恢复默认提示词的方法 |

---

## 任务分解

### 任务 1：更新 AppStore 添加恢复默认提示词功能

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`
- Test: `context-lab/src/components/__tests__/PromptEditor.test.tsx`（稍后测试）

- [ ] **Step 1: Read current appStore**

Read the existing appStore to understand its structure.

```typescript
// Current content in context-lab/src/stores/appStore.ts
```

- [ ] **Step 2: Add resetPromptForScene method**

Add a method to reset the system prompt for a given scene.

```typescript
// In appStore.ts, after existing methods, add:
resetPromptForScene: (scene: string) => void;

// In the implementation, add:
resetPromptForScene: (scene: string) => {
  const defaultPrompt = store.getState().loadPromptForScene(scene);
  set({ systemPrompt: defaultPrompt });
},
```

- [ ] **Step 3: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/stores/appStore.ts
git commit -m "feat: add resetPromptForScene method to appStore"
```

---

### 任务 2：创建 PromptEditor 组件

**Files:**
- Create: `context-lab/src/components/PromptEditor.tsx`
- Test: `context-lab/src/components/__tests__/PromptEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create the test file with test cases.

```typescript
// context-lab/src/components/__tests__/PromptEditor.test.tsx
import { describe, test, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptEditor from '../PromptEditor';

describe('PromptEditor component', () => {
  test('renders read-only prompt in preset scenes', () => {
    render(
      <PromptEditor
        isCustom={false}
        initialPrompt="Test prompt"
        onPromptChange={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    const saveBtn = screen.queryByText('保存');
    const resetBtn = screen.queryByText('恢复默认');
    
    expect(textarea).toBeDisabled();
    expect(saveBtn).not.toBeInTheDocument();
    expect(resetBtn).not.toBeInTheDocument();
    expect(textarea).toHaveValue('Test prompt');
  });

  test('renders editable prompt in custom scenes', () => {
    const handleChange = jest.fn();
    const handleSave = jest.fn();
    const handleReset = jest.fn();
    
    render(
      <PromptEditor
        isCustom={true}
        initialPrompt="Test prompt"
        onPromptChange={handleChange}
        onSave={handleSave}
        onReset={handleReset}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    const saveBtn = screen.getByText('保存');
    const resetBtn = screen.getByText('恢复默认');
    
    expect(textarea).not.toBeDisabled();
    expect(saveBtn).toBeInTheDocument();
    expect(resetBtn).toBeInTheDocument();
    
    // Test edit functionality
    fireEvent.change(textarea, { target: { value: 'New value' } });
    expect(handleChange).toHaveBeenCalledWith('New value');
  });

  test('displays token count', () => {
    render(
      <PromptEditor
        isCustom={true}
        initialPrompt="This is a test prompt with some content"
        onPromptChange={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />
    );
    
    // Should display token count (tokenService.calculate estimates tokens as ~4 chars/token)
    const tokenText = screen.getByText(/tokens/);
    expect(tokenText).toBeInTheDocument();
  });

  test('calls onSave when save button is clicked', () => {
    const handleSave = jest.fn();
    
    render(
      <PromptEditor
        isCustom={true}
        initialPrompt="Test"
        onPromptChange={() => {}}
        onSave={handleSave}
        onReset={() => {}}
      />
    );
    
    fireEvent.click(screen.getByText('保存'));
    expect(handleSave).toHaveBeenCalled();
  });

  test('calls onReset and updates prompt when reset button is clicked', () => {
    const handleChange = jest.fn();
    const handleReset = jest.fn();
    
    render(
      <PromptEditor
        isCustom={true}
        initialPrompt="Original prompt"
        onPromptChange={handleChange}
        onSave={() => {}}
        onReset={handleReset}
      />
    );
    
    // First change the prompt
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Modified prompt' } });
    
    // Then reset
    fireEvent.click(screen.getByText('恢复默认'));
    
    expect(handleReset).toHaveBeenCalled();
    expect(textarea).toHaveValue('Original prompt');
    expect(handleChange).toHaveBeenCalledWith('Original prompt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test
```

Expected: FAIL with "Cannot find module '../PromptEditor'"

- [ ] **Step 3: Write minimal implementation**

Create the PromptEditor component.

```typescript
// context-lab/src/components/PromptEditor.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { TokenService } from '../services/tokenService';

const tokenService = new TokenService();

interface PromptEditorProps {
  isCustom: boolean;
  initialPrompt: string;
  onPromptChange: (prompt: string) => void;
  onSave: () => void;
  onReset: () => void;
}

export default function PromptEditor({
  isCustom,
  initialPrompt,
  onPromptChange,
  onSave,
  onReset
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const tokenCount = useMemo(() => tokenService.calculate(prompt), [prompt]);

  // Sync with external prop changes
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    onPromptChange(newValue);
  };

  const handleReset = () => {
    setPrompt(initialPrompt);
    onPromptChange(initialPrompt);
    onReset();
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="system-prompt" className="block text-sm font-medium text-gray-700">
          系统提示词
        </label>
        <div className="text-sm text-gray-500">
          {tokenCount} tokens
        </div>
      </div>
      
      <textarea
        id="system-prompt"
        value={prompt}
        onChange={handleChange}
        disabled={!isCustom}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
        rows={6}
        placeholder="请输入系统提示词..."
      />
      
      <div className="flex gap-2 mt-2">
        {isCustom ? (
          <>
            <button
              onClick={onSave}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              保存
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              恢复默认
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-500">
            预设场景提示词不可编辑
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/components/PromptEditor.tsx src/components/__tests__/PromptEditor.test.tsx
git commit -m "feat: add PromptEditor component"
```

---

### 任务 3：集成 PromptEditor 到 App.tsx

**Files:**
- Modify: `context-lab/src/App.tsx`
- Test: `context-lab/src/App.test.tsx`（可在现有基础上扩展）

- [ ] **Step 1: Write the failing test**

Add a simple integration test to App.test.tsx.

```typescript
// Add to context-lab/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App integration', () => {
  test('renders PromptEditor component', () => {
    render(<App />);
    const promptLabel = screen.getByText('系统提示词');
    expect(promptLabel).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test
```

Expected: FAIL with "Unable to find element with text: 系统提示词"

- [ ] **Step 3: Write minimal implementation**

Update App.tsx to integrate PromptEditor.

```typescript
// context-lab/src/App.tsx
import React from 'react';
import './App.css';
import SceneSelector from './components/SceneSelector';
import StrategySelector from './components/StrategySelector';
import ContextSizeSlider from './components/ContextSizeSlider';
import PromptEditor from './components/PromptEditor';
import { useAppStore } from './stores/appStore';

const App: React.FC = () => {
  const {
    currentScene,
    systemPrompt,
    setSystemPrompt,
    saveUserConfig,
    resetPromptForScene
  } = useAppStore();

  const isCustom = currentScene === 'custom';

  return (
    <div className="app max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Context Lab</h1>
      <p className="mb-6 text-gray-600">智能体上下文管理实验平台</p>
      
      <SceneSelector />
      <StrategySelector />
      <ContextSizeSlider />
      
      <PromptEditor
        isCustom={isCustom}
        initialPrompt={systemPrompt}
        onPromptChange={setSystemPrompt}
        onSave={saveUserConfig}
        onReset={() => resetPromptForScene(currentScene)}
      />
    </div>
  );
};

export default App;
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/App.tsx
git commit -m "feat: integrate PromptEditor into App"
```

---

### 任务 4：构建和手动测试

**Files:**
- Build: `context-lab/dist/`（构建输出）

- [ ] **Step 1: Run TypeScript type check**

Run:
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 2: Verify build output**

Check that the dist directory contains valid build output.

- [ ] **Step 3: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git status
```

(No new files to commit for a successful build)

---

## 自检

### 1. 规格覆盖率检查

✅ 所有设计文档中的功能都有对应的任务实现  
✅ 预设场景只读模式：任务 2 和任务 3  
✅ 自定义场景编辑模式：任务 2 和任务 3  
✅ 实时 Token 计数：任务 2  
✅ 保存和恢复默认功能：任务 1、任务 2 和任务 3  

### 2. 占位符检查

✅ 没有 "TBD" 或 "TODO"  
✅ 所有代码示例完整  
✅ 所有命令都有预期输出  

### 3. 类型一致性检查

✅ 类型定义和实现一致  
✅ `PromptEditorProps` 接口在任务 2 中完整定义  
✅ appStore 方法签名一致  

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-05-12-prompt-editor-implementation.md`. 

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

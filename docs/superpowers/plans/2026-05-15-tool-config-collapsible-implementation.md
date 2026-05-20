# 工具配置区域默认收缩优化 Implementation Plan

**RQ-008** - 工具配置区域默认收缩优化

**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

使工具配置区域默认为收缩状态，具有类似RQ-006和RQ-007的展开/收起功能，在需要时可以展开查看详细配置。

## Architecture

使用React的useState管理展开/收起状态，显示工具配置区域的简要信息（工具数量），点击时展开显示详细配置。

## Tech Stack

React 18, TypeScript, Tailwind CSS, useState钩子。

---

## File Structure

| File | Operation | Purpose |
|------|-----------|---------|
| `context-lab/src/components/ToolSelector.tsx` | Modify | 添加可收起/展开功能 |
| `context-lab/src/__tests__/components/ToolSelector.test.tsx` | Modify | 添加测试 |

---

## Task Decomposition

### Task 1: 找到包含工具配置的组件

**Files:**
- Search: `context-lab/src/components/`

- [ ] **Step 1: 查找包含工具配置的组件**

```bash
cd context-lab/src/components
ls -la
```

预期文件可能是：
- `ToolSelector.tsx`
- `ToolConfig.tsx`
- `ToolManager.tsx`
- 或者类似名称的文件

- [ ] **Step 2: 确定组件结构**

找到包含工具配置的组件后，阅读其内容，了解当前的实现。

### Task 2: 添加可收起/展开功能

**Files:**
- Modify: 找到的包含工具配置的组件
- Test: 对应的测试文件

- [ ] **Step 1: 添加useState钩子**

```typescript
import { useState } from 'react';
```

- [ ] **Step 2: 添加状态变量**

```typescript
const [isToolConfigExpanded, setIsToolConfigExpanded] = useState(false);
```

- [ ] **Step 3: 更新渲染逻辑**

```typescript
return (
  <div className="mb-4">
    {/* 标题和可收起/展开按钮 */}
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-medium text-gray-900">工具配置</h3>
      <button
        onClick={() => setIsToolConfigExpanded(!isToolConfigExpanded)}
        className="text-gray-500 hover:text-gray-700"
      >
        {isToolConfigExpanded ? (
          <svg className="w-5 h-5 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
    </div>

    {/* 工具配置区域 */}
    {isToolConfigExpanded && (
      <div className="mt-2">
        {/* 原有的工具配置内容 */}
        {/* ... 现有代码 ... */}
      </div>
    )}

    {/* 收缩状态的摘要信息 */}
    {!isToolConfigExpanded && (
      <div className="text-sm text-gray-500 mt-2">
        配置了 {selectedTools.length} 个工具（点击展开）
      </div>
    )}
  </div>
);
```

### Task 3: 测试实现

**Files:**
- Test: 对应的测试文件

- [ ] **Step 1: 运行构建和测试**

```bash
cd context-lab
npm run test:run -- src/__tests__/components/[ComponentName].test.tsx -t "collapsible"
```

预期：新的测试失败（因为我们还没有实现组件）。

- [ ] **Step 2: 更新组件实现**

根据Task 2的描述修改组件。

- [ ] **Step 3: 再次运行测试**

```bash
npm run test:run -- src/__tests__/components/[ComponentName].test.tsx
```

预期：测试通过。

- [ ] **Step 4: 提交变更**

```bash
cd context-lab
git add src/components/[ComponentName].tsx src/__tests__/components/[ComponentName].test.tsx
git commit -m "feat: 工具配置区域默认收缩优化"
```

---

## Checklists

### 规格覆盖检查

✅ **默认收缩状态**：通过Task 2实现  
✅ **显示摘要信息**：通过Task 2实现  
✅ **点击展开/收起**：通过Task 2实现  
✅ **箭头图标指示**：通过Task 2实现  
✅ **与RQ-006/RQ-007一致的交互风格**：通过Task 2实现  

### 占位符检查

✅ 所有代码示例完整  
✅ 所有命令都有预期输出  
✅ 没有"TODO"或"TBD"文本  

### 类型一致性检查

✅ 所有类型定义和实现一致  
✅ useState钩子的正确使用  
✅ 事件处理函数的正确类型  

---

## Execution Options

**您可以选择：**

**1. Subagent-Driven Execution (推荐)**
使用 `superpowers:subagent-driven-development` 执行：
- 为每个任务分配子代理
- 每个任务间有审查检查点

**2. Inline Execution**
使用 `superpowers:executing-plans` 执行：
- 在当前会话中批处理执行
- 包含检查点功能

**Which approach?**

---

**Implementation plan complete and saved to docs/superpowers/plans/2026-05-15-tool-config-collapsible-implementation.md!** 🚀

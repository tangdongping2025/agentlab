# API 交互记录内联展示实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 API 请求/响应报文记录从上下文可视化区域移动到对话过程区域，并实现内联展开式显示。

**Architecture:** 增强 ProcessTimeline 组件，添加步骤展开/收起功能，为每个步骤添加详细信息记录和显示，实现 API 交互和工具调用的完整过程展示。

**Tech Stack:** React 18 + TypeScript 5.x + Tailwind CSS + Zustand

---

## 文件结构规划

### 修改的文件：
- `src/components/ProcessTimeline.tsx` - 增强时间线组件，添加内联展示功能
- `src/stores/appStore.ts` - 完善状态管理，添加步骤详情记录
- `src/types.ts` - 添加类型定义

### 创建的文件：
- `src/components/StepDetails.tsx` - 步骤详情渲染组件
- `src/components/ApiDetails.tsx` - API 详情渲染组件
- `src/components/ToolDetails.tsx` - 工具详情渲染组件

---

## 任务分解

### Task 1: 增强类型定义

**Files:**
- Create: `src/types/enhancedTimeline.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: 定义增强的步骤类型**

```typescript
// src/types/enhancedTimeline.ts
export interface EnhancedTimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  details?: {
    type: 'api' | 'tool' | 'context' | 'default';
    content: any;
  };
  expandable: boolean;
  expanded: boolean;
}

export interface ApiInteractionDetails {
  type: 'api';
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    duration: number;
  };
}

export interface ToolInteractionDetails {
  type: 'tool';
  toolName: string;
  toolParameters: any;
  toolOutput: any;
}
```

- [ ] **Step 2: 导出类型**

```typescript
// src/types/index.ts
export * from './enhancedTimeline';
```

- [ ] **Step 3: 运行类型检查**

```bash
cd context-lab
npm run typecheck
```

- [ ] **Step 4: 提交任务**

```bash
git add src/types/enhancedTimeline.ts src/types/index.ts
git commit -m "feat: 添加增强的时间线类型定义"
```

### Task 2: 完善状态管理

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: 更新状态接口**

```typescript
import { EnhancedTimelineStep } from '../types/enhancedTimeline';

interface AppState {
  // 原有的状态...
  
  // 对话过程详情
  timelineSteps: EnhancedTimelineStep[];
  
  // 步骤操作方法
  toggleStepExpanded: (stepId: string) => void;
  setStepDetails: (stepId: string, details: any) => void;
  clearStepDetails: (stepId: string) => void;
  
  // 工具交互方法
  recordToolInteraction: (stepId: string, toolName: string, parameters: any, output: any) => void;
}
```

- [ ] **Step 2: 更新状态初始化**

```typescript
export const useAppStore = create<AppState>((set, get) => ({
  // 原有的状态...
  
  timelineSteps: [
    {
      id: 'user-input',
      icon: '💬',
      title: '用户输入',
      description: '等待用户输入...',
      active: true,
      completed: false,
      expandable: false,
      expanded: false
    },
    {
      id: 'context-pack',
      icon: '🧠',
      title: '上下文打包',
      description: '正在处理上下文...',
      active: false,
      completed: false,
      expandable: false,
      expanded: false
    },
    {
      id: 'api-request',
      icon: '📡',
      title: 'API 请求',
      description: '正在发送请求...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'tool-call',
      icon: '🔧',
      title: '工具调用',
      description: '正在调用工具...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'api-response',
      icon: '📥',
      title: 'API 响应',
      description: '正在处理响应...',
      active: false,
      completed: false,
      expandable: true,
      expanded: false
    },
    {
      id: 'agent-response',
      icon: '🤖',
      title: '智能体响应',
      description: '正在生成响应...',
      active: false,
      completed: false,
      expandable: false,
      expanded: false
    }
  ],
  
  // 步骤操作方法
  toggleStepExpanded: (stepId: string) => set((state) => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, expanded: !step.expanded } : step
    )
  })),
  
  setStepDetails: (stepId: string, details: any) => set((state) => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, details } : step
    )
  })),
  
  clearStepDetails: (stepId: string) => set((state) => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, details: undefined } : step
    )
  })),
  
  recordToolInteraction: (stepId: string, toolName: string, parameters: any, output: any) => set((state) => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? {
        ...step,
        details: {
          type: 'tool',
          content: {
            toolName,
            toolParameters: parameters,
            toolOutput: output
          }
        }
      } : step
    )
  })),
  
  // 原有的方法...
}));
```

- [ ] **Step 3: 运行类型检查**

```bash
npm run typecheck
```

- [ ] **Step 4: 提交任务**

```bash
git add src/stores/appStore.ts
git commit -m "feat: 完善状态管理，添加步骤详情和工具交互记录"
```

### Task 3: 创建详情渲染组件

**Files:**
- Create: `src/components/ApiDetails.tsx`
- Create: `src/components/ToolDetails.tsx`
- Create: `src/components/StepDetails.tsx`

- [ ] **Step 1: 创建 API 详情组件**

```tsx
// src/components/ApiDetails.tsx
import React from 'react';
import { ApiInteractionDetails } from '../types/enhancedTimeline';

interface ApiDetailsProps {
  details: ApiInteractionDetails;
}

const ApiDetails: React.FC<ApiDetailsProps> = ({ details }) => {
  return (
    <div className="api-interaction-details">
      {/* 请求部分 */}
      <div className="api-section request">
        <div className="api-section-header">
          <span className="api-method">{details.request.method}</span>
          <span className="api-url">{details.request.url}</span>
        </div>
        <div className="api-headers">
          <h4>请求头</h4>
          <pre className="headers-content">
            {JSON.stringify(details.request.headers, null, 2)}
          </pre>
        </div>
        <div className="api-body">
          <h4>请求体</h4>
          <pre className="body-content">
            {JSON.stringify(JSON.parse(details.request.body), null, 2)}
          </pre>
        </div>
      </div>
      
      {/* 响应部分 */}
      <div className="api-section response">
        <div className="api-section-header">
          <span className={`response-status status-${details.response.status}`}>
            {details.response.status} {details.response.statusText}
          </span>
          <span className="response-time">{details.response.duration}ms</span>
        </div>
        <div className="api-headers">
          <h4>响应头</h4>
          <pre className="headers-content">
            {JSON.stringify(details.response.headers, null, 2)}
          </pre>
        </div>
        <div className="api-body">
          <h4>响应体</h4>
          <pre className="body-content">
            {JSON.stringify(JSON.parse(details.response.body), null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ApiDetails;
```

- [ ] **Step 2: 创建工具详情组件**

```tsx
// src/components/ToolDetails.tsx
import React from 'react';
import { ToolInteractionDetails } from '../types/enhancedTimeline';

interface ToolDetailsProps {
  details: ToolInteractionDetails;
}

const ToolDetails: React.FC<ToolDetailsProps> = ({ details }) => {
  return (
    <div className="tool-interaction-details">
      <div className="tool-info">
        <span className="tool-name">工具名称: {details.toolName}</span>
      </div>
      <div className="tool-request">
        <h4>工具输入参数</h4>
        <pre className="tool-content">
          {JSON.stringify(details.toolParameters, null, 2)}
        </pre>
      </div>
      <div className="tool-response">
        <h4>工具输出结果</h4>
        <pre className="tool-content">
          {JSON.stringify(details.toolOutput, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ToolDetails;
```

- [ ] **Step 3: 创建步骤详情组件**

```tsx
// src/components/StepDetails.tsx
import React from 'react';
import ApiDetails from './ApiDetails';
import ToolDetails from './ToolDetails';
import { EnhancedTimelineStep } from '../types/enhancedTimeline';

interface StepDetailsProps {
  step: EnhancedTimelineStep;
}

const StepDetails: React.FC<StepDetailsProps> = ({ step }) => {
  if (!step.details) return null;

  switch (step.details.type) {
    case 'api':
      return <ApiDetails details={step.details as any} />;
    case 'tool':
      return <ToolDetails details={step.details as any} />;
    case 'context':
      return (
        <div className="context-details">
          <pre>{JSON.stringify(step.details.content, null, 2)}</pre>
        </div>
      );
    default:
      return (
        <div className="default-details">
          <p>{step.details.content}</p>
        </div>
      );
  }
};

export default StepDetails;
```

- [ ] **Step 4: 运行类型检查**

```bash
npm run typecheck
```

- [ ] **Step 5: 提交任务**

```bash
git add src/components/ApiDetails.tsx src/components/ToolDetails.tsx src/components/StepDetails.tsx
git commit -m "feat: 创建步骤详情渲染组件"
```

### Task 4: 重构 ProcessTimeline 组件

**Files:**
- Modify: `src/components/ProcessTimeline.tsx`

- [ ] **Step 1: 重构组件**

```tsx
// src/components/ProcessTimeline.tsx
import React from 'react';
import { useAppStore } from '../stores/appStore';
import StepDetails from './StepDetails';
import { EnhancedTimelineStep } from '../types/enhancedTimeline';

function ProcessTimeline() {
  const { timelineSteps, toggleStepExpanded } = useAppStore();

  const handleToggleExpanded = (stepId: string) => {
    toggleStepExpanded(stepId);
  };

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">对话过程</h2>

      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="space-y-4">
          {timelineSteps.map((step, index) => (
            <div
              key={step.id}
              data-testid={`timeline-step-${step.id}`}
              className={`flex flex-col ${index < timelineSteps.length - 1 ? 'pb-4 border-b border-gray-200' : ''}`}
            >
              {/* 步骤头部 */}
              <div
                className="step-header flex items-center gap-4 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => step.expandable && handleToggleExpanded(step.id)}
              >
                {/* 图标 */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0
                  ${step.active ? 'bg-blue-100 text-blue-600' :
                    step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                  {step.icon}
                </div>

                {/* 内容 */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-medium ${step.active ? 'text-gray-900' :
                      step.completed ? 'text-gray-700' : 'text-gray-500'}`}>
                      {step.title}
                    </h3>
                    {step.completed && (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        完成
                      </span>
                    )}
                    {step.active && !step.completed && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                        进行中...
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${step.active ? 'text-gray-600' :
                    step.completed ? 'text-gray-500' : 'text-gray-400'}`}>
                    {step.description}
                  </p>
                </div>

                {/* 展开图标 */}
                {step.expandable && (
                  <div className="text-gray-400">
                    {step.expanded ? '▼' : '▶'}
                  </div>
                )}
              </div>

              {/* 步骤详情 */}
              {step.expanded && step.details && (
                <div className="step-details ml-14 mt-2 p-4 bg-white rounded-lg border border-gray-200">
                  <StepDetails step={step} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProcessTimeline;
```

- [ ] **Step 2: 添加样式**

```css
/* 在 src/App.css 中添加 */
.api-interaction-details {
  margin-bottom: 1rem;
}

.api-section {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 0.375rem;
  border-left: 3px solid;
  
  &.request {
    border-left-color: #3b82f6;
  }
  
  &.response {
    border-left-color: #10b981;
  }
}

.api-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.api-method {
  font-weight: 600;
  color: #3b82f6;
}

.api-url {
  font-size: 0.875rem;
  color: #4b5563;
}

.response-status {
  font-weight: 600;
  
  &.status-200 {
    color: #10b981;
  }
  
  &.status-400 {
    color: #f59e0b;
  }
  
  &.status-500 {
    color: #ef4444;
  }
}

.response-time {
  font-size: 0.875rem;
  color: #6b7280;
}

.api-headers,
.api-body {
  margin-bottom: 0.5rem;
}

.api-headers h4,
.api-body h4 {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.pre {
  background: #f1f5f9;
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}

.tool-interaction-details {
  margin-bottom: 1rem;
}

.tool-info {
  margin-bottom: 0.75rem;
}

.tool-name {
  font-weight: 600;
  color: #3b82f6;
}

.tool-request,
.tool-response {
  margin-bottom: 0.75rem;
}

.tool-request h4,
.tool-response h4 {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.tool-content {
  background: #f1f5f9;
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
```

- [ ] **Step 3: 运行类型检查**

```bash
npm run typecheck
```

- [ ] **Step 4: 提交任务**

```bash
git add src/components/ProcessTimeline.tsx src/App.css
git commit -m "feat: 重构 ProcessTimeline 组件，添加内联展开功能"
```

### Task 5: 更新 ChatInteraction 组件

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

- [ ] **Step 1: 添加步骤详情记录**

```tsx
// src/components/ChatInteraction.tsx
async function handleSend() {
  // 原有的代码...
  
  // 步骤 3: API 请求发送（添加详情）
  const request = prepareApiRequest(context);
  setStepDetails('api-request', {
    type: 'api',
    content: {
      request: request,
      response: null
    }
  });
  
  // 发送请求
  const response = await sendApiRequest(request);
  
  // 更新 API 响应详情
  setStepDetails('api-request', {
    type: 'api',
    content: {
      request,
      response: responseDetails
    }
  });
  
  // 步骤 4: 工具调用（如果需要）
  if (response.needsTool) {
    const toolName = response.toolName;
    const parameters = extractToolParameters(response);
    
    setStepDetails('tool-call', {
      type: 'tool',
      content: {
        toolName,
        toolParameters: parameters,
        toolOutput: null
      }
    });
    
    const toolOutput = await callTool(toolName, parameters);
    
    setStepDetails('tool-call', {
      type: 'tool',
      content: {
        toolName,
        toolParameters: parameters,
        toolOutput
      }
    });
  }
  
  // 步骤 5: 智能体响应
  const agentResponse = processResponse(response, toolOutput);
  updateTimelineStep('agent-response', '处理完成');
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

- [ ] **Step 3: 提交任务**

```bash
git add src/components/ChatInteraction.tsx
git commit -m "feat: 更新 ChatInteraction 组件，添加步骤详情记录"
```

### Task 6: 更新 ContextVisualizer 组件

**Files:**
- Modify: `src/components/ContextVisualizer.tsx`

- [ ] **Step 1: 移除 API 交互记录**

```tsx
// src/components/ContextVisualizer.tsx
// 移除 API 交互记录部分
function ContextVisualizer() {
  // 原有的代码...
  
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">上下文窗口</h2>

      <div className="space-y-4">
        {/* Token使用统计 */}
        {/* 系统提示词 */}
        {/* 用户提示词 */}
        {/* 对话历史 */}
        {/* 移除 API 交互记录部分 */}
      </div>

      <DetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        content={modalContent}
      />
    </section>
  );
}

export default ContextVisualizer;
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

- [ ] **Step 3: 提交任务**

```bash
git add src/components/ContextVisualizer.tsx
git commit -m "feat: 移除 ContextVisualizer 中的 API 交互记录"
```

### Task 7: 测试和优化

**Files:**
- 所有修改过的文件

- [ ] **Step 1: 运行测试**

```bash
npm run test
```

- [ ] **Step 2: 修复测试问题**

如果有测试失败，修复相应问题。

- [ ] **Step 3: 优化性能**

检查并优化组件渲染性能，确保展开/收起功能流畅。

- [ ] **Step 4: 提交任务**

```bash
git add -u
git commit -m "chore: 测试和优化"
```

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-api-interaction-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

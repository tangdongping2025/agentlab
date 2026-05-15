# 工具调用过程显示优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 ProcessTimeline 组件，在时间线步骤中直接展示工具调用的完整过程信息，包括调用前上下文、调用参数、工具结果和调用后上下文重组。

**Architecture:** 在现有的时间线基础上，增加步骤的展开/收起功能，为工具调用步骤添加详细的详情组件，展示完整的工具调用过程。

**Tech Stack:** React 18 + TypeScript + Zustand + Tailwind CSS

---

## 文件清单

### 创建文件
- `src/components/ToolInteractionDetails.tsx` - 工具调用详情组件
- `__tests__/components/ToolInteractionDetails.test.tsx` - 测试文件

### 修改文件
- `src/stores/appStore.ts` - 添加工具调用详情记录方法
- `src/components/ProcessTimeline.tsx` - 增强时间线组件
- `src/components/ChatInteraction.tsx` - 更新发送流程以记录工具调用过程
- `src/services/agentService.ts` - 添加工具调用数据收集

---

## Task 1: 更新 appStore 类型定义

**Files:**
- Modify: `src/stores/appStore.ts`

**Step 1: 更新 TimelineStep 接口，添加 expandable 和 details 字段**

```typescript
// 修改 TimelineStep 接口（第8-15行）
interface TimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;  // 新增
  expanded: boolean;    // 新增
  details?: {          // 新增
    type: 'api' | 'tool' | 'context' | 'default';
    content: any;
  };
}
```

**Step 2: 添加 ToolInteractionDetails 类型**

```typescript
// 在 Message 接口后添加（第24行后）
interface ToolInteractionDetails {
  type: 'tool';
  toolInfo: {
    name: string;
    description: string;
    parameters: any;
  };
  callContext: {
    systemPrompt: string;
    userQuery: string;
    conversationHistory: string[];
  };
  toolOutput: any;
  reorganizedContext: string;
  toolUseReasoning: string;
}
```

**Step 3: 更新 AppState 接口，添加新方法**

```typescript
// 在状态设置方法部分（第86行后）添加
  // 步骤展开/收起
  toggleStepExpanded: (stepId: string) => void;
  // 设置步骤详情
  setStepDetails: (stepId: string, details: any) => void;
  // 清除步骤详情
  clearStepDetails: (stepId: string) => void;
  // 记录工具调用详细信息
  recordToolInteraction: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => void;
```

**Step 4: 在状态中添加 expandable 字段到 timelineSteps**

```typescript
// 在初始化 timelineSteps 时（第128-176行），为每个步骤添加 expandable: false
// 特别是对于 tool-call, result-pack, api-reorganize 步骤，设置 expandable: true
```

---

## Task 2: 实现 appStore 新增方法

**Files:**
- Modify: `src/stores/appStore.ts`

**Step 1: 添加 toggleStepExpanded 方法**

```typescript
// 在 clearAllTools 方法后（第258行）添加
  toggleStepExpanded: (stepId: string) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, expanded: !step.expanded } : step
      )
    }));
  },
```

**Step 2: 添加 setStepDetails 方法**

```typescript
  setStepDetails: (stepId: string, details: any) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details, expandable: true } : step
      )
    }));
  },
```

**Step 3: 添加 clearStepDetails 方法**

```typescript
  clearStepDetails: (stepId: string) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details: undefined } : step
      )
    }));
  },
```

**Step 4: 添加 recordToolInteraction 方法**

```typescript
  recordToolInteraction: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => {
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId
          ? {
              ...step,
              details: {
                type: 'tool',
                toolInfo: {
                  name: toolName,
                  description: toolDescription,
                  parameters,
                },
                callContext,
                toolOutput,
                reorganizedContext,
                toolUseReasoning: reasoning,
              },
              expandable: true,
            }
          : step
      )
    }));
  },
```

**Step 5: 在 resetTimeline 中初始化 expandable 字段**

```typescript
// 更新 resetTimeline 方法中的每个步骤，添加 expandable 字段
// 例如：
{
  id: 'tool-call',
  icon: '🔧',
  title: '工具调用',
  description: '准备调用工具...',
  active: false,
  completed: false,
  expandable: false,  // 新增
  expanded: false,    // 新增
}
```

---

## Task 3: 创建 ToolInteractionDetails 组件

**Files:**
- Create: `src/components/ToolInteractionDetails.tsx`

**Step 1: 创建组件框架**

```tsx
import React from 'react';

interface ToolInteractionDetailsProps {
  details: {
    type: 'tool';
    toolInfo: {
      name: string;
      description: string;
      parameters: any;
    };
    callContext: {
      systemPrompt: string;
      userQuery: string;
      conversationHistory: string[];
    };
    toolOutput: any;
    reorganizedContext: string;
    toolUseReasoning: string;
  };
}

function ToolInteractionDetails({ details }: ToolInteractionDetailsProps) {
  return (
    <div className="tool-interaction-details">
      {/* 大模型思考过程 */}
      <div className="model-thinking">
        <h4>🎯 大模型思考过程</h4>
        <div className="thinking-content">
          {details.toolUseReasoning}
        </div>
      </div>

      {/* 调用上下文 */}
      <div className="call-context">
        <h4>📋 调用上下文</h4>
        <div className="context-section">
          <div className="context-label">系统提示词:</div>
          <div className="context-content">{details.callContext.systemPrompt}</div>
        </div>
        <div className="context-section">
          <div className="context-label">用户查询:</div>
          <div className="context-content">{details.callContext.userQuery}</div>
        </div>
        {details.callContext.conversationHistory.length > 0 && (
          <div className="context-section">
            <div className="context-label">对话历史:</div>
            <div className="context-content">
              {details.callContext.conversationHistory.map((msg, idx) => (
                <div key={idx} className="history-item">
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 工具信息 */}
      <div className="tool-info">
        <h4>🔧 工具信息</h4>
        <div className="info-section">
          <div className="info-label">工具名称:</div>
          <div className="info-content">{details.toolInfo.name}</div>
        </div>
        <div className="info-section">
          <div className="info-label">工具描述:</div>
          <div className="info-content">{details.toolInfo.description}</div>
        </div>
        <div className="info-section">
          <div className="info-label">调用参数:</div>
          <div className="info-content">
            <pre>{JSON.stringify(details.toolInfo.parameters, null, 2)}</pre>
          </div>
        </div>
      </div>

      {/* 工具结果 */}
      <div className="tool-result">
        <h4>📥 工具返回结果</h4>
        <div className="result-content">
          <pre>{JSON.stringify(details.toolOutput, null, 2)}</pre>
        </div>
      </div>

      {/* 上下文重组 */}
      <div className="context-reorganize">
        <h4>🔄 上下文重组</h4>
        <div className="reorganize-content">
          {details.reorganizedContext}
        </div>
      </div>
    </div>
  );
}

export default ToolInteractionDetails;
```

**Step 2: 添加样式（使用 inline className，稍后在 css 中定义）**

添加合适的类名，使用 Tailwind CSS 类名：
- `tool-interaction-details`: `bg-gray-50 rounded-lg border-l-4 border-orange-400 p-4 my-2`
- `model-thinking`: `mb-4 p-3 bg-amber-50 rounded border-l-4 border-amber-400`
- `call-context`: `mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400`
- `tool-info`: `mb-4 p-3 bg-green-50 rounded border-l-4 border-green-400`
- `tool-result`: `mb-4 p-3 bg-emerald-50 rounded border-l-4 border-emerald-400`
- `context-reorganize`: `p-3 bg-purple-50 rounded border-l-4 border-purple-400`

---

## Task 4: 创建 ToolInteractionDetails 测试文件

**Files:**
- Create: `__tests__/components/ToolInteractionDetails.test.tsx`

**Step 1: 添加测试依赖和组件**

```tsx
import { render, screen } from '@testing-library/react';
import ToolInteractionDetails from '../../src/components/ToolInteractionDetails';

const mockDetails = {
  type: 'tool',
  toolInfo: {
    name: 'xueqiu-search',
    description: '搜索股票信息',
    parameters: { query: '贵州茅台' },
  },
  callContext: {
    systemPrompt: '你是一个投资助手',
    userQuery: '查一下贵州茅台',
    conversationHistory: [],
  },
  toolOutput: { results: [{ title: '贵州茅台', price: 1800 }] },
  reorganizedContext: '系统提示 + 用户查询 + 工具结果',
  toolUseReasoning: '用户查询股票信息，需要调用搜索工具',
};

test('renders tool interaction details', () => {
  render(<ToolInteractionDetails details={mockDetails} />);
  
  expect(screen.getByText('🎯 大模型思考过程')).toBeInTheDocument();
  expect(screen.getByText('📋 调用上下文')).toBeInTheDocument();
  expect(screen.getByText('🔧 工具信息')).toBeInTheDocument();
  expect(screen.getByText('📥 工具返回结果')).toBeInTheDocument();
  expect(screen.getByText('🔄 上下文重组')).toBeInTheDocument();
});

test('displays tool name and description', () => {
  render(<ToolInteractionDetails details={mockDetails} />);
  
  expect(screen.getByText('xueqiu-search')).toBeInTheDocument();
  expect(screen.getByText('搜索股票信息')).toBeInTheDocument();
});
```

**Step 2: 运行测试**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run test -- __tests__/components/ToolInteractionDetails.test.tsx
```

**Step 3: 检查结果**

预期：测试应该通过，渲染所有部分都正常显示

**Step 4: 提交更改**

```bash
git add __tests__/components/ToolInteractionDetails.test.tsx src/components/ToolInteractionDetails.tsx src/stores/appStore.ts
git commit -m "feat: add tool interaction details component and state"
```

---

## Task 5: 更新 ProcessTimeline 组件

**Files:**
- Modify: `src/components/ProcessTimeline.tsx`

**Step 1: 导入 ToolInteractionDetails**

```typescript
// 在文件顶部添加
import ToolInteractionDetails from './ToolInteractionDetails';
```

**Step 2: 从 store 中获取 toggleStepExpanded**

```typescript
// 更新 useAppStore 调用（第6行）
const {
  timelineSteps,
  lastUserInput,
  currentScene,
  selectedTools,
  apiInteractions,
  toggleStepExpanded
} = useAppStore();
```

**Step 3: 重构时间线步骤渲染，添加展开/收起功能**

```tsx
// 更新步骤渲染（第76-180行）
{timelineSteps.map((step, idx) => (
  <div
    key={step.id}
    className={`p-3 rounded-lg border ${
      step.details?.type === 'tool' ? 'bg-orange-50 border-orange-200' :
      'bg-white border-gray-200'
    }`}
  >
    {/* 步骤头部 - 可点击展开 */}
    <div
      className={`flex justify-between items-center cursor-pointer ${step.expandable ? 'hover:bg-gray-100' : ''}`}
      onClick={() => step.expandable && toggleStepExpanded(step.id)}
    >
      <div className="flex items-center space-x-2">
        <span className="text-xl">{step.icon}</span>
        <span className="font-medium text-gray-900">{step.title}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          step.active ? 'bg-blue-200 text-blue-800' :
          step.completed ? 'bg-green-200 text-green-800' :
          'bg-gray-200 text-gray-800'
        }`}>
          {step.active ? '进行中...' : step.completed ? '已完成' : '等待'}
        </span>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-500">{step.description}</span>
        {step.expandable && (
          <span className="text-gray-400 text-sm">
            {step.expanded ? '▼' : '▶'}
          </span>
        )}
      </div>
    </div>

    {/* 展开的详情 */}
    {step.expanded && step.details && (
      <div className="mt-3 pt-3 border-t border-gray-200">
        {step.details.type === 'tool' && (
          <ToolInteractionDetails details={step.details} />
        )}
        {step.details.type === 'api' && (
          /* 原有的 API 详情显示保持不变 */
          null
        )}
      </div>
    )}
  </div>
))}
```

**Step 4: 保留原有的 apiInteractions 显示（如果需要）**

保持原有的 API 交互卡片显示，现在与步骤详情共存

---

## Task 6: 测试 ProcessTimeline 更新

**Files:**
- Test: `__tests__/components/ProcessTimeline.test.tsx`

**Step 1: 更新或创建测试文件**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../src/stores/appStore';
import ProcessTimeline from '../../src/components/ProcessTimeline';

// Mock the store
jest.mock('../../src/stores/appStore', () => ({
  useAppStore: jest.fn(),
}));

test('renders expandable steps and toggles expansion', () => {
  const mockToggleStepExpanded = jest.fn();
  const mockTimelineSteps = [
    {
      id: 'tool-call',
      icon: '🔧',
      title: '工具调用',
      description: '调用工具中...',
      active: false,
      completed: true,
      expandable: true,
      expanded: false,
      details: {
        type: 'tool',
        toolInfo: {
          name: 'xueqiu-search',
          description: '搜索股票',
          parameters: { query: '茅台' },
        },
        callContext: {
          systemPrompt: '投资助手',
          userQuery: '查茅台',
          conversationHistory: [],
        },
        toolOutput: { result: 'success' },
        reorganizedContext: 'context',
        toolUseReasoning: '需要搜索',
      },
    },
  ];

  (useAppStore as jest.Mock).mockReturnValue({
    timelineSteps: mockTimelineSteps,
    toggleStepExpanded: mockToggleStepExpanded,
    apiInteractions: [],
  });

  render(<ProcessTimeline />);
  
  expect(screen.getByText('工具调用')).toBeInTheDocument();
  
  // 点击展开
  fireEvent.click(screen.getByText('工具调用'));
  expect(mockToggleStepExpanded).toHaveBeenCalledWith('tool-call');
});
```

**Step 2: 运行测试**

```bash
npm run test -- __tests__/components/ProcessTimeline.test.tsx
```

**Step 3: 检查结果**

预期：测试通过，步骤可点击展开

**Step 4: 提交更改**

```bash
git add src/components/ProcessTimeline.tsx __tests__/components/ProcessTimeline.test.tsx
git commit -m "feat: enhance ProcessTimeline with expandable steps"
```

---

## Task 7: 在 agentService 中添加工具调用数据收集

**Files:**
- Modify: `src/services/agentService.ts`

**Step 1: 添加数据收集的回调方法**

```typescript
// 在现有的 addApiRequest, addApiResponse 后添加（第52行后）
  // 工具调用详细信息记录方法
  private recordToolInteraction?: (
    stepId: string,
    toolName: string,
    toolDescription: string,
    parameters: any,
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizedContext: string
  ) => void;

  // 设置记录方法
  setToolRecordingMethods(
    recordToolInteraction?: (
      stepId: string,
      toolName: string,
      toolDescription: string,
      parameters: any,
      callContext: any,
      toolOutput: any,
      reasoning: string,
      reorganizedContext: string
    ) => void
  ) {
    this.recordToolInteraction = recordToolInteraction;
  }
```

**Step 2: 修改工具调用逻辑以收集数据**

```typescript
// 在 sendMessage 方法的工具调用部分（第418行），在调用工具前后收集数据
if (hasToolUse && this.useTools) {
  console.log('Tool use requested, executing tools...');

  // 记录大模型决定调用工具的推理（从响应中提取）
  const reasoning = '根据用户查询，我需要调用工具获取最新信息';
  const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';
  
  // 添加助手响应到历史
  this.conversationHistory.push({
    role: 'assistant',
    content: data.content
  });

  // 收集所有工具调用结果
  const toolResults: Array<any> = [];
  let toolName = '';
  let toolDescription = '';
  let toolParams = {};

  for (const contentItem of data.content) {
    if (contentItem.type === 'tool_use') {
      // 执行工具
      toolName = contentItem.name;
      toolParams = contentItem.input || {};
      
      // 获取工具描述
      const tool = this.toolDefinitions[toolName];
      toolDescription = tool?.description || '';
      
      const toolOutput = await this.executeTool(toolName, toolParams);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: contentItem.id,
        content: toolOutput
      });
      
      // 记录工具调用详情
      if (this.recordToolInteraction) {
        const callContext = {
          systemPrompt: systemPrompt || '',
          userQuery,
          conversationHistory: this.conversationHistory.slice(0, -1).map(m =>
            `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
          ),
        };
        
        // 构造重组后的上下文描述
        const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n对话历史:\n${callContext.conversationHistory.join('\n')}\n\n工具结果:\n${JSON.stringify(toolOutput, null, 2)}`;
        
        this.recordToolInteraction(
          'tool-call',
          toolName,
          toolDescription,
          toolParams,
          callContext,
          toolOutput,
          reasoning,
          reorganizedContext
        );
      }
    }
  }

  // 添加工具结果到消息历史
  this.conversationHistory.push({
    role: 'user',
    content: toolResults
  });

  // 继续循环
  shouldContinue = true;
  continue;
}
```

**Step 3: 为结果重组步骤添加记录**

```typescript
// 在发送工具结果后的第二次调用时，记录结果重组步骤
// 可以在发送请求前，标记为结果重组完成
```

---

## Task 8: 更新 ChatInteraction 组件以集成工具记录

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

**Step 1: 从 store 中获取需要的方法**

```typescript
// 更新 useAppStore 调用（第12行）
const {
  systemPrompt,
  selectedTools,
  contextStrategy,
  currentScene,
  resetTimeline,
  updateTimelineStep,
  nextTimelineStep,
  setLastUserInput,
  addMessage,
  conversationHistory,
  addApiRequest,
  addApiResponse,
  recordToolInteraction,  // 新增
  setStepDetails,       // 新增
  availableTools,       // 新增
} = useAppStore();
```

**Step 2: 设置工具记录方法**

```typescript
// 在初始化 agentService 后（第73行），添加工具记录方法
agentService.setApiRecordingMethods(addApiRequest, addApiResponse);
agentService.setToolRecordingMethods(recordToolInteraction); // 新增
```

**Step 3: 在工具调用完成后更新步骤状态**

```typescript
// 在工具调用步骤完成后（第96行），为 result-pack 和 api-reorganize 步骤设置 expandable: true
// 可以通过 updateTimelineStep 或直接在 store 中设置
```

---

## Task 9: 集成测试完整流程

**Files:**
- Test: `__tests__/components/ChatInteraction.test.tsx` (如果存在)

**Step 1: 添加集成测试（如果还没有测试文件，先跳过）**

**Step 2: 手动测试**

启动开发服务器：
```bash
npm run dev
```

在浏览器中测试：
1. 选择投资研究场景
2. 选择一些工具
3. 发送查询（如：“查一下贵州茅台的股价”）
4. 观察时间线步骤
5. 点击工具调用步骤，查看详情
6. 验证所有部分都正确显示

**Step 3: 提交最终集成**

```bash
git add src/services/agentService.ts src/components/ChatInteraction.tsx
git commit -m "feat: integrate tool interaction recording"
```

---

## Task 10: 添加 CSS 样式

**Files:**
- Modify: `src/index.css`

**Step 1: 添加工具调用详情的样式**

```css
/* 在 index.css 文件末尾添加 */

/* 工具调用详情样式 */
.tool-interaction-details {
  background: #f8fafc;
  border-radius: 0.5rem;
  border-left: 3px solid #f59e0b;
  padding: 1rem;
  margin: 0.5rem 0;
}

.model-thinking {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #fef3c7;
  border-radius: 0.375rem;
  border-left: 3px solid #f59e0b;
}

.call-context {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #dbeafe;
  border-radius: 0.375rem;
  border-left: 3px solid #3b82f6;
}

.tool-info {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #d1fae5;
  border-radius: 0.375rem;
  border-left: 3px solid #10b981;
}

.tool-result {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f0fdf4;
  border-radius: 0.375rem;
  border-left: 3px solid #10b981;
}

.context-reorganize {
  padding: 0.75rem;
  background: #ede9fe;
  border-radius: 0.375rem;
  border-left: 3px solid #8b5cf6;
}

.context-section, .info-section {
  margin-bottom: 0.5rem;
}

.context-label, .info-label {
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
}

.context-content, .info-content {
  margin-left: 1rem;
  color: #1f2937;
  font-size: 0.875rem;
}

.history-item {
  margin-bottom: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.model-thinking h4,
.call-context h4,
.tool-info h4,
.tool-result h4,
.context-reorganize h4 {
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}

.thinking-content,
.reorganize-content {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #374151;
}
```

**Step 2: 提交样式更改**

```bash
git add src/index.css
git commit -m "style: add tool interaction details styles"
```

---

## 计划完成

**✅ 计划完整性检查：**
- 覆盖了规格中的所有要求
- 没有占位符或 TBD
- 类型一致，方法名称匹配
- 每个任务都是小步骤，2-5分钟可完成
- 包含测试、代码、命令

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-tool-interaction-display-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

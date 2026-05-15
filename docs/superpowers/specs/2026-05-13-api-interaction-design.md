# API 交互记录内联展示设计

## 概述

将 API 请求/响应报文记录从上下文可视化区域移动到对话过程区域，并实现内联展开式显示，让整个交互过程更加透明和完整。

## 需求背景

用户希望在发送信息后，能够看到完整的对话过程，包括：
- 每个过程的详细步骤
- API 调用的完整请求和响应报文
- 工具调用的来回交互过程
- 内联展开的展示方式，避免模态框切换

## 架构设计

### 当前状态

**ContextVisualizer 组件**（上下文可视化区域）：
- 显示 Token 统计信息
- 显示系统提示词、用户提示词
- 显示对话历史
- 显示 API 交互记录（请求/响应）

**ProcessTimeline 组件**（对话过程区域）：
- 展示五个主要步骤的简化流程
- 显示步骤状态（进行中/已完成）
- 显示简单的描述信息

### 优化后架构

**ProcessTimeline 组件**（增强）：
- 保留原有的步骤展示
- 每个步骤可以展开显示详细信息
- API 调用步骤添加请求/响应展示
- 工具调用步骤添加交互过程记录
- 内联展开/收起功能

## 组件设计

### 1. ProcessTimeline 组件重构

#### 1.1 步骤状态管理
```typescript
// 增强的步骤接口
interface EnhancedTimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  details?: {
    type: 'api' | 'tool' | 'context' | 'default';
    content: any; // 存储详细内容（API 请求、工具调用等）
  };
  expandable: boolean; // 是否可展开
  expanded: boolean; // 展开状态
}
```

#### 1.2 组件结构
```tsx
// 组件主要结构
function EnhancedProcessTimeline() {
  const steps = useAppStore(state => state.timelineSteps);
  
  return (
    <div className="process-timeline">
      {steps.map((step, index) => (
        <div key={step.id} className="timeline-step">
          {/* 步骤头部 - 点击展开/收起 */}
          <div 
            className="step-header"
            onClick={() => toggleStepExpanded(step.id)}
          >
            <div className="step-icon">{step.icon}</div>
            <div className="step-info">
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
            </div>
            {step.expandable && (
              <div className="expand-icon">
                {step.expanded ? '▼' : '▶'}
              </div>
            )}
          </div>
          
          {/* 步骤详情 - 内联展开 */}
          {step.expanded && step.details && (
            <div className="step-details">
              {renderStepDetails(step.details)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 2. API 交互内联展示

#### 2.1 API 详情显示
```typescript
// API 详情内容类型
interface ApiInteractionDetails {
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
```

#### 2.2 API 详情渲染
```tsx
function renderApiDetails(details: ApiInteractionDetails) {
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
}
```

### 3. 工具调用过程展示

#### 3.1 工具调用详情类型
```typescript
interface ToolInteractionDetails {
  type: 'tool';
  toolName: string;
  toolParameters: any;
  toolOutput: any;
}
```

#### 3.2 工具调用详情渲染
```tsx
function renderToolDetails(details: ToolInteractionDetails) {
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
}
```

## 状态管理

### 1. AppStore 增强

```typescript
// 在 appStore.ts 中添加
interface EnhancedAppState {
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

## 数据流程

### 1. API 交互记录流程
```typescript
// ChatInteraction.tsx 中的发送过程
async function handleSend() {
  // 1. 用户输入步骤
  updateTimelineStep('user-input', '发送请求', true);
  
  try {
    // 2. 上下文打包步骤
    updateTimelineStep('context-pack', '正在处理上下文...');
    const context = buildContext();
    
    // 3. API 请求步骤（添加详情）
    const request = prepareApiRequest(context);
    setStepDetails('api-request', {
      type: 'api',
      request,
      response: null
    });
    
    // 发送请求
    const response = await sendApiRequest(request);
    
    // 更新 API 响应详情
    setStepDetails('api-request', {
      type: 'api',
      request,
      response: responseDetails
    });
    
    // 4. 工具调用步骤
    if (response.needsTool) {
      const toolName = response.toolName;
      const parameters = extractToolParameters(response);
      
      setStepDetails('tool-call', {
        type: 'tool',
        toolName,
        toolParameters: parameters,
        toolOutput: null
      });
      
      const toolOutput = await callTool(toolName, parameters);
      
      setStepDetails('tool-call', {
        type: 'tool',
        toolName,
        toolParameters: parameters,
        toolOutput
      });
    }
    
    // 5. 智能体响应步骤
    const agentResponse = processResponse(response, toolOutput);
    updateTimelineStep('agent-response', '处理完成');
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## 样式设计

### 1. 颜色方案
```css
/* 基础颜色 */
.process-timeline {
  --primary-color: #3b82f6;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
  --info-color: #06b6d4;
}

/* 步骤头部 */
.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: #f1f5f9;
  }
}

/* 图标 */
.step-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e2e8f0;
  border-radius: 50%;
  font-size: 1.25rem;
  flex-shrink: 0;
}

/* 详情区域 */
.step-details {
  margin-top: 0.5rem;
  margin-left: 2.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  border-left: 3px solid var(--primary-color);
}

/* API 详情样式 */
.api-section {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #ffffff;
  border-radius: 0.375rem;
  border: 1px solid #e2e8f0;
  
  &.request {
    border-left-color: var(--primary-color);
  }
  
  &.response {
    border-left-color: var(--success-color);
  }
}

/* 代码显示 */
pre {
  background: #f1f5f9;
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
```

## 实现计划

### 1. 阶段 1：组件重构
- [ ] 更新 ProcessTimeline 组件接口
- [ ] 添加步骤展开/收起功能
- [ ] 实现基础的详情显示组件

### 2. 阶段 2：API 交互记录
- [ ] 在 appStore 中添加 API 详情管理
- [ ] 在发送过程中记录 API 详情
- [ ] 实现 API 详情渲染组件

### 3. 阶段 3：工具交互记录
- [ ] 添加工具调用过程的记录方法
- [ ] 实现工具交互详情的渲染
- [ ] 测试工具调用过程

### 4. 阶段 4：样式优化
- [ ] 完善内联展示的样式
- [ ] 实现响应式设计
- [ ] 测试各种场景的显示效果

### 5. 阶段 5：集成测试
- [ ] 与现有的功能集成
- [ ] 测试边界情况
- [ ] 性能优化

## 总结

这个设计方案将使得整个对话过程更加透明和完整。用户可以清楚地看到：
- 每个阶段的详细过程
- API 调用的完整请求/响应内容
- 工具调用的交互过程
- 内联展开的显示方式，提供更好的用户体验

这种方式有助于用户学习和理解智能体的工作原理，对于调试和优化也非常有帮助。

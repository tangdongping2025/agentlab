# 工具调用过程显示优化设计

## 概述

增强 ProcessTimeline 组件，在时间线步骤中直接展示工具调用的完整过程信息，包括调用前上下文、调用参数、工具结果和调用后上下文重组。

## 需求背景

目前工具调用过程的显示非常简化，用户看不到：
- 大模型决定调用工具的思考过程
- 工具调用的具体参数
- 工具执行的详细过程
- 工具结果如何被重组到上下文中

## 架构设计

### 1. 时间线步骤增强

#### 1.1 工具调用步骤接口
```typescript
interface ToolInteractionStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;
  expanded: boolean;
  details?: {
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
   重组后的上下文: string;
    toolUseReasoning: string; // 大模型决定调用工具的理由
  };
}
```

#### 1.2 增强的 ProcessTimeline 组件
```tsx
function EnhancedProcessTimeline() {
  const steps = useAppStore(state => state.timelineSteps);
  
  return (
    <div className="process-timeline">
      {steps.map((step, index) => (
        <div key={step.id} className="timeline-step">
          {/* 步骤头部 */}
          <div className="step-header" onClick={() => toggleStepExpanded(step.id)}>
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
          
          {/* 工具调用详情 */}
          {step.expanded && step.details?.type === 'tool' && (
            <div className="step-details">
              <ToolInteractionDetails details={step.details} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## 组件设计

### 1. 工具调用详情组件

#### 1.1 组件结构
```tsx
function ToolInteractionDetails({ details }: { details: ToolInteractionStep['details'] }) {
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
          {details.重组后的上下文}
        </div>
      </div>
    </div>
  );
}
```

## 样式设计

### 1. 工具调用详情样式
```css
.tool-interaction-details {
  background: #f8fafc;
  border-radius: 0.5rem;
  border-left: 3px solid #f59e0b; /* 橙色 - 工具调用 */
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
}

.context-content, .info-content {
  margin-left: 1rem;
  color: #1f2937;
}

.history-item {
  margin-bottom: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

pre {
  background: #ffffff;
  padding: 0.75rem;
  border-radius: 0.25rem;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
```

## 状态管理

### 1. AppStore 增强
```typescript
// 在 appStore.ts 中添加
interface EnhancedAppState {
  // 工具调用过程记录
  recordToolInteraction: (
    stepId: string, 
    toolName: string, 
    toolDescription: string, 
    parameters: any, 
    callContext: any,
    toolOutput: any,
    reasoning: string,
    reorganizeContext: string
  ) => void;
}

// 实现
const useAppStore = create<AppState & EnhancedAppState>(...);
```

## 实现计划

### 阶段 1：基础架构（立即开始）
- [ ] 更新 ProcessTimeline 组件接口
- [ ] 添加步骤展开/收起功能
- [ ] 实现基础的工具调用详情组件

### 阶段 2：状态管理
- [ ] 在 appStore.ts 中添加工具调用详情记录方法
- [ ] 更新时间线状态管理
- [ ] 添加步骤详情的记录和获取方法

### 阶段 3：数据收集
- [ ] 在 agentService.ts 中添加工具调用过程数据收集
- [ ] 记录大模型思考过程
- [ ] 记录工具调用参数和结果

### 阶段 4：样式实现
- [ ] 实现工具调用详情的样式
- [ ] 优化不同部分的视觉层次
- [ ] 添加响应式设计

### 阶段 5：测试
- [ ] 测试工具调用的完整过程显示
- [ ] 测试边界情况和异常处理
- [ ] 优化性能和加载时间

## 总结

这个方案将完整展示工具调用过程，包括：
1. 🎯 大模型思考过程（为什么决定调用工具）
2. 📋 调用时的上下文（系统提示、用户查询、历史记录）
3. 🔧 工具信息（名称、描述、参数）
4. 📥 工具结果（详细的返回数据）
5. 🔄 上下文重组（工具结果如何被添加到上下文中）

这将使整个工具调用过程更加透明，帮助用户理解智能体的工作原理。

# 交互过程详情描述优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为时间线每个步骤增加可展开的详情描述，支持查看 API 报文、工具调用、上下文结构，并让步骤反映真实 API 流程。

**Architecture:** 重构 Store 类型定义支持动态步骤和丰富详情数据 → 改造 agentService 增加阶段回调 → 新建 StepDetailPanel 组件渲染各类型详情 → 改造 TimelineReplay 支持点击展开 → 改造 ChatInteraction 去除模拟逻辑 → 增强气泡辅助详情 → 清理旧组件。

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS (inline styles), Vite

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `context-lab/src/stores/appStore.ts` | 扩展 TimelineStep/Message 类型，新增动态步骤 actions |
| Modify | `context-lab/src/services/agentService.ts` | 增加阶段回调 hooks，去除工具调用硬编码逻辑 |
| Create | `context-lab/src/components/StepDetailPanel.tsx` | 各步骤类型的内联详情面板 |
| Modify | `context-lab/src/components/TimelineReplay.tsx` | 动态步骤渲染 + 点击展开 + accordion 行为 |
| Modify | `context-lab/src/components/ChatInteraction.tsx` | 去除 setTimeout 模拟，由回调驱动步骤推进，气泡辅助详情 |
| Modify | `context-lab/src/components/DetailModal.tsx` | 增强 JSON 格式化展示 |
| Delete | `context-lab/src/components/ApiReorganizeStep.tsx` | 被 StepDetailPanel 替代 |
| Delete | `context-lab/src/components/ApiReorganizeStep.test.tsx` | 对应测试 |
| Delete | `context-lab/src/components/ToolInteractionDetails.tsx` | 被 StepDetailPanel 替代 |

---

### Task 1: 扩展 Store 类型定义和新增 actions

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 替换 TimelineStep 和相关类型定义**

Replace the existing `TimelineStep`, `ToolInteractionDetails`, and `Message` interfaces (lines 7-24) with the new types:

```typescript
// Step detail types
interface UserInputDetails {
  type: 'user-input';
  text: string;
  tokenCount: number;
  conversationTurns: number;
}

interface ApiRequestDetails {
  type: 'api-request';
  url: string;
  model: string;
  contextBreakdown: { section: string; tokenCount: number; percentage: number }[];
  requestBody?: string;
}

interface ApiResponseDetails {
  type: 'api-response';
  statusCode: number;
  duration: number;
  tokenUsage: { input: number; output: number };
  responseType: 'tool_call' | 'final_response' | 'error';
  responseBody?: string;
}

interface ToolCallDetails {
  type: 'tool-call';
  toolName: string;
  toolDescription: string;
  parameters: Record<string, any>;
  reasoning: string;
  result?: any;
  resultSummary?: string;
  reorganizedContext?: string;
}

interface AgentResponseDetails {
  type: 'agent-response';
  text: string;
  tokenUsage: { input: number; output: number };
  toolsUsed: string[];
  apiCallCount: number;
}

type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails;

interface TimelineStep {
  id: string;
  type: 'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response';
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;
  expanded: boolean;
  apiInteractionId?: string;
  toolCallName?: string;
  duration?: number;
  tokenUsage?: { input: number; output: number };
  details?: StepDetails;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenUsage?: { input: number; output: number };
  apiCallCount?: number;
  toolsUsed?: string[];
  timelineStepIndex?: number;
}
```

Remove the old `ToolInteractionDetails` interface entirely — it is replaced by `ToolCallDetails`.

- [ ] **Step 2: Replace INITIAL_TIMELINE_STEPS with empty array**

Replace `INITIAL_TIMELINE_STEPS` (lines 87-94) with an empty array. Steps will now be dynamically created:

```typescript
const INITIAL_TIMELINE_STEPS: TimelineStep[] = [];
```

- [ ] **Step 3: Add new store actions to the AppState interface**

Add these action signatures after the existing `recordToolInteraction` action (line 203):

```typescript
  // Dynamic timeline
  addTimelineStep: (step: TimelineStep) => void;
  updateTimelineStepData: (stepId: string, data: Partial<TimelineStep>) => void;
  completeTimelineStep: (stepId: string, data?: Partial<TimelineStep>) => void;
  collapseAllSteps: () => void;
```

- [ ] **Step 4: Implement the new actions in the store body**

Add after the existing `recordToolInteraction` implementation (around line 498). Also update `recordToolInteraction` to use the new `ToolCallDetails` type:

```typescript
  // Replace existing recordToolInteraction with:
  recordToolInteraction: (stepId, toolName, toolDesc, params, callCtx, output, reasoning, reorganizedCtx) => {
    const details: ToolCallDetails = {
      type: 'tool-call',
      toolName,
      toolDescription: toolDesc,
      parameters: params,
      reasoning,
      result: output,
      resultSummary: typeof output === 'string' ? output.slice(0, 200) : JSON.stringify(output).slice(0, 200),
      reorganizedContext: reorganizedCtx,
    };
    set(state => ({
      timelineSteps: state.timelineSteps.map(step =>
        step.id === stepId ? { ...step, details, toolCallName: toolName, expandable: true } : step
      )
    }));
  },

  // New dynamic timeline actions
  addTimelineStep: (step) => set(state => ({
    timelineSteps: [...state.timelineSteps, step],
  })),

  updateTimelineStepData: (stepId, data) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, ...data } : step
    ),
  })),

  completeTimelineStep: (stepId, data?) => set(state => ({
    timelineSteps: state.timelineSteps.map(step =>
      step.id === stepId ? { ...step, active: false, completed: true, ...data } : step
    ),
  })),

  collapseAllSteps: () => set(state => ({
    timelineSteps: state.timelineSteps.map(step => ({ ...step, expanded: false })),
  })),
```

- [ ] **Step 5: Update resetTimeline to use empty array**

Replace the `resetTimeline` implementation (around line 414):

```typescript
  resetTimeline: () => set({
    timelineSteps: [],
    currentStepIndex: -1,
    lastUserInput: '',
  }),
```

- [ ] **Step 6: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: May show errors in components referencing old `INITIAL_TIMELINE_STEPS` fields or the old step IDs. These will be fixed in subsequent tasks. The store itself should type-check cleanly.

- [ ] **Step 7: Commit**

```bash
git add context-lab/src/stores/appStore.ts
git commit -m "refactor: extend TimelineStep/Message types and add dynamic step actions"
```

---

### Task 2: 改造 agentService 增加阶段回调

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

- [ ] **Step 1: Add callback type and private fields**

Add after the `ClaudeResponse` interface (around line 37):

```typescript
interface TimelineCallbacks {
  onUserInput: (text: string, tokenCount: number, conversationTurns: number) => void;
  onApiRequestStart: (url: string, model: string, contextBreakdown: { section: string; tokenCount: number; percentage: number }[], requestBody: string) => void;
  onApiResponseReceived: (statusCode: number, duration: number, tokenUsage: { input: number; output: number }, responseType: 'tool_call' | 'final_response' | 'error', responseBody: string) => void;
  onToolCallDetected: (toolName: string, toolDescription: string, parameters: Record<string, any>, reasoning: string) => void;
  onToolResultReady: (toolName: string, result: any, reorganizedContext: string) => void;
  onAgentResponse: (text: string, tokenUsage: { input: number; output: number }, toolsUsed: string[], apiCallCount: number) => void;
}
```

Add private field to `AgentService` class after `private useTools = true;` (line 46):

```typescript
  private timelineCallbacks: TimelineCallbacks | null = null;
  private apiCallCount = 0;
```

- [ ] **Step 2: Add setTimelineCallbacks method**

Add after `setToolRecordingMethods` (around line 85):

```typescript
  setTimelineCallbacks(callbacks: TimelineCallbacks) {
    this.timelineCallbacks = callbacks;
  }
```

- [ ] **Step 3: Add token estimation helper**

Add inside the `AgentService` class:

```typescript
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
```

- [ ] **Step 4: Rewrite sendMessage to emit callbacks at each stage**

The key change: inside the `while` loop in `sendMessage`, emit callbacks at each stage. Replace the method body from after `this.conversationHistory.push({ role: 'user', content: message });` (line 309) to the end of the method. The new flow:

1. After pushing user message → call `onUserInput`
2. Before fetch → call `onApiRequestStart` with context breakdown
3. After receiving response → call `onApiResponseReceived`
4. When `tool_use` detected → call `onToolCallDetected`, then after tool execution → call `onToolResultReady`
5. After final text response → call `onAgentResponse`

Replace the body starting from `// 构建工具列表` (around line 313) through the end of the method:

```typescript
      // 构建工具列表
      let availableTools: ClaudeTool[] = [];
      if (this.useTools && tools && tools.length > 0) {
        for (const toolId of tools) {
          if (this.toolDefinitions[toolId]) {
            availableTools.push(this.toolDefinitions[toolId]);
          }
        }
      }

      // Callback: user input
      if (this.timelineCallbacks) {
        const userTokenCount = this.estimateTokens(message);
        const turns = this.conversationHistory.filter(m => m.role === 'user').length;
        this.timelineCallbacks.onUserInput(message, userTokenCount, turns);
      }

      // Track API calls for this message
      this.apiCallCount = 0;

      // 执行完整的交互循环
      let finalResponse = '';
      let shouldContinue = true;
      let loopCount = 0;
      const maxLoops = 5;
      const toolsUsedInSession: string[] = [];

      while (shouldContinue && loopCount < maxLoops) {
        loopCount++;
        this.apiCallCount++;

        let messagesToSend: ClaudeMessage[];
        if (contextStrategy === 'sliding') {
          messagesToSend = this.getSlidingWindowMessages();
        } else {
          messagesToSend = [...this.conversationHistory];
        }

        const request: ClaudeRequest = {
          model: this.model,
          max_tokens: this.maxTokens,
          messages: messagesToSend,
          temperature: 0.7
        };

        if (systemPrompt && systemPrompt.trim()) {
          request.system = systemPrompt;
        }

        if (availableTools.length > 0) {
          request.tools = availableTools;
        }

        const url = '/api/anthropic/v1/messages';
        const requestBody = JSON.stringify(request);
        const requestHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey ? 'sk-***' : '',
          'anthropic-version': '2023-06-01',
          'User-Agent': 'Context-Lab/1.0.0'
        };

        // Callback: API request start with context breakdown
        if (this.timelineCallbacks) {
          const sysTokens = systemPrompt ? this.estimateTokens(systemPrompt) : 0;
          const histTokens = messagesToSend.reduce((sum, m) =>
            sum + this.estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
          const toolTokens = availableTools.reduce((sum, t) =>
            sum + this.estimateTokens(JSON.stringify(t.input_schema)), 0);
          const totalTokens = sysTokens + histTokens + toolTokens;

          this.timelineCallbacks.onApiRequestStart(
            url,
            this.model,
            [
              { section: '系统提示词', tokenCount: sysTokens, percentage: totalTokens > 0 ? Math.round(sysTokens / totalTokens * 100) : 0 },
              { section: '对话历史', tokenCount: histTokens, percentage: totalTokens > 0 ? Math.round(histTokens / totalTokens * 100) : 0 },
              { section: '工具列表', tokenCount: toolTokens, percentage: totalTokens > 0 ? Math.round(toolTokens / totalTokens * 100) : 0 },
            ],
            requestBody
          );
        }

        // Record API request
        let apiInteractionId: string | null = null;
        if (this.addApiRequest) {
          apiInteractionId = this.addApiRequest(url, requestHeaders, requestBody);
        }

        const startTime = Date.now();

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: requestBody
        });

        const duration = Date.now() - startTime;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const responseBody = await response.text();

        // Record API response
        if (this.addApiResponse && apiInteractionId) {
          this.addApiResponse(apiInteractionId, response.status, responseHeaders, responseBody, duration);
        }

        if (!response.ok) {
          // Callback: API error response
          if (this.timelineCallbacks) {
            this.timelineCallbacks.onApiResponseReceived(response.status, duration, { input: 0, output: 0 }, 'error', responseBody);
          }
          throw new Error(`API request failed: ${response.status} - ${responseBody}`);
        }

        const data: ClaudeResponse = JSON.parse(responseBody);

        // Callback: API response received
        if (this.timelineCallbacks) {
          const hasToolUse = data.content.some(c => c.type === 'tool_use');
          this.timelineCallbacks.onApiResponseReceived(
            response.status,
            duration,
            { input: data.usage.input_tokens, output: data.usage.output_tokens },
            hasToolUse ? 'tool_call' : 'final_response',
            responseBody
          );
        }

        // 检查是否需要工具调用
        const hasToolUse = data.content.some(c => c.type === 'tool_use');

        if (hasToolUse && this.useTools) {
          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          const toolResults: Array<any> = [];

          for (const contentItem of data.content) {
            if (contentItem.type === 'tool_use') {
              const toolName = contentItem.name;
              const toolParams = contentItem.input || {};
              const tool = this.toolDefinitions[toolName];
              const toolDescription = tool?.description || '';
              const reasoning = '根据用户查询，我需要调用工具获取最新信息';

              // Callback: tool call detected
              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolCallDetected(toolName, toolDescription, toolParams, reasoning);
              }

              const toolResult = await this.executeTool(toolName, toolParams);

              toolResults.push({
                type: 'tool_result',
                tool_use_id: contentItem.id,
                content: toolResult
              });

              if (!toolsUsedInSession.includes(toolName)) {
                toolsUsedInSession.push(toolName);
              }

              // Build reorganized context description
              const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n工具结果:\n${JSON.stringify(toolResult, null, 2)}`;

              // Callback: tool result ready
              if (this.timelineCallbacks) {
                this.timelineCallbacks.onToolResultReady(toolName, toolResult, reorganizedContext);
              }

              // Record tool interaction (backward compat)
              if (this.recordToolInteraction) {
                const userQuery = this.conversationHistory.find(m => m.role === 'user')?.content as string || '';
                const callContext = {
                  systemPrompt: systemPrompt || '',
                  userQuery,
                  conversationHistory: this.conversationHistory.slice(0, -1).map(m =>
                    `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
                  ),
                };
                this.recordToolInteraction('tool-call', toolName, toolDescription, toolParams, callContext, toolResult, reasoning, reorganizedContext);
              }
            }
          }

          this.conversationHistory.push({
            role: 'user',
            content: toolResults
          });

          shouldContinue = true;
          continue;
        } else {
          const responseText = data.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');

          this.conversationHistory.push({
            role: 'assistant',
            content: data.content
          });

          // Callback: agent final response
          if (this.timelineCallbacks) {
            this.timelineCallbacks.onAgentResponse(
              responseText,
              { input: data.usage.input_tokens, output: data.usage.output_tokens },
              toolsUsedInSession,
              this.apiCallCount
            );
          }

          finalResponse = responseText;
          shouldContinue = false;
        }
      }

      return finalResponse;
    } catch (error) {
      console.error('Error sending message to Anthropic API:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Could not connect to Anthropic API. Please check your internet connection.');
      }
      throw new Error(`Failed to send message: ${(error as Error).message}`);
    }
```

- [ ] **Step 5: Reset apiCallCount in initialize and clearHistory**

In `initialize()`, add `this.apiCallCount = 0;` after `this.isInitialized = true;`.

In `clearHistory()`, add `this.apiCallCount = 0;` after `this.conversationHistory = [];`.

- [ ] **Step 6: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: agentService should compile cleanly. Other files may still have type errors from the store changes.

- [ ] **Step 7: Commit**

```bash
git add context-lab/src/services/agentService.ts
git commit -m "feat: add timeline callbacks to agentService for real-time step tracking"
```

---

### Task 3: 新建 StepDetailPanel 组件

**Files:**
- Create: `context-lab/src/components/StepDetailPanel.tsx`

- [ ] **Step 1: Write the StepDetailPanel component**

Create `context-lab/src/components/StepDetailPanel.tsx`:

```tsx
import React from 'react';
import type { TimelineStep, StepDetails, ApiRequestDetails, ApiResponseDetails, ToolCallDetails, AgentResponseDetails, UserInputDetails } from '../stores/appStore';

interface StepDetailPanelProps {
  step: TimelineStep;
  onViewFullPayload: (title: string, content: string) => void;
}

function StepDetailPanel({ step, onViewFullPayload }: StepDetailPanelProps) {
  if (!step.details) {
    return (
      <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        {step.description}
      </div>
    );
  }

  return (
    <div style={{
      padding: '10px 12px',
      fontSize: '11px',
      lineHeight: 1.6,
      color: 'var(--text-secondary)',
      borderTop: '1px solid var(--border-subtle)',
      background: 'rgba(0,0,0,0.15)',
    }}>
      {step.details.type === 'user-input' && <UserInputSection details={step.details} />}
      {step.details.type === 'api-request' && <ApiRequestSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'api-response' && <ApiResponseSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'tool-call' && <ToolCallSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'agent-response' && <AgentResponseSection details={step.details} />}

      {step.duration != null && (
        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
          耗时: {step.duration}ms
        </div>
      )}
    </div>
  );
}

function UserInputSection({ details }: { details: UserInputDetails }) {
  return (
    <>
      <div style={{ marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>输入内容: </span>
        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {details.text.length > 100 ? details.text.slice(0, 100) + '...' : details.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', color: 'var(--text-tertiary)' }}>
        <span>{details.tokenCount} tokens</span>
        <span>第 {details.conversationTurns} 轮</span>
      </div>
    </>
  );
}

function ApiRequestSection({ details, onViewFullPayload }: { details: ApiRequestDetails; onViewFullPayload: (title: string, content: string) => void }) {
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <span><span style={{ color: 'var(--text-tertiary)' }}>模型: </span>{details.model}</span>
        <span><span style={{ color: 'var(--text-tertiary)' }}>端点: </span>{details.url}</span>
      </div>
      {details.contextBreakdown.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: '4px' }}>上下文结构:</div>
          {details.contextBreakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: CONTEXT_COLORS[i % CONTEXT_COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.section}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {item.tokenCount} tokens ({item.percentage}%)
              </span>
            </div>
          ))}
        </div>
      )}
      {details.requestBody && (
        <button
          onClick={() => onViewFullPayload('API 请求报文', details.requestBody!)}
          style={{
            background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
            color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
          }}
        >
          📄 查看完整报文
        </button>
      )}
    </>
  );
}

function ApiResponseSection({ details, onViewFullPayload }: { details: ApiResponseDetails; onViewFullPayload: (title: string, content: string) => void }) {
  const statusColor = details.statusCode === 200 ? 'var(--accent-emerald)' : details.statusCode < 500 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const typeLabel = details.responseType === 'tool_call' ? '含工具调用' : details.responseType === 'error' ? '错误' : '最终响应';

  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>状态: </span>
          <span style={{ color: statusColor }}>{details.statusCode}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>类型: </span>
          {typeLabel}
        </span>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>耗时: </span>
          {details.duration}ms
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
        <span>input: {details.tokenUsage.input}</span>
        <span>output: {details.tokenUsage.output}</span>
      </div>
      {details.responseBody && (
        <button
          onClick={() => onViewFullPayload('API 响应报文', details.responseBody!)}
          style={{
            background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
            color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
          }}
        >
          📄 查看完整报文
        </button>
      )}
    </>
  );
}

function ToolCallSection({ details, onViewFullPayload }: { details: ToolCallDetails; onViewFullPayload: (title: string, content: string) => void }) {
  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--accent-violet)', fontWeight: 600 }}>🔧 {details.toolName}</span>
        {details.toolDescription && (
          <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>{details.toolDescription}</span>
        )}
      </div>
      {details.reasoning && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>调用原因: </span>{details.reasoning}
        </div>
      )}
      {details.parameters && Object.keys(details.parameters).length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>参数: </span>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: '3px' }}>
            {JSON.stringify(details.parameters)}
          </code>
        </div>
      )}
      {details.resultSummary && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>结果: </span>{details.resultSummary}
        </div>
      )}
      <button
        onClick={() => onViewFullPayload(
          `工具调用: ${details.toolName}`,
          JSON.stringify({
            toolName: details.toolName,
            parameters: details.parameters,
            result: details.result,
            reorganizedContext: details.reorganizedContext,
          }, null, 2)
        )}
        style={{
          background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
          color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
        }}
      >
        📄 查看完整报文
      </button>
    </>
  );
}

function AgentResponseSection({ details }: { details: AgentResponseDetails }) {
  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>回复预览: </span>
        <span style={{ wordBreak: 'break-all' }}>
          {details.text.length > 150 ? details.text.slice(0, 150) + '...' : details.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>input: {details.tokenUsage.input}</span>
        <span>output: {details.tokenUsage.output}</span>
        {details.apiCallCount > 0 && <span>API 调用: {details.apiCallCount}次</span>}
        {details.toolsUsed.length > 0 && <span>工具: {details.toolsUsed.join(', ')}</span>}
      </div>
    </>
  );
}

const CONTEXT_COLORS = ['var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-violet)', 'var(--accent-amber)'];

export default StepDetailPanel;
```

- [ ] **Step 2: Export the detail types from appStore**

In `context-lab/src/stores/appStore.ts`, add `export` to each of the detail interfaces and the `StepDetails` type so StepDetailPanel can import them:

```typescript
export interface UserInputDetails { ... }
export interface ApiRequestDetails { ... }
export interface ApiResponseDetails { ... }
export interface ToolCallDetails { ... }
export interface AgentResponseDetails { ... }
export type StepDetails = ...;
export interface TimelineStep { ... }
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: StepDetailPanel and appStore type-check cleanly.

- [ ] **Step 4: Commit**

```bash
git add context-lab/src/components/StepDetailPanel.tsx context-lab/src/stores/appStore.ts
git commit -m "feat: add StepDetailPanel component for inline step details"
```

---

### Task 4: 改造 TimelineReplay 支持动态步骤和展开

**Files:**
- Modify: `context-lab/src/components/TimelineReplay.tsx`

- [ ] **Step 1: Rewrite TimelineReplay**

Replace the entire file content:

```tsx
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import StepDetailPanel from './StepDetailPanel';

interface TimelineReplayProps {
  onViewFullPayload?: (title: string, content: string) => void;
}

function TimelineReplay({ onViewFullPayload }: TimelineReplayProps) {
  const { timelineSteps, toggleStepExpanded, collapseAllSteps } = useAppStore();
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const handleStepClick = (stepId: string, expandable: boolean) => {
    if (!expandable) return;
    if (expandedStepId === stepId) {
      setExpandedStepId(null);
      toggleStepExpanded(stepId);
    } else {
      // Accordion: collapse current, expand new
      if (expandedStepId) {
        toggleStepExpanded(expandedStepId);
      }
      setExpandedStepId(stepId);
      toggleStepExpanded(stepId);
    }
  };

  const handleViewFullPayload = (title: string, content: string) => {
    if (onViewFullPayload) {
      onViewFullPayload(title, content);
    }
  };

  if (timelineSteps.length === 0) {
    return (
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        发送消息后将显示交互过程
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Step indicators row */}
      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
        {timelineSteps.map((step, i) => {
          const isDone = step.completed;
          const isActive = step.active;
          const isExpanded = step.expanded;
          const isClickable = step.expandable && (step.completed || step.details);

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => handleStepClick(step.id, !!isClickable)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
                  background: isExpanded ? 'rgba(91,156,245,0.12)' : isActive ? 'rgba(91,156,245,0.08)' : 'transparent',
                  color: isDone ? 'var(--accent-emerald)' : isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                  fontWeight: isActive || isExpanded ? 600 : 400,
                  whiteSpace: 'nowrap',
                  border: 'none', cursor: isClickable ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                {step.icon} {step.toolCallName || step.title}
              </button>
              {i < timelineSteps.length - 1 && (
                <span style={{
                  width: isDone ? '12px' : '8px',
                  height: '1px',
                  background: isDone ? 'var(--accent-emerald)' : 'var(--border-default)',
                  flexShrink: 0,
                  transition: 'all 0.3s',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {expandedStepId && (() => {
        const step = timelineSteps.find(s => s.id === expandedStepId);
        if (!step || !step.expanded) return null;
        return (
          <div style={{
            marginTop: '8px',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            overflow: 'hidden',
            animation: 'detailSlideIn 0.2s ease-out',
          }}>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-surface)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{step.icon} {step.title}</span>
              <button
                onClick={() => handleStepClick(step.id, true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <StepDetailPanel step={step} onViewFullPayload={handleViewFullPayload} />
          </div>
        );
      })()}

      <style>{`
        @keyframes detailSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default TimelineReplay;
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: TimelineReplay compiles. BottomPanel may need updating if it passes props differently.

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/TimelineReplay.tsx
git commit -m "feat: rewrite TimelineReplay with dynamic steps and expandable details"
```

---

### Task 5: 改造 ChatInteraction 去除模拟逻辑，由回调驱动步骤

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: Rewrite ChatInteraction with callback-driven timeline**

Replace the entire file. Key changes:
- Remove all setTimeout simulation
- Register `timelineCallbacks` on agentService
- Use store's `addTimelineStep`, `completeTimelineStep`, `updateTimelineStepData` to drive steps
- Add `···` button on message bubbles for auxiliary details
- Integrate `DetailModal` for full payload viewing

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { agentService } from '../services/agentService';
import type { TimelineStep } from '../stores/appStore';
import ToolSelectorBar from './ToolSelectorBar';
import DetailModal from './DetailModal';

interface ChatInteractionProps {
  initialMessage?: string;
}

let stepCounter = 0;
function nextStepId() { return `step-${Date.now()}-${++stepCounter}`; }

function ChatInteraction({ initialMessage = '' }: ChatInteractionProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoSent = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [detailModal, setDetailModal] = useState<{ open: boolean; title: string; content: string }>({ open: false, title: '', content: '' });
  const [expandedBubble, setExpandedBubble] = useState<number | null>(null);

  const {
    systemPrompt,
    selectedTools,
    contextStrategy,
    currentScene,
    resetTimeline,
    addTimelineStep,
    completeTimelineStep,
    updateTimelineStepData,
    addMessage,
    conversationHistory,
    addApiRequest,
    addApiResponse,
    saveCurrentSession,
    setLastUserInput,
  } = useAppStore();

  useEffect(() => {
    if (initialMessage && !hasAutoSent.current) {
      hasAutoSent.current = true;
      setInput(initialMessage);
      handleSendWithInput(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    handleSendWithInput(input);
  };

  const handleSendWithInput = async (text: string) => {
    if (!text.trim()) return;

    try {
      resetTimeline();
      setLastUserInput(text);
      setIsLoading(true);

      // Step 1: User input
      const userInputStep: TimelineStep = {
        id: nextStepId(),
        type: 'user-input',
        icon: '💬',
        title: '用户输入',
        description: `发送请求：${text.slice(0, 50)}...`,
        active: false,
        completed: true,
        expandable: true,
        expanded: false,
        details: {
          type: 'user-input',
          text,
          tokenCount: Math.ceil(text.length / 4),
          conversationTurns: conversationHistory.filter(m => m.role === 'user').length + 1,
        },
      };
      addTimelineStep(userInputStep);

      addMessage('user', text);
      saveCurrentSession();
      setInput('');

      // Initialize agent if needed
      if (!agentService.isAgentInitialized()) {
        const config = {
          apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
          baseURL: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
          model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
        };
        await agentService.initialize(config);
      }

      // Inject API recording methods
      agentService.setApiRecordingMethods(addApiRequest, addApiResponse);

      // Register timeline callbacks
      agentService.setTimelineCallbacks({
        onUserInput: () => {}, // Already handled above
        onApiRequestStart: (url, model, contextBreakdown, requestBody) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'api-request',
            icon: '📤',
            title: 'API 请求',
            description: `发送请求到 ${model}`,
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            details: { type: 'api-request', url, model, contextBreakdown, requestBody },
          };
          addTimelineStep(step);
        },
        onApiResponseReceived: (statusCode, duration, tokenUsage, responseType, responseBody) => {
          // Find the current active api-request step and complete it
          const state = useAppStore.getState();
          const requestStep = [...state.timelineSteps].reverse().find(s => s.type === 'api-request' && s.active);
          if (requestStep) {
            completeTimelineStep(requestStep.id);
          }
          // Add api-response step
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'api-response',
            icon: '📥',
            title: 'API 响应',
            description: responseType === 'tool_call' ? '收到工具调用指令' : responseType === 'error' ? '响应错误' : '收到最终响应',
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            duration,
            tokenUsage,
            details: { type: 'api-response', statusCode, duration, tokenUsage, responseType, responseBody },
          };
          addTimelineStep(step);
          // Complete immediately since we have all data
          setTimeout(() => {
            completeTimelineStep(step.id);
          }, 100);
        },
        onToolCallDetected: (toolName, toolDescription, parameters, reasoning) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'tool-call',
            icon: '🔧',
            title: `工具: ${toolName}`,
            description: `调用 ${toolName}`,
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            toolCallName: toolName,
            details: { type: 'tool-call', toolName, toolDescription, parameters, reasoning },
          };
          addTimelineStep(step);
        },
        onToolResultReady: (toolName, result, reorganizedContext) => {
          const state = useAppStore.getState();
          const toolStep = [...state.timelineSteps].reverse().find(s => s.type === 'tool-call' && s.toolCallName === toolName && s.active);
          const resultSummary = typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
          if (toolStep) {
            updateTimelineStepData(toolStep.id, {
              details: {
                type: 'tool-call',
                toolName,
                toolDescription: (toolStep.details as any)?.toolDescription || '',
                parameters: (toolStep.details as any)?.parameters || {},
                reasoning: (toolStep.details as any)?.reasoning || '',
                result,
                resultSummary,
                reorganizedContext,
              },
            });
            completeTimelineStep(toolStep.id);
          }
        },
        onAgentResponse: (text, tokenUsage, toolsUsed, apiCallCount) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'agent-response',
            icon: '🤖',
            title: '智能体回复',
            description: '收到大模型响应',
            active: false,
            completed: true,
            expandable: true,
            expanded: false,
            tokenUsage,
            details: { type: 'agent-response', text, tokenUsage, toolsUsed, apiCallCount },
          };
          addTimelineStep(step);
        },
      });

      // Send message to Claude
      const agentResponse = await agentService.sendMessage(
        text,
        systemPrompt,
        selectedTools,
        contextStrategy
      );

      addMessage('assistant', agentResponse);
      saveCurrentSession();
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      addMessage('assistant', `抱歉，处理您的请求时出现错误: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 消息区域 */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {conversationHistory.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '32px 0', fontSize: '14px' }}>
            开始对话来体验上下文管理！
          </div>
        ) : (
          conversationHistory.map((msg, index) => {
            const isUser = msg.role === 'user';
            const isExpanded = expandedBubble === index;

            return (
              <div key={index} style={{
                display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start', gap: '8px', animation: 'msgIn 0.3s ease-out',
              }}>
                {/* Avatar */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 600, flexShrink: 0,
                  ...(isUser
                    ? { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))', color: '#fff' }
                    : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' })
                }}>
                  {isUser ? 'U' : 'A'}
                </div>

                {/* Bubble */}
                <div style={{ maxWidth: '75%', position: 'relative' }}>
                  <div style={{
                    padding: '10px 14px', fontSize: '13px', lineHeight: 1.5,
                    ...(isUser
                      ? {
                          background: 'linear-gradient(135deg, rgba(91,156,245,0.15), rgba(167,139,250,0.1))',
                          border: '1px solid rgba(91,156,245,0.15)',
                          color: 'var(--text-primary)',
                          borderRadius: '12px 4px 12px 12px'
                        }
                      : {
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                          borderRadius: '4px 12px 12px 12px'
                        })
                  }}>
                    {msg.content}
                  </div>
                  {/* Auxiliary detail button */}
                  <button
                    onClick={() => setExpandedBubble(isExpanded ? null : index)}
                    style={{
                      position: 'absolute', bottom: '-2px', right: isUser ? undefined : '-4px',
                      left: isUser ? '-4px' : undefined,
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      borderRadius: '4px', color: 'var(--text-tertiary)', fontSize: '9px',
                      padding: '1px 4px', cursor: 'pointer', lineHeight: 1,
                    }}
                  >
                    ···
                  </button>
                  {/* Auxiliary detail panel */}
                  {isExpanded && (
                    <div style={{
                      marginTop: '8px', padding: '8px 10px', fontSize: '10px', lineHeight: 1.5,
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      borderRadius: '6px', color: 'var(--text-tertiary)',
                    }}>
                      {isUser ? (
                        <>
                          <div>Token 数: {Math.ceil(msg.content.length / 4)}</div>
                          <div>对话轮次: {Math.floor(index / 2) + 1}</div>
                        </>
                      ) : (
                        <>
                          {msg.tokenUsage && (
                            <div>Token: input {msg.tokenUsage.input} / output {msg.tokenUsage.output}</div>
                          )}
                          {msg.apiCallCount != null && <div>API 调用: {msg.apiCallCount}次</div>}
                          {msg.toolsUsed && msg.toolsUsed.length > 0 && <div>使用工具: {msg.toolsUsed.join(', ')}</div>}
                          {msg.timelineStepIndex != null && <div>步骤索引: {msg.timelineStepIndex}</div>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div style={{
        background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)',
        padding: '12px 20px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <ToolSelectorBar />
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              disabled={isLoading}
              rows={1}
              style={{
                width: '100%', padding: '12px 48px 12px 14px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: '10px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)', fontSize: '13px',
                resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '120px',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-default)'; }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              style={{
                position: 'absolute', right: '6px', bottom: '6px',
                width: '34px', height: '34px',
                background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
                border: 'none', borderRadius: '8px', color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <DetailModal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, title: '', content: '' })}
        title={detailModal.title}
        content={formatPayloadContent(detailModal.content)}
      />
    </div>
  );
}

function formatPayloadContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export default ChatInteraction;
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -40`

Expected: ChatInteraction compiles. Fix any remaining type errors.

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/ChatInteraction.tsx
git commit -m "feat: rewrite ChatInteraction with callback-driven timeline and bubble details"
```

---

### Task 6: 改造 BottomPanel 接入 DetailModal + 改造 DetailModal

**Files:**
- Modify: `context-lab/src/components/BottomPanel.tsx`
- Modify: `context-lab/src/components/DetailModal.tsx`

- [ ] **Step 1: Update BottomPanel to pass onViewFullPayload to TimelineReplay**

Replace BottomPanel's content:

```tsx
import React, { useState } from 'react';
import TokenAllocation from './TokenAllocation';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';
import DetailModal from './DetailModal';

export default function BottomPanel() {
  const [detailModal, setDetailModal] = useState<{ open: boolean; title: string; content: string }>({
    open: false, title: '', content: ''
  });

  return (
    <div style={{
      height: 'var(--bottom-panel-height)',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--bg-base)',
      display: 'flex',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-emerald)" label="Token 分配" />
        <TokenAllocation />
      </div>
      <div style={{ flex: 1, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-violet)" label="策略对比" />
        <StrategyComparator />
      </div>
      <div style={{ flex: 1.2, padding: '14px 18px', overflow: 'hidden' }}>
        <VizTitle color="var(--accent-blue)" label="交互过程" />
        <TimelineReplay onViewFullPayload={(title, content) => setDetailModal({ open: true, title, content })} />
      </div>

      <DetailModal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, title: '', content: '' })}
        title={detailModal.title}
        content={detailModal.content}
      />
    </div>
  );
}

function VizTitle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' as const,
      letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Enhance DetailModal with JSON formatting**

Replace `DetailModal.tsx` content to add JSON syntax highlighting and copy formatting:

```tsx
import { useEffect } from 'react';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

function DetailModal({ isOpen, onClose, title, content }: DetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  // Try to parse and pretty-print JSON
  let displayContent = content;
  try {
    const parsed = JSON.parse(content);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON, display as-is
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: '16px',
      }}
      onClick={handleBackdropClick}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '8px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        maxWidth: '800px', width: '100%', maxHeight: '80vh',
        overflow: 'hidden', border: '1px solid var(--border-default)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: '60vh' }}>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.6,
            color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)',
            padding: '12px', borderRadius: '6px', overflowX: 'auto',
            margin: 0,
          }}>
            {displayContent}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '8px', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 14px', background: 'var(--accent-blue)', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            }}
          >
            复制
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default DetailModal;
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd context-lab && npx tsc --noEmit 2>&1 | head -30`

Expected: All components compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add context-lab/src/components/BottomPanel.tsx context-lab/src/components/DetailModal.tsx
git commit -m "feat: integrate DetailModal into BottomPanel and enhance JSON display"
```

---

### Task 7: 清理旧组件

**Files:**
- Delete: `context-lab/src/components/ApiReorganizeStep.tsx`
- Delete: `context-lab/src/components/ApiReorganizeStep.test.tsx`
- Delete: `context-lab/src/components/ToolInteractionDetails.tsx`

- [ ] **Step 1: Check for any remaining imports of deleted components**

Run: `cd context-lab && grep -r "ApiReorganizeStep\|ToolInteractionDetails" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules`

Expected: No remaining imports (these components were never integrated into the app).

- [ ] **Step 2: Delete the old component files**

```bash
rm context-lab/src/components/ApiReorganizeStep.tsx
rm context-lab/src/components/ApiReorganizeStep.test.tsx
rm context-lab/src/components/ToolInteractionDetails.tsx
```

- [ ] **Step 3: Run build to verify no broken imports**

Run: `cd context-lab && npm run build 2>&1 | tail -20`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A context-lab/src/components/
git commit -m "chore: remove ApiReorganizeStep and ToolInteractionDetails (replaced by StepDetailPanel)"
```

---

### Task 8: 构建验证和最终集成测试

**Files:**
- Verify: All modified files

- [ ] **Step 1: Run full TypeScript check**

Run: `cd context-lab && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run production build**

Run: `cd context-lab && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Start dev server and verify**

Run: `cd context-lab && npm run dev`

Manual verification checklist:
1. Open http://localhost:5173
2. Start a conversation — verify timeline steps appear dynamically (not all at once)
3. Click a completed step — verify inline detail panel expands
4. Click "查看完整报文" — verify DetailModal opens with formatted JSON
5. Click another step — verify accordion behavior (previous collapses)
6. Click ··· on a message bubble — verify auxiliary detail panel expands
7. Verify no console errors

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final integration fixes for RQ-015"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Section | Task |
|-------------|------|
| 时间线步骤结构重构 | Task 1 (types) + Task 2 (callbacks) + Task 4 (TimelineReplay) |
| StepDetailPanel 组件 | Task 3 |
| 对话气泡辅助详情 | Task 5 (ChatInteraction) |
| agentService 回调改造 | Task 2 |
| Store 类型扩展和 actions | Task 1 |
| DetailModal 增强 | Task 6 |
| 旧组件清理 | Task 7 |
| 乔布斯设计理念合规 | All tasks follow inline-expand + accordion pattern |

### 2. Placeholder Scan

No TBD, TODO, or vague placeholders found. All code steps contain complete implementations.

### 3. Type Consistency

- `TimelineStep.type` uses `'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response'` consistently across store, StepDetailPanel, TimelineReplay, and ChatInteraction
- `StepDetails` discriminated union matches via `details.type` field
- `addTimelineStep`, `completeTimelineStep`, `updateTimelineStepData` action signatures match usage in ChatInteraction
- `onViewFullPayload` callback signature `(title: string, content: string) => void` is consistent between StepDetailPanel, TimelineReplay, BottomPanel, and ChatInteraction

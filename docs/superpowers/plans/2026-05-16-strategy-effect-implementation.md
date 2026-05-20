# RQ-019: 优化上下文控制策略的影响 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让上下文控制策略真正生效，并在交互过程和 BottomPanel 中可视化策略效果

**Architecture:** 在 agentService 中实现 `applyStrategy` 方法处理四种策略行为，新增 `StrategyEffect` 类型存储策略过滤结果，新建 `StrategyEffectCard`（BottomPanel）和 `StrategyEffectStep`（时间线）两个组件展示策略前后对比

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS

---

### Task 1: 新增 StrategyEffect 类型

**Files:**
- Modify: `context-lab/src/types/index.ts`

- [ ] **Step 1: 添加 StrategyEffect 接口到 types/index.ts**

在 `ContextStrategy` 类型定义之后添加：

```typescript
export interface StrategyEffect {
  strategy: ContextStrategy;
  triggered: boolean;
  beforeMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  afterMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  removedMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  summaryContent?: string;
  beforeTokenCount: number;
  afterTokenCount: number;
  degraded?: boolean;
  degradeReason?: string;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/types/index.ts
git commit -m "feat(rq019): add StrategyEffect type definition"
```

---

### Task 2: appStore 新增 strategyEffect 状态

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 导入 StrategyEffect 类型**

在文件顶部的 import 中添加：

```typescript
import type { Session, SceneConfig, ContextStrategy, StrategyEffect } from '../types/index';
```

- [ ] **Step 2: 在 AppState 接口中添加 strategyEffect 字段**

在 `currentStepIndex: number;` 之后添加：

```typescript
strategyEffect: StrategyEffect | null;
```

- [ ] **Step 3: 在 AppState 接口中添加 setStrategyEffect action**

在 action 区域（如 `setLastUserInput` 附近）添加：

```typescript
setStrategyEffect: (effect: StrategyEffect | null) => void;
```

- [ ] **Step 4: 在 store 实现中添加初始值**

在 `currentStepIndex: 0,` 之后添加：

```typescript
strategyEffect: null,
```

- [ ] **Step 5: 在 store 实现中添加 setStrategyEffect**

在 `setLastUserInput` 实现附近添加：

```typescript
setStrategyEffect: (effect) => set({ strategyEffect: effect }),
```

- [ ] **Step 6: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add context-lab/src/stores/appStore.ts
git commit -m "feat(rq019): add strategyEffect state to appStore"
```

---

### Task 3: appStore 新增 StrategyEffectStep 时间线类型

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 新增 StrategyEffectStepDetails 接口**

在 `AgentResponseDetails` 之后、`StepDetails` 类型之前添加：

```typescript
export interface StrategyEffectStepDetails {
  type: 'strategy-effect';
  strategy: ContextStrategy;
  strategyLabel: string;
  beforeCount: number;
  afterCount: number;
  beforeTokens: number;
  afterTokens: number;
  savingsPercent: number;
  removedCount: number;
  summaryContent?: string;
  degraded?: boolean;
  degradeReason?: string;
}
```

- [ ] **Step 2: 更新 StepDetails 联合类型**

将：
```typescript
export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails;
```
改为：
```typescript
export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails | StrategyEffectStepDetails;
```

- [ ] **Step 3: 更新 TimelineStep.type 联合类型**

将 `TimelineStep` 接口中的 `type` 字段：
```typescript
type: 'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response';
```
改为：
```typescript
type: 'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response' | 'strategy-effect';
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 可能有 StepDetailPanel 的类型错误（因为新增了 type 分支），这是预期的，下一任务修复

- [ ] **Step 5: Commit**

```bash
git add context-lab/src/stores/appStore.ts
git commit -m "feat(rq019): add strategy-effect step type to timeline"
```

---

### Task 4: agentService 实现 applyStrategy

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

- [ ] **Step 1: 导入 StrategyEffect 类型**

在文件顶部添加：

```typescript
import type { StrategyEffect, ContextStrategy } from '../types/index';
```

- [ ] **Step 2: 添加策略辅助方法**

在 `getSlidingWindowMessages()` 方法之后添加以下私有方法：

```typescript
private getStrategyLabel(strategy: ContextStrategy): string {
  const labels: Record<ContextStrategy, string> = {
    sliding: '滑动窗口',
    full: '完整记忆',
    summary: '摘要记忆',
    none: '无记忆',
  };
  return labels[strategy];
}

private extractMessageText(msg: ClaudeMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text || '')
    .join('\n');
}

private async generateSummary(messages: ClaudeMessage[]): Promise<string> {
  const conversationText = messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${this.extractMessageText(m)}`)
    .join('\n');

  const response = await fetch(`${this.baseURL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey!,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: this.model,
      max_tokens: 256,
      messages: [{ role: 'user', content: `请用 2-3 句话总结以下对话的关键信息：\n\n${conversationText}` }],
    }),
  });

  if (!response.ok) {
    throw new Error(`摘要 API 调用失败: ${response.status}`);
  }

  const data = await response.json();
  return data.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');
}

async applyStrategy(
  messages: ClaudeMessage[],
  strategy: ContextStrategy
): Promise<StrategyEffect> {
  const beforeMessages = messages.map(m => ({
    role: m.role,
    content: this.extractMessageText(m),
  }));

  const beforeTokenCount = messages.reduce(
    (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
  );

  // full: no filtering
  if (strategy === 'full') {
    return {
      strategy: 'full',
      triggered: false,
      beforeMessages,
      afterMessages: beforeMessages,
      removedMessages: [],
      beforeTokenCount,
      afterTokenCount: beforeTokenCount,
    };
  }

  // none: only the last user message
  if (strategy === 'none') {
    if (messages.length <= 1) {
      return {
        strategy: 'none',
        triggered: false,
        beforeMessages,
        afterMessages: beforeMessages,
        removedMessages: [],
        beforeTokenCount,
        afterTokenCount: beforeTokenCount,
      };
    }
    const lastMsg = messages[messages.length - 1];
    const afterMessages = [{ role: lastMsg.role, content: this.extractMessageText(lastMsg) }];
    const afterTokenCount = this.estimateTokens(this.extractMessageText(lastMsg));
    return {
      strategy: 'none',
      triggered: true,
      beforeMessages,
      afterMessages,
      removedMessages: beforeMessages.slice(0, -1),
      beforeTokenCount,
      afterTokenCount,
    };
  }

  // sliding: keep last N messages
  if (strategy === 'sliding') {
    const maxMessages = 10;
    if (messages.length <= maxMessages) {
      return {
        strategy: 'sliding',
        triggered: false,
        beforeMessages,
        afterMessages: beforeMessages,
        removedMessages: [],
        beforeTokenCount,
        afterTokenCount: beforeTokenCount,
      };
    }
    const kept = messages.slice(-maxMessages);
    const removed = messages.slice(0, messages.length - maxMessages);
    const afterMessages = kept.map(m => ({ role: m.role, content: this.extractMessageText(m) }));
    const afterTokenCount = kept.reduce(
      (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
    );
    return {
      strategy: 'sliding',
      triggered: true,
      beforeMessages,
      afterMessages,
      removedMessages: removed.map(m => ({ role: m.role, content: this.extractMessageText(m) })),
      beforeTokenCount,
      afterTokenCount,
    };
  }

  // summary: summarize old messages, keep recent ones
  if (strategy === 'summary') {
    const recentCount = 4;
    const threshold = 6;
    if (messages.length <= threshold) {
      return {
        strategy: 'summary',
        triggered: false,
        beforeMessages,
        afterMessages: beforeMessages,
        removedMessages: [],
        beforeTokenCount,
        afterTokenCount: beforeTokenCount,
      };
    }

    const oldMessages = messages.slice(0, messages.length - recentCount);
    const recentMessages = messages.slice(-recentCount);

    try {
      // Check cache first
      const cacheKey = oldMessages.map((m, i) => `${i}:${this.extractMessageText(m).slice(0, 50)}`).join('|');
      let summary = this._summaryCache.get(cacheKey) || '';
      if (!summary) {
        summary = await this.generateSummary(oldMessages);
        this._summaryCache.set(cacheKey, summary);
      }
      const summaryMsg = { role: 'assistant' as const, content: `[对话摘要] ${summary}` };
      const afterMessages = [summaryMsg, ...recentMessages.map(m => ({ role: m.role, content: this.extractMessageText(m) }))];
      const afterTokenCount = afterMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
      return {
        strategy: 'summary',
        triggered: true,
        beforeMessages,
        afterMessages,
        removedMessages: oldMessages.map(m => ({ role: m.role, content: this.extractMessageText(m) })),
        summaryContent: summary,
        beforeTokenCount,
        afterTokenCount,
      };
    } catch (error) {
      // Degrade to sliding
      const kept = messages.slice(-recentCount);
      const removed = messages.slice(0, messages.length - recentCount);
      const afterMessages = kept.map(m => ({ role: m.role, content: this.extractMessageText(m) }));
      const afterTokenCount = kept.reduce(
        (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
      );
      return {
        strategy: 'summary',
        triggered: true,
        beforeMessages,
        afterMessages,
        removedMessages: removed.map(m => ({ role: m.role, content: this.extractMessageText(m) })),
        beforeTokenCount,
        afterTokenCount,
        degraded: true,
        degradeReason: (error as Error).message || '摘要生成失败',
      };
    }
  }

  // Fallback (should not reach)
  return {
    strategy,
    triggered: false,
    beforeMessages,
    afterMessages: beforeMessages,
    removedMessages: [],
    beforeTokenCount,
    afterTokenCount: beforeTokenCount,
  };
}
```

- [ ] **Step 3: 修改 sendMessage 中的策略逻辑**

找到 `sendMessage` 中的策略判断代码（约第 357-360 行）：

```typescript
let messagesToSend: ClaudeMessage[];
if (contextStrategy === 'sliding') {
  messagesToSend = this.getSlidingWindowMessages();
} else {
  messagesToSend = [...this.conversationHistory];
}
```

替换为：

```typescript
// Apply strategy and get effect for visualization
const strategyEffect = await this.applyStrategy(this.conversationHistory, contextStrategy);
let messagesToSend: ClaudeMessage[];

if (strategyEffect.triggered && contextStrategy === 'none') {
  messagesToSend = [this.conversationHistory[this.conversationHistory.length - 1]];
} else if (strategyEffect.triggered && contextStrategy === 'sliding') {
  messagesToSend = this.getSlidingWindowMessages();
} else if (strategyEffect.triggered && contextStrategy === 'summary') {
  if (strategyEffect.degraded) {
    // Degrade to sliding behavior
    messagesToSend = this.conversationHistory.slice(-4);
  } else {
    // Use summary + recent messages
    const summaryBlock: ClaudeMessage = {
      role: 'assistant',
      content: `[对话摘要] ${strategyEffect.summaryContent}`,
    };
    const recentMessages = this.conversationHistory.slice(-4);
    messagesToSend = [summaryBlock, ...recentMessages];
  }
} else {
  messagesToSend = [...this.conversationHistory];
}

// Store effect for external access
this._lastStrategyEffect = strategyEffect;
```

- [ ] **Step 4: 添加 _lastStrategyEffect 属性和 getter**

在类属性区域（`private apiCallCount = 0;` 之后）添加：

```typescript
private _lastStrategyEffect: StrategyEffect | null = null;

// Summary cache: key = joined message IDs, value = summary text
private _summaryCache: Map<string, string> = new Map();

getLastStrategyEffect(): StrategyEffect | null {
  return this._lastStrategyEffect;
}
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add context-lab/src/services/agentService.ts
git commit -m "feat(rq019): implement applyStrategy with summary/none/sliding/full logic"
```

---

### Task 5: ChatInteraction 集成策略效果

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: 导入 StrategyEffectStepDetails**

在文件顶部的 import 中确保从 appStore 导入 `StrategyEffectStepDetails`：

```typescript
import { useAppStore, type TimelineStep, type StrategyEffectStepDetails } from '../stores/appStore';
```

同时导入 `ContextStrategy`（如果尚未导入）：

```typescript
import type { ContextStrategy } from '../types/index';
```

- [ ] **Step 2: 从 store 中解构 setStrategyEffect**

在 `handleSendWithInput` 函数内部或组件顶部的 store 解构中，添加 `setStrategyEffect`：

找到类似 `const { ... } = useAppStore();` 的解构，添加 `setStrategyEffect`。

- [ ] **Step 3: 在 sendMessage 调用后插入策略效果步骤**

找到 `const agentResponse = await agentService.sendMessage(...)` 这一行（约 218-223 行）。在这行之后、`addMessage('assistant', agentResponse)` 之前，添加：

```typescript
// Check if strategy was triggered and add timeline step
const strategyEffect = agentService.getLastStrategyEffect();
if (strategyEffect && strategyEffect.triggered) {
  setStrategyEffect(strategyEffect);
  const strategyLabels: Record<string, string> = {
    sliding: '滑动窗口',
    full: '完整记忆',
    summary: '摘要记忆',
    none: '无记忆',
  };
  const savingsPercent = strategyEffect.beforeTokenCount > 0
    ? Math.round((1 - strategyEffect.afterTokenCount / strategyEffect.beforeTokenCount) * 100)
    : 0;

  const strategyStep: TimelineStep = {
    id: nextStepId(),
    type: 'strategy-effect',
    icon: '⚡',
    title: `策略生效: ${strategyLabels[strategyEffect.strategy] || strategyEffect.strategy}`,
    description: strategyEffect.degraded
      ? `摘要降级为滑动窗口 - ${strategyEffect.degradeReason}`
      : `${strategyEffect.beforeMessages.length} 条 → ${strategyEffect.afterMessages.length} 条 · 节省 ${savingsPercent}%`,
    active: false,
    completed: true,
    expandable: true,
    expanded: false,
    details: {
      type: 'strategy-effect',
      strategy: strategyEffect.strategy,
      strategyLabel: strategyLabels[strategyEffect.strategy] || strategyEffect.strategy,
      beforeCount: strategyEffect.beforeMessages.length,
      afterCount: strategyEffect.afterMessages.length,
      beforeTokens: strategyEffect.beforeTokenCount,
      afterTokens: strategyEffect.afterTokenCount,
      savingsPercent,
      removedCount: strategyEffect.removedMessages.length,
      summaryContent: strategyEffect.summaryContent,
      degraded: strategyEffect.degraded,
      degradeReason: strategyEffect.degradeReason,
    } as StrategyEffectStepDetails,
  };
  addTimelineStep(strategyStep);
} else {
  setStrategyEffect(null);
}
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 可能有 StepDetailPanel 类型错误（下一任务修复），ChatInteraction 本身无错误

- [ ] **Step 5: Commit**

```bash
git add context-lab/src/components/ChatInteraction.tsx
git commit -m "feat(rq019): integrate strategy effect into ChatInteraction timeline"
```

---

### Task 6: StepDetailPanel 添加策略效果展示

**Files:**
- Modify: `context-lab/src/components/StepDetailPanel.tsx`

- [ ] **Step 1: 导入 StrategyEffectStepDetails 类型**

在文件顶部的 import 中添加：

```typescript
import type { TimelineStep, UserInputDetails, ApiRequestDetails, ApiResponseDetails, ToolCallDetails, AgentResponseDetails, StrategyEffectStepDetails } from '../stores/appStore';
```

- [ ] **Step 2: 添加 StrategyEffectSection 组件**

在 `AgentResponseSection` 之后添加：

```typescript
function StrategyEffectSection({ details, isMaximized }: { details: StrategyEffectStepDetails; isMaximized?: boolean }) {
  return (
    <>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>⚡ {details.strategyLabel}</span>
        {details.degraded && (
          <span style={{ color: 'var(--accent-red)', marginLeft: '8px', fontSize: FS.xs(isMaximized) }}>
            降级: {details.degradeReason}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>策略前: </span>
          {details.beforeCount} 条 · {details.beforeTokens} tokens
        </span>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>策略后: </span>
          {details.afterCount} 条 · {details.afterTokens} tokens
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: FS.code(isMaximized) }}>
        <span style={{ color: 'var(--accent-emerald)' }}>节省 {details.savingsPercent}%</span>
        <span style={{ color: 'var(--text-tertiary)', marginLeft: '12px' }}>移除 {details.removedCount} 条消息</span>
      </div>
      {details.summaryContent && (
        <div style={{ marginTop: '8px', padding: '6px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px', borderLeft: '2px solid var(--accent-amber)' }}>
          <div style={{ fontSize: FS.xs(isMaximized), color: 'var(--text-tertiary)', marginBottom: '4px' }}>摘要内容:</div>
          <div style={{ fontSize: FS.sm(isMaximized), color: 'var(--text-secondary)' }}>{details.summaryContent}</div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: 在 StepDetailPanel 主组件中添加策略效果分支**

找到 `{step.details.type === 'agent-response' && ...}` 这一行，在其后添加：

```typescript
{step.details.type === 'strategy-effect' && <StrategyEffectSection details={step.details} isMaximized={isMaximized} />}
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add context-lab/src/components/StepDetailPanel.tsx
git commit -m "feat(rq019): add strategy effect detail section to StepDetailPanel"
```

---

### Task 7: 新建 StrategyEffectCard 组件

**Files:**
- Create: `context-lab/src/components/StrategyEffectCard.tsx`

- [ ] **Step 1: 创建 StrategyEffectCard 组件**

```typescript
import React from 'react';
import { useAppStore } from '../stores/appStore';

const STRATEGY_LABELS: Record<string, string> = {
  sliding: '滑动窗口',
  full: '完整记忆',
  summary: '摘要记忆',
  none: '无记忆',
};

function StrategyEffectCard() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);

  if (!strategyEffect || !strategyEffect.triggered) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px' }}>
        {strategyEffect === null
          ? '发送消息后，策略效果将在此展示'
          : `当前策略: ${STRATEGY_LABELS[contextStrategy]} · 无消息被过滤`}
      </div>
    );
  }

  const savingsPercent = strategyEffect.beforeTokenCount > 0
    ? Math.round((1 - strategyEffect.afterTokenCount / strategyEffect.beforeTokenCount) * 100)
    : 0;

  return (
    <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
          {STRATEGY_LABELS[strategyEffect.strategy]}
        </span>
        {strategyEffect.degraded && (
          <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>降级</span>
        )}
      </div>

      {/* Before/After comparison */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略前</div>
          <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {strategyEffect.beforeMessages.length} 条 · {strategyEffect.beforeTokenCount}t
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-amber)', fontSize: '14px' }}>→</div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', padding: '6px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>策略后</div>
          <div style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
            {strategyEffect.afterMessages.length} 条 · {strategyEffect.afterTokenCount}t
          </div>
        </div>
      </div>

      {/* Savings */}
      <div style={{ marginTop: '6px', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        节省 {savingsPercent}%
      </div>
    </div>
  );
}

export default StrategyEffectCard;
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/StrategyEffectCard.tsx
git commit -m "feat(rq019): create StrategyEffectCard component for BottomPanel"
```

---

### Task 8: BottomPanel 替换 StrategyComparator 并加最大化

**Files:**
- Modify: `context-lab/src/components/BottomPanel.tsx`

- [ ] **Step 1: 替换 import**

将：
```typescript
import StrategyComparator from './StrategyComparator';
```
替换为：
```typescript
import StrategyEffectCard from './StrategyEffectCard';
```

- [ ] **Step 2: 替换中间列内容**

找到中间列（`flex: 1`，标题为"策略对比"的那个），将整列替换为：

```typescript
<div style={{ flex: 1.2, padding: '14px 18px', borderRight: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
  <div style={{
    fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const,
    letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '12px',
    display: 'flex', alignItems: 'center', gap: '6px',
  }}>
    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-amber)' }} />
    <span style={{ flex: 1 }}>策略生效</span>
    <button
      onClick={() => setIsMaximized(true)}
      title="最大化"
      style={{
        background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '3px',
        color: 'var(--text-tertiary)', cursor: 'pointer', padding: '1px 4px',
        fontSize: '12px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      ⛶
    </button>
  </div>
  <StrategyEffectCard />
</div>
```

注意：现在有两列都有最大化按钮，需要区分。当前"交互过程"的最大化使用 `isMaximized` 状态。我们需要将策略生效的最大化分开。

- [ ] **Step 3: 添加策略最大化状态**

在 `BottomPanel` 组件中，在 `const [isMaximized, setIsMaximized] = useState(false);` 之后添加：

```typescript
const [isStrategyMaximized, setIsStrategyMaximized] = useState(false);
```

将策略生效列的按钮 `onClick` 改为：

```typescript
onClick={() => setIsStrategyMaximized(true)}
```

- [ ] **Step 4: 添加策略最大化 ESC 处理**

在 `useEffect` 的 ESC 处理中，添加策略最大化的判断：

将：
```typescript
if (e.key === 'Escape' && isMaximized) {
  if (inlinePayload) {
    setInlinePayload(null);
  } else {
    setIsMaximized(false);
  }
}
```
改为：
```typescript
if (e.key === 'Escape') {
  if (isStrategyMaximized) {
    setIsStrategyMaximized(false);
  } else if (isMaximized) {
    if (inlinePayload) {
      setInlinePayload(null);
    } else {
      setIsMaximized(false);
    }
  }
}
```

将 `useEffect` 的依赖数组从 `[isMaximized, inlinePayload]` 改为 `[isMaximized, isStrategyMaximized, inlinePayload]`。

- [ ] **Step 5: 添加策略最大化弹窗**

在现有 `isMaximized` 弹窗之后、`</>` 闭合之前，添加策略最大化弹窗：

```typescript
{isStrategyMaximized && (
  <div
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', flexDirection: 'column', zIndex: 100,
    }}
    onClick={(e) => { if (e.target === e.currentTarget) setIsStrategyMaximized(false); }}
  >
    <div style={{
      background: 'var(--bg-base)', borderRadius: '8px',
      margin: '24px', flex: 1, display: 'flex', flexDirection: 'column',
      border: '1px solid var(--border-default)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-amber)' }} />
          策略生效
        </div>
        <button
          onClick={() => setIsStrategyMaximized(false)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-tertiary)',
            cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '4px',
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '18px', overflowY: 'auto' }}>
        <StrategyEffectMaximizedView />
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: 在文件底部添加 StrategyEffectMaximizedView 组件**

在 `VizTitle` 函数之后添加：

```typescript
function StrategyEffectMaximizedView() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);

  const STRATEGY_LABELS: Record<string, string> = {
    sliding: '滑动窗口',
    full: '完整记忆',
    summary: '摘要记忆',
    none: '无记忆',
  };

  if (!strategyEffect || !strategyEffect.triggered) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px', fontSize: '15px' }}>
        {strategyEffect === null
          ? '发送消息后，策略效果将在此展示'
          : `当前策略: ${STRATEGY_LABELS[contextStrategy]} · 无消息被过滤`}
      </div>
    );
  }

  const savingsPercent = strategyEffect.beforeTokenCount > 0
    ? Math.round((1 - strategyEffect.afterTokenCount / strategyEffect.beforeTokenCount) * 100)
    : 0;

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-amber)' }}>
          ⚡ {STRATEGY_LABELS[strategyEffect.strategy]}
        </span>
        {strategyEffect.degraded && (
          <span style={{ fontSize: '12px', color: 'var(--accent-red)', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
            降级: {strategyEffect.degradeReason}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Before */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            策略前（完整对话历史）
          </div>
          {strategyEffect.beforeMessages.map((msg, i) => (
            <div key={i} style={{
              padding: '4px 8px', marginBottom: '4px',
              borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
              background: msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
              borderRadius: '0 4px 4px 0',
            }}>
              <span style={{ fontSize: '10px', color: msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                {msg.role === 'user' ? '用户' : '助手'}
              </span>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
              </div>
            </div>
          ))}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            共 {strategyEffect.beforeMessages.length} 条消息 · {strategyEffect.beforeTokenCount} tokens
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '24px', color: 'var(--accent-amber)' }}>→</div>

        {/* After */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            策略后（发送给 API 的内容）
          </div>
          {strategyEffect.afterMessages.map((msg, i) => {
            const isSummary = msg.content.startsWith('[对话摘要]');
            const isRemoved = strategyEffect.removedMessages.some(
              rm => rm.role === msg.role && rm.content === msg.content
            );
            return (
              <div key={i} style={{
                padding: '4px 8px', marginBottom: '4px',
                borderLeft: `2px solid ${isSummary ? 'var(--accent-amber)' : isRemoved ? 'var(--text-tertiary)' : msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
                background: isSummary ? 'rgba(245,158,11,0.08)' : isRemoved ? 'rgba(71,85,105,0.08)' : msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
                borderRadius: '0 4px 4px 0',
                color: isRemoved ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                textDecoration: isRemoved ? 'line-through' : 'none',
              }}>
                <span style={{ fontSize: '10px', color: isSummary ? 'var(--accent-amber)' : isRemoved ? 'var(--text-tertiary)' : msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                  {isSummary ? '摘要' : msg.role === 'user' ? '用户' : '助手'}
                </span>
                <div style={{ fontSize: '13px', wordBreak: 'break-all' }}>
                  {msg.content.length > 80 ? msg.content.slice(0, 80) + '...' : msg.content}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--accent-emerald)' }}>
            {strategyEffect.afterMessages.length} 条消息 · {strategyEffect.afterTokenCount} tokens · 节省 {savingsPercent}%
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 8: Commit**

```bash
git add context-lab/src/components/BottomPanel.tsx
git commit -m "feat(rq019): replace StrategyComparator with StrategyEffectCard in BottomPanel, add maximize"
```

---

### Task 9: 删除 StrategyComparator 组件

**Files:**
- Delete: `context-lab/src/components/StrategyComparator.tsx`

- [ ] **Step 1: 确认没有其他文件引用 StrategyComparator**

Run: `cd context-lab && grep -r "StrategyComparator" src/`
Expected: 无结果（BottomPanel 已在 Task 8 中替换 import）

- [ ] **Step 2: 删除文件**

Run: `rm context-lab/src/components/StrategyComparator.tsx`

- [ ] **Step 3: 验证构建**

Run: `cd context-lab && npm run build`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add -u context-lab/src/components/StrategyComparator.tsx
git commit -m "chore(rq019): remove replaced StrategyComparator component"
```

---

### Task 10: 验证和清理

**Files:**
- All modified files

- [ ] **Step 1: 完整 TypeScript 检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 生产构建**

Run: `cd context-lab && npm run build`
Expected: 构建成功

- [ ] **Step 3: 启动开发服务器手动验证**

Run: `cd context-lab && npm run dev`

验证要点：
1. BottomPanel 中间列显示"策略生效"而非"策略对比"
2. 初始状态显示"发送消息后，策略效果将在此展示"
3. 选择 `full` 策略发送消息 → 策略生效区域显示"无消息被过滤"
4. 选择 `sliding` 策略，发送超过 10 条消息 → 策略步骤出现在时间线中，BottomPanel 显示前后对比
5. 选择 `none` 策略，有历史消息时发送 → 策略步骤出现，显示只保留当前消息
6. 选择 `summary` 策略，发送超过 6 条消息 → 策略步骤出现，显示摘要内容
7. 策略生效列的 ⛶ 按钮可打开最大化视图
8. 交互过程的 ⛶ 按钮仍正常工作

- [ ] **Step 4: Commit 最终状态**

```bash
git add -A
git commit -m "feat(rq019): complete strategy effect implementation with visualization"
```

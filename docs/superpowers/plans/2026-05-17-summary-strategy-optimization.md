# RQ-020 优化摘要策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复摘要策略的 API 代理问题，增加摘要质量可视化（原文对比、生成耗时、覆盖范围、降级详情）

**Architecture:** 修复 `generateSummary()` 走 Vite 代理；扩展 `StrategyEffect` 类型增加摘要元数据；增强三个可视化组件展示摘要质量信息

**Tech Stack:** React 18, TypeScript, Zustand

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `context-lab/src/types/index.ts` | Modify | StrategyEffect 接口新增 3 个可选字段 |
| `context-lab/src/services/agentService.ts` | Modify | 修复代理路径 + 填充新字段 |
| `context-lab/src/stores/appStore.ts` | Modify | StrategyEffectStepDetails 同步新字段 + ChatInteraction 传递新字段 |
| `context-lab/src/components/StrategyEffectCard.tsx` | Modify | 缩略视图增加摘要信息 |
| `context-lab/src/components/StepDetailPanel.tsx` | Modify | 详情面板增加原文对比折叠 |
| `context-lab/src/components/BottomPanel.tsx` | Modify | 最大化视图增加摘要原文按钮 |

---

### Task 1: 扩展 StrategyEffect 类型

**Files:**
- Modify: `context-lab/src/types/index.ts:27-38`

- [ ] **Step 1: 在 StrategyEffect 接口中新增三个可选字段**

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
  summaryDuration?: number;      // 摘要生成耗时(ms)
  summarySourceCount?: number;   // 被摘要的消息数
  summarySourceTokens?: number;  // 被摘要的消息 token 数
}
```

- [ ] **Step 2: 运行类型检查确认无破坏性变更**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/types/index.ts
git commit -m "feat(RQ-020): extend StrategyEffect with summary metadata fields"
```

---

### Task 2: 修复 generateSummary 代理路径

**Files:**
- Modify: `context-lab/src/services/agentService.ts:619-648`

- [ ] **Step 1: 修改 generateSummary 方法的 fetch 调用**

将第 624-637 行替换为：

```typescript
  private async generateSummary(messages: ClaudeMessage[]): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${this.extractMessageText(m)}`)
      .join('\n');

    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 256,
        messages: [{ role: 'user', content: `请用 2-3 句话总结以下对话的关键信息：\n\n${conversationText}` }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`摘要 API 调用失败: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    return data.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }
```

关键变更：URL 从 `${this.baseURL}/v1/messages` 改为 `/api/anthropic/v1/messages`；headers 与 `sendMessage` 保持一致；错误信息包含 response body。

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/services/agentService.ts
git commit -m "fix(RQ-020): use Vite proxy for generateSummary API call"
```

---

### Task 3: 在 applyStrategy 中填充摘要元数据字段

**Files:**
- Modify: `context-lab/src/services/agentService.ts:735-794`

- [ ] **Step 1: 修改 applyStrategy 的 summary 分支**

将第 735-794 行的 summary 分支替换为：

```typescript
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
      const summarySourceCount = oldMessages.length;
      const summarySourceTokens = oldMessages.reduce(
        (sum, m) => sum + this.estimateTokens(this.extractMessageText(m)), 0
      );

      try {
        // Check cache first
        const cacheKey = oldMessages.map((m, i) => `${i}:${this.extractMessageText(m).slice(0, 50)}`).join('|');
        let summary = this._summaryCache.get(cacheKey) || '';
        let summaryDuration: number | undefined;
        if (!summary) {
          const startTime = Date.now();
          summary = await this.generateSummary(oldMessages);
          summaryDuration = Date.now() - startTime;
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
          summaryDuration,
          summarySourceCount,
          summarySourceTokens,
        };
      } catch (error) {
        // Degrade to sliding behavior
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
          summarySourceCount,
          summarySourceTokens,
        };
      }
    }
```

变更点：提取 `summarySourceCount` 和 `summarySourceTokens`；非缓存命中时记录 `summaryDuration`；成功和降级路径都填充元数据。

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/services/agentService.ts
git commit -m "feat(RQ-020): populate summary metadata in applyStrategy"
```

---

### Task 4: 同步 appStore 类型并传递新字段

**Files:**
- Modify: `context-lab/src/stores/appStore.ts:50-63`
- Modify: `context-lab/src/components/ChatInteraction.tsx:252-265`

- [ ] **Step 1: 在 StrategyEffectStepDetails 接口新增字段**

在 `context-lab/src/stores/appStore.ts` 第 50-63 行，替换为：

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
  summaryDuration?: number;
  summarySourceCount?: number;
  summarySourceTokens?: number;
  removedMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
```

注意：新增 `removedMessages` 字段，用于原文对比展示。

- [ ] **Step 2: 在 ChatInteraction 中传递新字段**

在 `context-lab/src/components/ChatInteraction.tsx` 中，找到 `details: { type: 'strategy-effect', ... } as StrategyEffectStepDetails` 部分（约第 252-265 行），替换为：

```typescript
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
            summaryDuration: strategyEffect.summaryDuration,
            summarySourceCount: strategyEffect.summarySourceCount,
            summarySourceTokens: strategyEffect.summarySourceTokens,
            removedMessages: strategyEffect.removedMessages,
          } as StrategyEffectStepDetails,
```

- [ ] **Step 3: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add context-lab/src/stores/appStore.ts context-lab/src/components/ChatInteraction.tsx
git commit -m "feat(RQ-020): sync StrategyEffectStepDetails with new metadata fields"
```

---

### Task 5: 增强 StrategyEffectCard 展示摘要信息

**Files:**
- Modify: `context-lab/src/components/StrategyEffectCard.tsx`

- [ ] **Step 1: 在策略触发且为 summary 时，增加摘要元数据展示**

在 StrategyEffectCard 组件中，找到 `{/* Savings */}` 区域（约第 58-61 行），在其后增加：

```tsx
      {/* Summary metadata */}
      {strategyEffect.strategy === 'summary' && strategyEffect.summarySourceCount != null && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          对 {strategyEffect.summarySourceCount} 条消息（约 {strategyEffect.summarySourceTokens}t）生成摘要
          {strategyEffect.summaryDuration != null && (
            <span style={{ marginLeft: '8px', color: 'var(--accent-amber)' }}>
              {strategyEffect.summaryDuration}ms
            </span>
          )}
        </div>
      )}
      {strategyEffect.degraded && strategyEffect.degradeReason && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--accent-red)' }}>
          {strategyEffect.degradeReason}
        </div>
      )}
```

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/StrategyEffectCard.tsx
git commit -m "feat(RQ-020): add summary metadata to StrategyEffectCard"
```

---

### Task 6: 增强 StepDetailPanel 摘要原文对比

**Files:**
- Modify: `context-lab/src/components/StepDetailPanel.tsx:243-276`

- [ ] **Step 1: 重写 StrategyEffectSection 组件，增加原文对比和摘要元数据**

将 `StrategyEffectSection` 函数（第 243-276 行）替换为：

```tsx
function StrategyEffectSection({ details, isMaximized }: { details: StrategyEffectStepDetails; isMaximized?: boolean }) {
  const [showOriginal, setShowOriginal] = React.useState(false);

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
          {details.summarySourceCount != null && (
            <div style={{ marginTop: '4px', fontSize: FS.xs(isMaximized), color: 'var(--text-tertiary)' }}>
              对 {details.summarySourceCount} 条消息（约 {details.summarySourceTokens}t）生成摘要
              {details.summaryDuration != null && (
                <span style={{ marginLeft: '8px', color: 'var(--accent-amber)' }}>{details.summaryDuration}ms</span>
              )}
            </div>
          )}
        </div>
      )}
      {details.removedMessages && details.removedMessages.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            style={{
              background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
              color: 'var(--accent-blue)', fontSize: FS.xs(isMaximized), padding: '3px 8px',
              cursor: 'pointer',
            }}
          >
            {showOriginal ? '收起原文' : '查看被摘要的原始消息'}
          </button>
          {showOriginal && (
            <div style={{ marginTop: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {details.removedMessages.map((msg, i) => (
                <div key={i} style={{
                  padding: '4px 8px', marginBottom: '3px',
                  borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
                  background: 'rgba(0,0,0,0.15)', borderRadius: '0 4px 4px 0',
                }}>
                  <span style={{ fontSize: '10px', color: msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                    {msg.role === 'user' ? '用户' : '助手'}
                  </span>
                  <div style={{ fontSize: FS.xs(isMaximized), color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                    {msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/StepDetailPanel.tsx
git commit -m "feat(RQ-020): add summary original messages comparison to StepDetailPanel"
```

---

### Task 7: 增强 BottomPanel 最大化视图

**Files:**
- Modify: `context-lab/src/components/BottomPanel.tsx:266-368`

- [ ] **Step 1: 增强 StrategyEffectMaximizedView 组件**

在 `StrategyEffectMaximizedView` 函数中：

**a)** 在组件开头添加 `showOriginal` 状态：

```typescript
function StrategyEffectMaximizedView() {
  const strategyEffect = useAppStore(s => s.strategyEffect);
  const contextStrategy = useAppStore(s => s.contextStrategy);
  const [showOriginal, setShowOriginal] = React.useState(false);
```

**b)** 在 header 区域（降级标签后），添加摘要元数据：

在第 301 行 `)}` 之后，添加：

```tsx
        {strategyEffect.strategy === 'summary' && strategyEffect.summarySourceCount != null && (
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '12px' }}>
            对 {strategyEffect.summarySourceCount} 条消息（约 {strategyEffect.summarySourceTokens}t）生成摘要
            {strategyEffect.summaryDuration != null && (
              <span style={{ color: 'var(--accent-amber)', marginLeft: '6px' }}>{strategyEffect.summaryDuration}ms</span>
            )}
          </span>
        )}
```

**c)** 在策略后（After）区域中，摘要消息的渲染（第 339 行 `const isSummary = msg.content.startsWith('[对话摘要]')` 附近），在摘要消息的 `<div>` 内末尾添加"查看原文"按钮：

在摘要消息的 `</div>` 关闭标签前（第 357 行 `</div>` 之前），添加：

```tsx
                  {isSummary && strategyEffect.removedMessages.length > 0 && (
                    <button
                      onClick={() => setShowOriginal(!showOriginal)}
                      style={{
                        background: 'none', border: '1px solid var(--accent-amber)', borderRadius: '3px',
                        color: 'var(--accent-amber)', fontSize: '11px', padding: '1px 6px',
                        cursor: 'pointer', marginTop: '4px',
                      }}
                    >
                      {showOriginal ? '收起原文' : '查看原文'}
                    </button>
                  )}
```

**d)** 在策略后（After）区域的 `</div>` 关闭标签后（第 364 行之后），添加原文展开区域：

```tsx
      {showOriginal && strategyEffect.strategy === 'summary' && strategyEffect.removedMessages.length > 0 && (
        <div style={{
          marginTop: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '14px',
          borderLeft: '3px solid var(--accent-amber)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--accent-amber)', marginBottom: '10px', fontWeight: 600 }}>
            被摘要的原始消息（{strategyEffect.removedMessages.length} 条）
          </div>
          {strategyEffect.removedMessages.map((msg, i) => (
            <div key={i} style={{
              padding: '6px 10px', marginBottom: '4px',
              borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)'}`,
              background: msg.role === 'user' ? 'rgba(139,92,246,0.05)' : 'rgba(59,130,246,0.05)',
              borderRadius: '0 4px 4px 0',
            }}>
              <span style={{ fontSize: '10px', color: msg.role === 'user' ? 'var(--accent-violet)' : 'var(--accent-blue)' }}>
                {msg.role === 'user' ? '用户' : '助手'}
              </span>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                {msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content}
              </div>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/BottomPanel.tsx
git commit -m "feat(RQ-020): add summary original messages to maximized strategy view"
```

---

### Task 8: 构建验证

- [ ] **Step 1: 运行生产构建**

Run: `cd context-lab && npm run build`
Expected: BUILD SUCCESS

- [ ] **Step 2: 运行类型检查**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit（如有构建修复）**

```bash
git add -A
git commit -m "chore(RQ-020): build verification fixes"
```

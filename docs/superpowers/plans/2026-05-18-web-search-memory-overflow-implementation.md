# 优化联网搜索功能，解决内存溢出的问题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决工具调用结果三重复制导致的 V8 OOM 崩溃

**Architecture:** 截断大结果 + 去重冗余存储 + localStorage 降级保护，从数据源头控制内存占用

**Tech Stack:** React 18 + TypeScript + Zustand

---

### Task 1: 截断工具函数

**Files:**
- Create: `context-lab/src/utils/truncator.ts`

- [ ] **Step 1: 创建截断工具函数**

```typescript
export const MAX_TOOL_RESULT_SIZE = 4096;
export const MAX_DISPLAY_RESULT_SIZE = 2048;

export function truncateResult(text: string, maxSize: number): string {
  if (!text || text.length <= maxSize) return text;
  const half = Math.floor(maxSize / 2) - 20;
  return text.slice(0, half) + `\n...[truncated, ${text.length} chars total]` + text.slice(-half);
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/utils/truncator.ts && git commit -m "feat(RQ-025/T1): add truncateResult utility"
```

---

### Task 2: agentService 截断工具结果

**Files:**
- Modify: `context-lab/src/services/agentService.ts:516-534`

- [ ] **Step 1: 在 agentService.ts 顶部添加 import**

在现有 import 区域添加：

```typescript
import { truncateResult, MAX_TOOL_RESULT_SIZE } from '../utils/truncator';
```

- [ ] **Step 2: 截断写入 conversationHistory 的工具结果**

将 `agentService.ts` 第 518-522 行：

```typescript
toolResults.push({
  type: 'tool_result',
  tool_use_id: contentItem.id,
  content: toolResult
});
```

改为：

```typescript
toolResults.push({
  type: 'tool_result',
  tool_use_id: contentItem.id,
  content: typeof toolResult === 'string'
    ? truncateResult(toolResult, MAX_TOOL_RESULT_SIZE)
    : truncateResult(JSON.stringify(toolResult), MAX_TOOL_RESULT_SIZE)
});
```

- [ ] **Step 3: 截断 reorganizedContext 并传递截断后的 result 给回调**

将第 529 行：

```typescript
const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n工具结果:\n${JSON.stringify(toolResult, null, 2)}`;
```

改为：

```typescript
const reorganizedContext = `系统提示词:\n${systemPrompt || ''}\n\n工具结果:\n${truncateResult(JSON.stringify(toolResult, null, 2), MAX_TOOL_RESULT_SIZE)}`;
```

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add src/services/agentService.ts && git commit -m "feat(RQ-025/T2): truncate tool results in conversationHistory"
```

---

### Task 3: apiInteractions 截断 responseBody

**Files:**
- Modify: `context-lab/src/stores/appStore.ts:535-539`

- [ ] **Step 1: 在 appStore.ts 顶部添加 import**

```typescript
import { truncateResult, MAX_TOOL_RESULT_SIZE } from '../utils/truncator';
```

- [ ] **Step 2: 截断 addApiResponse 中的 body**

将第 535-539 行：

```typescript
addApiResponse: (id, status, headers, body, duration) => set(state => ({
  apiInteractions: state.apiInteractions.map(inter =>
    inter.id === id ? { ...inter, response: { status, headers, body, duration } } : inter
  )
})),
```

改为：

```typescript
addApiResponse: (id, status, headers, body, duration) => set(state => ({
  apiInteractions: state.apiInteractions.map(inter =>
    inter.id === id ? { ...inter, response: { status, headers, body: truncateResult(body, MAX_TOOL_RESULT_SIZE), duration } } : inter
  )
})),
```

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-025/T3): truncate apiInteractions responseBody"
```

---

### Task 4: timelineSteps 截断 + 移除 reorganizedContext

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx:190-209`
- Modify: `context-lab/src/types/index.ts:30-44` (ToolCallDetails 接口)

- [ ] **Step 1: 在 ChatInteraction.tsx 顶部添加 import**

```typescript
import { truncateResult, MAX_DISPLAY_RESULT_SIZE } from '../utils/truncator';
```

- [ ] **Step 2: 移除 ToolCallDetails 的 reorganizedContext 字段**

在 `types/index.ts` 中找到 `ToolCallDetails` 接口，删除 `reorganizedContext` 字段。

- [ ] **Step 3: 截断 timelineSteps 中的 result，移除 reorganizedContext 传参**

将 `ChatInteraction.tsx` 第 190-209 行的 `onToolResultReady` 回调改为：

```typescript
onToolResultReady: (toolName, result) => {
  const state = useAppStore.getState();
  const toolStep = [...state.timelineSteps].reverse().find(s => s.type === 'tool-call' && s.toolCallName === toolName && s.active);
  const truncatedResult = typeof result === 'string'
    ? truncateResult(result, MAX_DISPLAY_RESULT_SIZE)
    : truncateResult(JSON.stringify(result), MAX_DISPLAY_RESULT_SIZE);
  const resultSummary = truncatedResult.slice(0, 200);
  if (toolStep) {
    updateTimelineStepData(toolStep.id, {
      details: {
        type: 'tool-call',
        toolName,
        toolDescription: (toolStep.details as any)?.toolDescription || '',
        parameters: (toolStep.details as any)?.parameters || {},
        reasoning: (toolStep.details as any)?.reasoning || '',
        result: truncatedResult,
        resultSummary,
      },
    });
    completeTimelineStep(toolStep.id);
  }
},
```

- [ ] **Step 4: 更新 agentService.ts 回调调用，移除 reorganizedContext 参数**

将第 532-534 行：

```typescript
if (this.timelineCallbacks) {
  this.timelineCallbacks.onToolResultReady(toolName, toolResult, reorganizedContext);
}
```

改为：

```typescript
if (this.timelineCallbacks) {
  this.timelineCallbacks.onToolResultReady(toolName, toolResult);
}
```

- [ ] **Step 5: 搜索并清理所有 reorganizedContext 引用**

搜索代码库中所有 `reorganizedContext` 引用，包括 `agentService.ts` 中的 `recordToolInteraction` 调用和 `ToolCallSection` 组件中的渲染，移除或替换为从 `result` 中提取。

- [ ] **Step 6: Commit**

```bash
cd context-lab && git add -A && git commit -m "feat(RQ-025/T4): truncate timelineSteps result, remove reorganizedContext"
```

---

### Task 5: 精简 strategyEffect.removedMessages

**Files:**
- Modify: `context-lab/src/types/index.ts:48-62` (StrategyEffect 接口)
- Modify: `context-lab/src/services/agentService.ts:699,730,779,800` (removedMessages 赋值处)
- Modify: `context-lab/src/types/index.ts:50-67` (StrategyEffectStepDetails 接口)

- [ ] **Step 1: 修改 StrategyEffect 接口的 removedMessages 类型**

将 `types/index.ts` 第 53 行：

```typescript
removedMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
```

改为：

```typescript
removedMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
```

（类型不变，但在赋值处截断 content）

- [ ] **Step 2: 在 agentService.ts 的 extractMessageText 方法中添加截断**

找到 `extractMessageText` 方法，在其返回值处截断为最多 100 字符。如果方法不存在，在 removedMessages 赋值处对 content 做截断：

```typescript
content: this.extractMessageText(m).slice(0, 100) + (this.extractMessageText(m).length > 100 ? '...' : '')
```

对第 699、730、779、800 行的 removedMessages 赋值都应用此截断。

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add -A && git commit -m "feat(RQ-025/T5): truncate removedMessages content to 100 chars"
```

---

### Task 6: localStorage 保护

**Files:**
- Modify: `context-lab/src/stores/appStore.ts:468-486` (saveCurrentSession)
- Modify: `context-lab/src/services/sessionService.ts:23-27` (save 方法)

- [ ] **Step 1: saveCurrentSession 中替换 base64 图片为占位符 + try-catch**

将 `appStore.ts` 第 468-486 行的 `saveCurrentSession` 改为：

```typescript
saveCurrentSession: () => {
  const state = get();
  if (!state.currentSessionId) return;
  try {
    const messages = state.conversationHistory.map(m => ({
      role: m.role,
      content: m.content,
      files: m.files?.map(f =>
        f.content && f.content.startsWith('data:')
          ? { ...f, content: undefined, type: 'image_ref' as const }
          : f
      ),
      isFileOnly: m.isFileOnly,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    }));
    sessionService.update(state.currentSessionId, {
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
      messages,
    });
  } catch (e) {
    console.error('Failed to save session, saving metadata only:', e);
    sessionService.update(state.currentSessionId, {
      sceneId: state.currentScene,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextStrategy: state.contextStrategy,
      contextSize: state.contextSize,
      messages: [],
    });
  }
  set({ sessions: sessionService.getAll() });
},
```

- [ ] **Step 2: sessionService.save 添加 try-catch**

将 `sessionService.ts` 第 23-27 行的 `save` 方法改为：

```typescript
save(session: Session): void {
  const sessions = this.getAll().filter(s => s.id !== session.id);
  sessions.unshift(session);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('localStorage save failed, attempting metadata-only save:', e);
    const lite = sessions.map(s => ({ ...s, messages: [] }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lite));
    } catch {
      console.error('localStorage metadata-only save also failed, giving up');
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts src/services/sessionService.ts && git commit -m "feat(RQ-025/T6): add localStorage protection with try-catch and base64 placeholder"
```

---

### Task 7: 构建验证 + 清理

**Files:**
- All modified files

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd context-lab && npm run typecheck
```

Expected: 0 errors

- [ ] **Step 2: 生产构建**

```bash
cd context-lab && npm run build
```

Expected: 构建成功

- [ ] **Step 3: 修复类型错误（如有）**

根据 typecheck/build 输出修复问题。

- [ ] **Step 4: Commit 修复**

```bash
cd context-lab && git add -A && git commit -m "fix(RQ-025/T7): fix type errors"
```

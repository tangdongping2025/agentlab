# RQ-026 工具调用超时机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复工具调用超时后的循环膨胀问题，添加用户可中断机制和超时状态可视化。

**Architecture:** 将 AbortController 从局部变量提升为 AgentService 实例属性，UI 通过 `agentService.abort()` 中断整个请求生命周期；工具超时后 `tool_result` 标记 `is_error: true` 阻止 Claude 重试；API 超时从 120s 缩短到 30s 并优雅降级。

**Tech Stack:** React 18 + TypeScript + fetch API (AbortController)

---

### Task 1: agentService — 添加 abort 基础设施 + 修改 executeTool

**Files:**
- Modify: `context-lab/src/services/agentService.ts:46-205`

- [ ] **Step 1: 添加实例属性和 abort 方法**

在 `AgentService` 类中，`_lastStrategyEffect` 之后（第 56 行后），添加：

```typescript
private _lastStrategyEffect: StrategyEffect | null = null;
private _summaryCache: Map<string, string> = new Map();
private abortController: AbortController | null = null;
private aborted = false;

abort(): void {
  this.aborted = true;
  this.abortController?.abort();
}
```

- [ ] **Step 2: 修改 API_TIMEOUT 常量**

第 155 行，将 `API_TIMEOUT` 从 120s 改为 30s：

```typescript
private static readonly TOOL_TIMEOUT = 15_000;
private static readonly API_TIMEOUT = 30_000;
```

- [ ] **Step 3: 修改 executeTool 签名和实现**

将 `executeTool` 方法（第 158-205 行）改为接收外部 `signal` 参数，移除内部的独立 `AbortController`：

```typescript
private async executeTool(toolName: string, params: any, signal?: AbortSignal): Promise<string> {
  console.log(`Executing tool: ${toolName} with params:`, params);

  const endpointMap: Record<string, string> = {
    'xueqiu-search': 'search_stock',
    'xueqiu-quote': 'get_stock',
    'xueqiu-market': 'get_market_index',
  };

  const endpoint = endpointMap[toolName];
  if (!endpoint) {
    return JSON.stringify({ error: 'Unknown tool', tool: toolName });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AgentService.TOOL_TIMEOUT);

    // 如果外部 signal 已 abort，直接返回
    if (signal?.aborted) {
      clearTimeout(timer);
      return JSON.stringify({ error: '搜索请求已取消' });
    }

    // 外部 signal abort 时也中止内部请求
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });

    const response = await fetch(`/api/xueqiu/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);

    const data = await response.json();

    if (!response.ok || data.error) {
      return JSON.stringify({ error: data.error || `HTTP ${response.status}` });
    }

    if (data.content && Array.isArray(data.content)) {
      const texts = data.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text);
      return texts.join('\n');
    }

    return JSON.stringify(data);
  } catch (err: any) {
    console.error(`Tool execution error: ${toolName}`, err);
    if (err.name === 'AbortError') {
      if (this.aborted) {
        return JSON.stringify({ error: '搜索请求已取消' });
      }
      return JSON.stringify({ error: '搜索请求超时，请稍后重试' });
    }
    return JSON.stringify({ error: '搜索服务暂时不可用，请稍后重试' });
  }
}
```

- [ ] **Step 4: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
cd context-lab
git add src/services/agentService.ts
git commit -m "feat(RQ-026/T1): add abort infrastructure and modify executeTool"
```

---

### Task 2: agentService — 重写 sendMessage 循环使用实例级 AbortController

**Files:**
- Modify: `context-lab/src/services/agentService.ts:270-604`

- [ ] **Step 1: 在 sendMessage 开头初始化 AbortController**

在第 281 行 `try {` 之后、`// 处理空文本但有文件的情况` 之前，添加：

```typescript
this.abortController = new AbortController();
this.aborted = false;
```

- [ ] **Step 2: while 循环开头添加 abort 检查**

第 372 行 `while (shouldContinue && loopCount < maxLoops) {` 之后添加：

```typescript
if (this.aborted) break;
```

- [ ] **Step 3: API fetch 改用实例级 AbortController**

替换第 455-468 行的 API 请求代码：

```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.apiKey}`,
    'x-api-key': this.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: requestBody,
  signal: this.abortController!.signal,
});
```

移除 `apiController`、`apiTimer`、`clearTimeout(apiTimer)` 三行。

- [ ] **Step 4: executeTool 调用传入 signal**

第 529 行，将：

```typescript
const toolResult = await this.executeTool(toolName, toolParams);
```

改为：

```typescript
const toolResult = await this.executeTool(toolName, toolParams, this.abortController?.signal);
```

- [ ] **Step 5: tool_result 添加 is_error 标记**

替换第 531-537 行：

```typescript
const isError = typeof toolResult === 'string' && toolResult.includes('"error"');
toolResults.push({
  type: 'tool_result',
  tool_use_id: contentItem.id,
  content: typeof toolResult === 'string'
    ? truncateResult(toolResult, MAX_TOOL_RESULT_SIZE)
    : truncateResult(JSON.stringify(toolResult), MAX_TOOL_RESULT_SIZE),
  is_error: isError
});
```

- [ ] **Step 6: 重写 catch 块实现优雅降级**

替换第 597-603 行的 catch 块：

```typescript
} catch (error) {
  if (this.aborted) {
    return '已取消';
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '请求超时，请稍后重试';
  }
  console.error('Error sending message to Anthropic API:', error);
  if (error instanceof TypeError && error.message.includes('fetch')) {
    throw new Error('Network error: Could not connect to Anthropic API. Please check your internet connection.');
  }
  throw new Error(`Failed to send message: ${(error as Error).message}`);
} finally {
  this.abortController = null;
  this.aborted = false;
}
```

注意：原来 try 块的 `return finalResponse;` 保持不变。finally 块在 return 之后执行，负责清理状态。

- [ ] **Step 7: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 8: Commit**

```bash
cd context-lab
git add src/services/agentService.ts
git commit -m "feat(RQ-026/T2): rewrite sendMessage with instance-level AbortController and is_error"
```

---

### Task 3: ChatInteraction — 停止按钮 + 错误状态可视化

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx:65-301, 484-500`

- [ ] **Step 1: 添加 handleStop 函数**

在 `handleSendWithInput` 函数之后（第 302 行后），添加：

```typescript
const handleStop = () => {
  agentService.abort();
};
```

- [ ] **Step 2: 修改 catch 块区分取消和超时**

替换第 295-298 行的 catch 块：

```typescript
} catch (error) {
  const errMsg = (error as Error).message || String(error);
  addMessage('assistant', `抱歉，处理您的请求时出现错误: ${errMsg}`);
}
```

保持不变——因为 `sendMessage` 现在对 AbortError 不再 throw，而是 return 字符串（'已取消' 或 '请求超时，请稍后重试'），这些会作为正常的 `agentResponse` 被 `addMessage('assistant', agentResponse)` 添加到聊天区。catch 块只需处理其他意外错误。

- [ ] **Step 3: 修改 onToolResultReady 回调，标记工具失败状态**

替换第 191-211 行的 `onToolResultReady` 回调：

```typescript
onToolResultReady: (toolName, result) => {
  const state = useAppStore.getState();
  const toolStep = [...state.timelineSteps].reverse().find(s => s.type === 'tool-call' && s.toolCallName === toolName && s.active);
  const truncatedResult = typeof result === 'string'
    ? truncateResult(result, MAX_DISPLAY_RESULT_SIZE)
    : truncateResult(JSON.stringify(result), MAX_DISPLAY_RESULT_SIZE);
  const resultSummary = truncatedResult.slice(0, 200);
  const isToolError = typeof result === 'string' && result.includes('"error"');
  if (toolStep) {
    updateTimelineStepData(toolStep.id, {
      icon: isToolError ? '⏱' : '🔧',
      description: isToolError ? `${toolName} — 请求超时` : `调用 ${toolName}`,
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

- [ ] **Step 4: 替换发送按钮为停止按钮**

替换第 484-500 行的发送按钮代码：

```typescript
<button
  onClick={isLoading ? handleStop : handleSend}
  disabled={!isLoading && (!isSendButtonEnabled || isLoading)}
  style={{
    position: 'absolute', right: '6px', bottom: '6px',
    width: '34px', height: '34px',
    background: isLoading
      ? '#e53e3e'
      : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
    border: 'none', borderRadius: '8px', color: 'white',
    cursor: isLoading ? 'pointer' : (!isSendButtonEnabled ? 'not-allowed' : 'pointer'),
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s',
  }}
>
  {isLoading ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )}
</button>
```

- [ ] **Step 5: 运行 typecheck 验证**

Run: `cd context-lab && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
cd context-lab
git add src/components/ChatInteraction.tsx
git commit -m "feat(RQ-026/T3): add stop button and tool error visualization"
```

---

### Task 4: 构建验证

**Files:**
- All modified files

- [ ] **Step 1: 运行生产构建**

Run: `cd context-lab && npm run build`
Expected: 构建成功，无错误

- [ ] **Step 2: 启动 dev server 手动验证**

Run: `cd context-lab && npm run dev`

验证关键路径：
1. 正常发送消息 → 收到响应（回归验证）
2. 发送需要工具调用的消息 → 工具执行中 timeline 显示 🔧 → 结果返回后 timeline 完成
3. 发送消息后点击停止按钮 → 消息区显示"已取消"
4. 工具超时 → timeline 显示 ⏱ + "请求超时" → 不再循环重试

- [ ] **Step 3: Commit（如有构建修复）**

```bash
cd context-lab
git add -A
git commit -m "fix(RQ-026/T4): fix build issues"
```

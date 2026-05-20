# RQ-026 工具调用超时机制

## 需求编号

RQ-026

## 需求名称

工具调用超时机制

## 问题描述

工具调用缺少有效的超时和中断机制，导致两个问题：
1. 工具超时后返回的错误结果被当作正常 `tool_result`，Claude 可能再次发起工具调用，循环膨胀导致内存溢出
2. 用户无法取消正在进行的请求，只能等或刷新页面

## 现状分析

| 超时类型 | 当前值 | 机制 | 问题 |
|---------|-------|------|------|
| 工具执行 | 15s | 局部 `AbortController` | 超时后返回的错误 `tool_result` 未标记 `is_error`，Claude 可能重试 |
| API 调用 | 120s | 局部 `AbortController` | 超时后 `AbortError` 被当作普通异常抛出，整个流程崩溃 |
| 全局循环 | 5 轮 | `maxLoops = 5` | 无时间限制，5 轮 × 工具超时 + API 调用可能持续数分钟 |

## 设计方案

### 一、超时行为修正

#### 1.1 工具超时：标记 `is_error`

工具执行超时或返回错误时，`tool_result` 设置 `is_error: true`。Claude API 规范中，`is_error: true` 表示工具执行失败，模型不会再尝试调用该工具。

```typescript
// agentService.ts - tool_result 构建
const isError = toolResult.includes('"error"');
toolResults.push({
  type: 'tool_result',
  tool_use_id: contentItem.id,
  content: truncateResult(toolResult, MAX_TOOL_RESULT_SIZE),
  is_error: isError
});
```

#### 1.2 API 超时：缩短 + 优雅降级

- `API_TIMEOUT` 从 120s 改为 30s
- `AbortError` 不再作为异常抛出，而是优雅返回超时提示

```typescript
// agentService.ts - catch 块
catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    if (this.aborted) {
      return '已取消';
    }
    return '请求超时，请稍后重试';
  }
  throw error;
}
```

### 二、实例级 AbortController + 停止按钮

#### 2.1 AgentService 改造

```typescript
class AgentService {
  private abortController: AbortController | null = null;
  private aborted = false;

  abort(): void {
    this.aborted = true;
    this.abortController?.abort();
  }

  async sendMessage(...) {
    this.abortController = new AbortController();
    this.aborted = false;
    try {
      while (shouldContinue && loopCount < maxLoops) {
        if (this.aborted) break;
        // fetch 使用 this.abortController.signal
        ...
      }
    } catch (error) {
      if (this.aborted) return '已取消';
      ...
    } finally {
      this.abortController = null;
      this.aborted = false;
    }
  }
}
```

- 所有 `fetch` 调用（API 请求 + 工具执行）共用 `this.abortController.signal`
- 工具执行的 `executeTool` 方法接收外部 signal 参数，不再内部创建独立的 `AbortController`
- while 循环每轮开头检查 `this.aborted`，确保循环也能被中断

#### 2.2 UI 停止按钮

- 发送中（`isLoading === true`）：发送按钮变为停止按钮（红色 ⏹ 图标）
- 点击停止按钮 → `agentService.abort()` → 循环中断 → `finally` 中 `setIsLoading(false)`
- 聊天区显示"已取消"消息

### 三、超时状态可视化

| 状态 | 显示 | 位置 |
|------|------|------|
| 工具执行中 | 🔍 搜索中... | timeline step |
| 工具超时 | ⏱ 请求超时（红色标记） | timeline step |
| API 超时 | "请求超时，请稍后重试" | 聊天消息区 |
| 用户取消 | "已取消" | 聊天消息区 |

实现方式：
- `onToolResultReady` 回调中，若 `toolResult` 包含错误，`completeTimelineStep` 传入失败状态
- `ChatInteraction` 的 `catch` 块区分 `AbortError`（用户取消）和其他错误，显示不同文案
- 停止按钮样式：红色背景 + ⏹ 图标，hover 加深

## 设计理念合规检查

| 原则 | 合规 | 说明 |
|------|------|------|
| 极简 | ✅ | 停止按钮替换发送按钮，无额外 UI 元素 |
| 专注 | ✅ | 一次一个主任务，停止按钮只在执行中显示 |
| 直觉 | ✅ | 停止按钮自解释，超时提示清晰 |
| 一致性 | ✅ | 沿用现有 timeline step 模式 |
| 工匠精神 | ✅ | 错误状态完整，无残留 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `context-lab/src/services/agentService.ts` | 实例级 AbortController、is_error 标记、API 超时缩短、优雅降级 |
| `context-lab/src/components/ChatInteraction.tsx` | 停止按钮、错误状态显示、abort 调用 |

## 不在范围内

- 超时时长用户可配置（YAGNI）
- 全局循环总时间限制（5 轮 × 30s API 已自然限制）
- 重试机制（超时后不自动重试，用户可手动重发）

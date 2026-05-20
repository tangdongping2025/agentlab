# RQ-025 优化联网搜索功能，解决内存溢出的问题

## 问题

浏览器 V8 引擎 OOM 崩溃：`ASSERTION FAILED: MemoryExhaustion: Crash intentionally because memory is exhausted.`

根因：工具调用结果被三重复制存储且无大小限制，多轮对话后内存耗尽。

## 当前数据流问题

同一份工具结果同时存储在：
1. `conversationHistory` — 发给 Claude API 的上下文
2. `apiInteractions[].responseBody` — API 交互记录
3. `timelineSteps[].details.result` — UI 展示

加上 `timelineSteps[].details.reorganizedContext` 与 `result` 高度重复，`strategyEffect.removedMessages` 存完整消息副本，一轮工具调用 = 原始响应 × 4+ 份副本。

## 设计

### 一、截断策略

新增常量（定义在 `agentService.ts` 顶部）：

| 常量 | 值 | 用途 |
|------|-----|------|
| `MAX_TOOL_RESULT_SIZE` | 4096 | conversationHistory / apiInteractions 截断阈值 |
| `MAX_DISPLAY_RESULT_SIZE` | 2048 | timelineSteps 展示截断阈值 |

| 存储位置 | 截断规则 |
|----------|---------|
| `conversationHistory` 中的 `tool_result` | 超过 4096 字符截断 |
| `apiInteractions[].responseBody` | 超过 4096 字符截断 |
| `timelineSteps[].details.result` | 超过 2048 字符截断 |

截断格式：保留首尾各一半，中间插入 `\n...[truncated, N chars total]`。Claude API 仍能看到结果的核心信息，不影响对话质量。

### 二、去重

- **移除 `timelineSteps[].details.reorganizedContext`**：与 `result` 高度重复，UI 展示时按需从 `result` 中提取
- **`strategyEffect.removedMessages` 改为轻量**：只存消息 ID 列表 + 每条消息截断摘要（最多 100 字符），不存完整消息副本

### 三、localStorage 保护

`sessionService.save()` 当前问题：
1. 大量 base64 图片 + 工具结果拼成巨字符串，序列化时 V8 OOM
2. localStorage 5MB 上限，无 try-catch 保护

改动：
- `saveCurrentSession()` 加 try-catch，失败时降级为只存元数据（会话列表、配置），跳过 `conversationHistory` 和 `apiInteractions`
- `Message.files[].content`（base64 图片）序列化前替换为 `{ type: 'image_ref', name: file.name }` 占位符，不写二进制数据
- 图片恢复时 UI 提示"图片需重新上传"

### 四、截断工具函数

新增 `truncateResult(text: string, maxSize: number): string`，放 `context-lab/src/utils/`：

```typescript
function truncateResult(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text;
  const half = Math.floor(maxSize / 2) - 20;
  return text.slice(0, half) + `\n...[truncated, ${text.length} chars total]` + text.slice(-half);
}
```

调用点：
- `agentService.ts`：写入 `conversationHistory` / `apiInteractions` 前
- `ChatInteraction.tsx`：写入 `timelineSteps` 前

## 设计理念合规检查

| 原则 | 合规 |
|------|------|
| 极简 | 截断后保留核心信息，UI 不增加复杂控件 |
| 专注 | 单一目标：解决 OOM，不引入新功能 |
| 直觉 | 截断标记自解释，图片占位提示清晰 |
| 一致性 | 截断函数统一处理，阈值集中定义 |
| 工匠精神 | 降级保护确保不白屏，base64 不再污染存储 |

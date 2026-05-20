# RQ-027 对话打字机效果（流式输出）+ 工具调用内存溢出修复

## 需求编号

RQ-027

## 需求名称

对话打字机效果（流式输出）+ 工具调用内存溢出修复

## 问题描述

两个问题合并解决：

1. **无流式反馈**：API 调用使用非流式模式，用户发送消息后需等待完整响应返回才能看到内容，长时间无反馈
2. **工具调用内存溢出**：调用工具时 xueqiu-proxy 产生大量 Node 子进程占内存，conversationHistory / store 数据无限膨胀导致浏览器和服务端整体卡死

## 现状分析

| 方面 | 当前 | 目标 |
|------|------|------|
| API 调用 | `stream: false`，等完整 JSON 返回 | `stream: true`，SSE 逐事件解析 |
| 文本显示 | 一次性出现全部内容 | 逐 token 增量输出（打字机效果） |
| 工具调用 | 同步循环，每轮等完整响应 | 流式中检测 `tool_use`，执行后发起下一轮流式 |
| 停止机制 | RQ-026 已实现，中断非流式 fetch | 适配流式，中断 SSE 读取，已输出 token 保留 |
| 工具失败 | 直接中断循环，不告诉大模型 | 发回大模型处理，连续失败安全阀保护 |
| xueqiu-proxy | `spawn('npx', ..., { shell: true })`，产生进程链 | `spawn('node', [entry])`，单进程，kill 干净 |
| conversationHistory | 只增不减，每条体积无限制 | 截断 tool_result / tool_use input，控制单条体积 |
| store 数据 | apiInteractions 存完整 request body | 截断 request body 到 4KB |
| recordToolInteraction | 序列化完整 conversationHistory | 只保留最近 2 轮摘要 |

## 设计方案

### 一、xueqiu-proxy 进程管理修复

**问题**：`spawn('npx', ['xueqiu-mcp'], { shell: true })` 在 Windows 上产生 cmd.exe → npx → node.exe 进程链（至少 3 个进程），且 `kill()` 无法完全清理子进程树。5 分钟空闲清理后再请求时重新 spawn，反复累积残留进程。

**修复**：

1. **用 node 直接执行入口**：通过 `require.resolve('xueqiu-mcp')` 找到包的实际入口 JS 文件，用 `spawn('node', [entryPath])` 替代 `spawn('npx', ['xueqiu-mcp'])`
2. **去掉 `shell: true`**：避免 cmd.exe 中间层
3. **进程树管理**：
   - spawn 时 `detached: false`（Windows 上防止产生独立进程组）
   - 支持 `process.kill(-proc.pid)` 的平台用进程组 kill，否则用 `proc.kill()`
4. **spawn 防抖**：已有 spawning promise 时复用，不重复 spawn
5. **清理增强**：dev server 关闭时强制 kill + 短暂等待退出

**效果**：每次只产生 1 个 node 进程，退出时无残留，内存占用从数百 MB 降至数十 MB。

### 二、工具失败策略 + 连续失败安全阀

**问题**：当前工具失败时 `hasToolError` 为 true 直接退出循环返回"工具调用失败"，不给大模型处理机会。但同时没有重试保护，理论上大模型可能反复调用同一失败工具。

**设计**：

1. **移除 hasToolError 提前退出**：所有 tool_result（含 `is_error: true`）正常推入 conversationHistory，让大模型自行决定下一步（重试、换工具、或直接回复用户）
2. **连续失败安全阀**：维护 `consecutiveFailures: Map<string, number>`
   - 同一工具名连续失败 ≤1 次 → 正常发回大模型
   - 同一工具名连续失败 2 次 → 拼入提示文本"工具 {name} 连续调用失败"，退出循环返回用户
   - 工具调用成功时重置该工具的计数
3. **maxLoops=5 硬上限不变**：作为最终兜底

### 三、conversationHistory 内存控制

**问题**：多轮工具调用时 conversationHistory 体积暴增——每轮 push 完整 assistant content + tool_result content，且全部发给 API。store 中 apiInteractions 和 recordToolInteraction 也积累大量数据。

**设计**：

1. **tool_result content 截断收紧**：`MAX_TOOL_RESULT_SIZE` 从 4096 收紧到 2048 字符
2. **assistant content 中 tool_use input 截断**：发送给 API 前，tool_use 的 input JSON.stringify 后超过 1KB 的截断保留前 512 字符 + 后 512 字符
3. **recordToolInteraction callContext 瘦身**：不再序列化完整 conversationHistory，只保留最近 2 轮对话内容
4. **apiInteractions request body 截断**：`addApiRequest` 时 request body 截断到 4KB（含完整 messages 的大请求体只保留截断版本）

**不限制**：conversationHistory 条目数量（maxLoops=5 天然控制最多约 10 条消息）。

### 四、流式 API 改造 — sendMessage 核心逻辑

**请求改动**：请求体加 `"stream": true`。

**SSE 事件处理**：

| SSE 事件类型 | 处理 |
|---|---|
| `message_start` | 记录 message id、model 信息 |
| `content_block_start` | 判断 block 类型：`text` / `tool_use`，初始化累积缓冲 |
| `content_block_delta` | text block → `onStreamToken(delta.text)` 实时输出；tool_use block → 累积 `delta.partial_json` |
| `content_block_stop` | tool_use block 完成时 → 解析完整参数，执行工具 |
| `message_delta` | 记录 stop_reason、usage |
| `message_stop` | 本轮结束，若已执行工具 → 发起下一轮流式请求 |

**流式读取**：用 `response.body!.getReader()` 逐块读取，按 `\n\n` 分割 SSE 事件，逐行解析 `data: {...}` JSON。

**tool_use 流式处理**：
- 流式中 `tool_use` 的参数是分片到达的（`partial_json`），需累积到 `content_block_stop` 才能解析完整参数
- `content_block_stop` 触发时：解析完整工具参数 → 执行工具 → 构建 `tool_result` → 发起下一轮流式请求
- 每轮流式请求的 `messages` 数组包含上一轮的 assistant 消息（含 tool_use blocks）和 user 消息（含 tool_result blocks）

### 五、回调事件丰富化

**新增流式回调**：

| 回调 | 触发时机 | 用途 |
|---|---|---|
| `onStreamToken(text)` | 每收到一个 `content_block_delta`（text 类型） | 增量追加到聊天气泡 |
| `onStreamEnd()` | 整个流式循环结束 | 标记输出完成 |

**现有回调时间点微调**：
- `onToolCallDetected` — 在 `content_block_stop`（tool_use block 完成、参数完整）时触发
- `onToolResultReady` — 工具执行完后触发，不变
- `onAgentResponse` — 在 `onStreamEnd` 之后触发，tokenUsage 从最后一个 `message_delta` 事件获取

**TimelineCallbacks 接口新增**：

```typescript
interface TimelineCallbacks {
  // ... 现有回调不变
  onStreamToken: (text: string) => void;
  onStreamEnd: () => void;
}
```

### 六、Store 增量更新

**新增 action**：`updateStreamingMessage(text: string)`

- 流式开始时：`addMessage('assistant', '')` 创建空助手消息
- 每收到 token：`updateStreamingMessage(deltaText)` 增量追加文本
- 流式结束：`onStreamEnd` 标记消息为最终状态

**实现方式**：store 中维护 `streamingMessageId`，`updateStreamingMessage` 根据 ID 找到当前消息并追加文本。

### 七、停止按钮 + 流式中断

**基于 RQ-026 已有机制适配**：

- 中断 SSE 读取 = `abortController.abort()` → `getReader().cancel()` → 流中断
- 已输出的 token 已通过 `onStreamToken` 写入 store，中断后自然保留
- 中断时手动调用 `onStreamEnd()` 通知 UI 流式结束
- catch 块中 `this.aborted` 为 true → 返回已流式输出的文本
- finally 块重置 `abortController` / `aborted`，与 RQ-026 一致

**UI 行为**：
- 流式中：发送按钮显示红色 ⏹ 停止按钮
- 点击停止：流式中断，已输出文字保留，聊天气泡标记为最终状态
- 停止后发送按钮恢复为发送箭头

### 八、API 超时调整

流式连接是长连接，SSE 会持续推送事件。30 秒超时（RQ-026 设定）对非流式请求合理，但流式场景下模型可能思考数秒后才开始输出。

**调整**：流式模式下 `API_TIMEOUT` 改为 60 秒（`STREAM_TIMEOUT`）。超时仅针对首个事件到达前的等待，一旦开始收到事件则不再受此限制。

## 设计理念合规检查

| 原则 | 合规 | 说明 |
|------|------|------|
| 极简 | ✅ | 打字机效果是渐进展示，无额外 UI 元素；内存修复是内部优化 |
| 专注 | ✅ | 流式输出聚焦核心体验提升；内存修复聚焦稳定性 |
| 直觉 | ✅ | 逐字输出符合用户对 AI 对话的预期；工具失败让大模型自然处理 |
| 一致性 | ✅ | 沿用现有回调 + store 模式；截断策略与 RQ-025 一脉相承 |
| 工匠精神 | ✅ | 进程管理干净无残留；安全阀防止边缘情况；截断有章法 |

## 涉及文件

| 文件 | 改动 |
|------|------|
| `context-lab/src/services/agentService.ts` | sendMessage 改为流式、新增流式回调、SSE 解析、工具失败策略、内存截断 |
| `context-lab/src/stores/appStore.ts` | 新增 `updateStreamingMessage` action、`streamingMessageId` 状态、request body 截断 |
| `context-lab/src/components/ChatInteraction.tsx` | 连接流式回调、消息增量显示 |
| `context-lab/server/xueqiu-proxy.ts` | 进程管理修复：直接 node 执行、去 shell、进程树 kill |
| `context-lab/src/utils/truncator.ts` | MAX_TOOL_RESULT_SIZE 收紧到 2048 |

## 不在范围内

- Markdown 渐进渲染（未闭合代码块等复杂场景，投入产出比低）
- 流式输出中代码块/表格的实时渲染优化
- web_search server tool（ARK 代理不支持）
- 前端 store 中 timelineSteps / apiInteractions 的总量限制（当前条目数受 maxLoops 天然控制）

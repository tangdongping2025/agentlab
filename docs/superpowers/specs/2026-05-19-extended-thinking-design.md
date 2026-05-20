# RQ-029 增加深度思考能力 — 规格设计

## 需求概述

在对话过程中集成 Claude Extended Thinking 功能，用户可开关深度思考，开启后模型在回答前先进行内部推理，思考过程在 Timeline 和对话气泡中双重展示。

## 现状

- `ClaudeRequest` 接口无 `thinking` 字段
- `anthropic-version` header 为 `2023-06-01`（extended thinking 需 `2024-10-22`）
- `temperature` 硬编码 `0.7`（thinking 开启时必须为 `1`）
- 响应解析不识别 `thinking` 类型 content_block
- 无 thinking 相关 UI 控制或展示

## 目标架构

```
用户开启深度思考 → 发送消息
  → agentService.sendMessage()
    → 请求体加 thinking: { type: "enabled", budget_tokens: N }
    → temperature=1, anthropic-version=2024-10-22
  ← 响应含 thinking + text content blocks
  → thinking 文本传入 Timeline 步骤 + 写入 Message
  ← UI 展示
```

## 功能设计

### 1. 开关控制

- `thinkingEnabled: boolean` 状态，默认 `false`
- `thinkingBudget: number` 状态，默认 `10000`（三档：5000/10000/20000）
- UI：在输入区工具栏（ToolSelectorBar 旁）加 💡 深度思考按钮
  - 点击切换开关
  - 长按或右键展开预算选择（低/中/高）
- 状态持久化到 localStorage

### 2. API 请求变更

当 `thinkingEnabled` 为 `true`：

```typescript
request.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
request.temperature = 1;  // API 强制要求
```

header 升级：`anthropic-version: 2024-10-22`

约束：thinking 开启时强制非流式（API 限制：extended thinking 不支持 stream），无论是否有工具。

### 3. 响应解析

非流式响应中识别 `thinking` 类型 content_block：

```typescript
if (block.type === 'thinking') {
  thinkingText = block.thinking || '';
}
```

### 4. Timeline 展示

新增 `💭 深度思考` 步骤：

- 在 API 响应后、智能体回复前插入
- 图标：💭
- 描述：`思考中... (N tokens)` 或 `深度思考完成 · N tokens`
- 可展开查看 thinking 全文
- 新增 `ThinkingStepDetails` 类型

### 5. 对话气泡展示

在助手消息气泡内，正文上方显示可折叠的思考内容区：

- 默认折叠，显示 `💭 深度思考 · N 字 · 点击展开`
- 点击展开显示 thinking 全文（Markdown 渲染）
- 折叠/展开状态仅 UI 局部，不持久化

### 6. Message 类型扩展

```typescript
interface Message {
  // ...existing fields
  thinkingContent?: string;  // thinking block 文本
  thinkingTokens?: number;   // thinking 消耗的 token 数
}
```

## 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/agentService.ts` | 修改 | ClaudeRequest 加 thinking、请求构造、响应解析、回调 |
| `src/stores/appStore.ts` | 修改 | 新增 thinkingEnabled/thinkingBudget 状态 + actions + Message 类型扩展 |
| `src/types/index.ts` | 修改 | Message 类型加 thinkingContent/thinkingTokens |
| `src/components/ToolSelectorBar.tsx` | 修改 | 旁加深度思考开关 |
| `src/components/MessageBubble.tsx` | 修改 | 思考内容折叠展示 |
| `src/components/ChatInteraction.tsx` | 修改 | 传递 thinking 参数 + Timeline 步骤 |

## 约束

- thinking 开启时强制非流式（API 不支持 thinking + stream）
- thinking 开启时 temperature 必须为 1
- thinking 的 token 消耗计入 usage，但不计入 output_tokens（API 单独返回）
- 开关关闭时行为完全不变，零侵入

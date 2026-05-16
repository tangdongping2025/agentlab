---
title: RQ-014 会话切换时恢复历史消息
type: spec
date: 2026-05-16
domain: AI与技术
---

# RQ-014 会话切换时恢复历史消息

## 目标

用户在左侧会话列表切换到某次历史对话时，聊天区域应显示该会话的所有历史消息，用户可无缝继续对话。

## 当前行为

- `appStore.switchSession()` 已将历史消息加载到 `conversationHistory`
- `ChatInteraction` 组件使用本地 `messages` 状态渲染气泡
- 本地 `messages` 从不读取 `conversationHistory`，导致切换会话后聊天区域为空

## 新行为

切换会话后，`ChatInteraction` 监听 `conversationHistory` 变化，将其同步到本地 `messages`，历史消息以相同气泡样式完整呈现。

### 同步规则

| 场景 | 行为 |
|------|------|
| 切换到有消息的会话 | `conversationHistory` 更新 → `messages` 同步为历史消息 |
| 切换到新会话（无消息） | `conversationHistory` 为空 → `messages` 为空 |
| 新建会话后发首条消息 | `initialMessage` 触发发送，不走同步逻辑 |
| 发送新消息 | 追加到 `messages`，同时 `addMessage` 写入 store，不走同步逻辑 |

### 消息格式映射

store 中 `conversationHistory` 格式：
```ts
{ role: 'user' | 'assistant', content: string, timestamp: Date }
```

`ChatInteraction` 本地 `messages` 格式：
```
"用户: xxx"  /  "智能体: xxx"
```

映射规则：
- `role === 'user'` → `"用户: ${content}"`
- `role === 'assistant'` → `"智能体: ${content}"`

## 受影响文件

| 文件 | 变更 |
|------|------|
| `src/components/ChatInteraction.tsx` | 新增 useEffect 监听 conversationHistory 变化并同步到 messages |

## 不变的部分

- 消息发送逻辑（handleSendWithInput）完全不变
- 气泡样式不变，历史消息和新消息使用相同样式
- scrollToBottom 行为不变
- store、sessionService、其他组件均不修改

## 乔布斯设计理念合规检查

| 原则 | 合规 |
|------|------|
| 极简 | ✅ 无新 UI 元素，纯数据同步 |
| 专注 | ✅ 用户切换会话后自然看到历史，零额外操作 |
| 直觉 | ✅ 符合用户对"切换对话看到历史"的预期 |
| 一致性 | ✅ 历史消息和新消息视觉一致 |
| 工匠精神 | ✅ 同步时机精确，不干扰发送流程 |

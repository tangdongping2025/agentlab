# RQ-020 优化摘要策略

## 背景

摘要记忆策略（summary）是 Context Lab 的四种上下文管理策略之一。当前实现存在两个问题：

1. **代理问题**：`generateSummary()` 直连 `this.baseURL`，而 `sendMessage()` 走 Vite 代理（`/api/anthropic/v1/messages`）。用户若使用第三方代理（如火山引擎），摘要请求被 CORS 拦截，必然失败降级为滑动窗口。
2. **可视化不足**：摘要生成后，用户无法看到摘要覆盖了哪些原文、生成了什么内容、信息损失了什么，无法有效学习摘要策略的效果。

## 需求目标

1. 修复摘要生成的 API 代理问题，使其与 `sendMessage` 使用相同的请求路径
2. 增加摘要质量可视化：原文对比、生成耗时、覆盖范围、降级详情

## 设计

### 1. 修复代理问题

**文件**：`context-lab/src/services/agentService.ts`

**改动**：`generateSummary()` 方法（第 619-648 行）

将请求从直连改为走 Vite 代理：

| 字段 | 修改前 | 修改后 |
|------|--------|--------|
| URL | `${this.baseURL}/v1/messages` | `/api/anthropic/v1/messages` |
| Headers | `x-api-key` + `anthropic-dangerous-direct-browser-access` | `Content-Type` + `Authorization: Bearer` + `x-api-key` + `anthropic-version` |

请求体不变（model、max_tokens: 256、messages）。

### 2. StrategyEffect 类型扩展

**文件**：`context-lab/src/types/index.ts`

在 `StrategyEffect` 接口新增三个可选字段：

```typescript
summaryDuration?: number;      // 摘要生成耗时(ms)
summarySourceCount?: number;   // 被摘要的消息数
summarySourceTokens?: number;  // 被摘要的消息 token 数
```

### 3. agentService 填充新字段

**文件**：`context-lab/src/services/agentService.ts`

在 `applyStrategy()` 的 summary 分支中：

- 调用 `generateSummary()` 前记录 `startTime`
- 调用后计算 `duration = Date.now() - startTime`
- 在返回的 `StrategyEffect` 中填充：
  - `summaryDuration`: 耗时
  - `summarySourceCount`: `oldMessages.length`
  - `summarySourceTokens`: `oldMessages` 的 token 总数

降级路径同样填充 `summarySourceCount` 和 `summarySourceTokens`（不填充 `summaryDuration`，因为生成失败）。

### 4. StrategyEffectCard 增强

**文件**：`context-lab/src/components/StrategyEffectCard.tsx`

当策略为 `summary` 且 `triggered` 时，在现有信息下方增加：

- "对 {summarySourceCount} 条消息（约 {summarySourceTokens} tokens）生成摘要"
- 生成耗时："{summaryDuration}ms"
- 降级时：显示完整 `degradeReason`（当前只显示"降级为滑动窗口"）

### 5. StepDetailPanel 摘要原文对比

**文件**：`context-lab/src/components/StepDetailPanel.tsx`

在 `StrategyEffectSection` 中，当 `details.summaryContent` 存在时：

- 保留现有摘要内容卡片（琥珀色左边框）
- 新增可折叠区域"被摘要的原始消息"：
  - 默认收起，点击展开
  - 展开后逐条显示 `removedMessages` 中的消息
  - 每条消息显示 role 标签（用户/助手）和内容
- 显示生成耗时和覆盖范围

### 6. BottomPanel 最大化视图增强

**文件**：`context-lab/src/components/BottomPanel.tsx`

在 `StrategyEffectMaximizedView` 中：

- 摘要消息（`[对话摘要]` 前缀）的卡片增加"查看原文"按钮
- 点击后展开被摘要的原始消息列表
- 显示生成耗时

### 7. appStore 类型同步

**文件**：`context-lab/src/stores/appStore.ts`

`StrategyEffectStepDetails` 接口同步新增三个可选字段，与 `StrategyEffect` 保持一致。

## 不做的事

- 不增加摘要参数配置（触发阈值、保留条数、摘要长度保持硬编码）
- 不增加摘要编辑功能
- 不改变摘要生成的 prompt 和 max_tokens

## 设计理念合规检查

| 原则 | 合规 |
|------|------|
| 极简 | 修复是纯技术修正；可视化只在策略触发时展示，不增加首屏负担 |
| 专注 | 原文对比折叠收起，不干扰主流程 |
| 直觉 | "查看原文"按钮自解释，折叠/展开符合直觉 |
| 一致性 | 复用现有琥珀色样式、折叠组件模式 |
| 工匠精神 | 修复代理问题消除功能缺陷；可视化补全信息闭环 |

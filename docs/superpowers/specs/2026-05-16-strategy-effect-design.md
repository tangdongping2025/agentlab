# RQ-019: 优化上下文控制策略的影响

## 需求概述

让上下文控制策略真正生效，并在界面中可视化策略效果。

当前问题：四种策略（滑动窗口/完整记忆/摘要记忆/无记忆）中，只有 `sliding` 和 `full` 实现了行为逻辑，`summary` 和 `none` 等同于 `full`。UI 上的节省百分比是硬编码的，与实际 token 消耗无关。

## 设计决策

### 策略行为定义

| 策略 | 行为 |
|------|------|
| `full` | 发送全部历史消息（不变） |
| `sliding` | 保留最近 N 条消息，N 默认 10（不变） |
| `summary` | 旧消息调 Claude API 生成摘要，用摘要替代原文，与最近消息一起发送 |
| `none` | 只发送当前用户消息，不带任何历史 |

### 摘要策略实现

- 当对话历史超过阈值（默认 6 条）时触发
- 对超出部分调 Claude API 生成摘要，prompt："请用 2-3 句话总结以下对话的关键信息"
- 摘要结果缓存在 agentService 中，key 为已摘要消息的 ID 列表拼接，避免重复调用
- 新消息加入后，只对新增的旧消息增量摘要，已有摘要复用，新摘要追加到旧摘要后
- API 调用失败时降级为 sliding 策略，在步骤中标注降级信息

### 策略触发条件

策略是否在交互过程中显示为步骤：

| 策略 | 触发条件 | 说明 |
|------|---------|------|
| `full` | 永远不触发 | 完整记忆无变化 |
| `sliding` | 历史消息数 > N（默认 10） | 有消息被截断时 |
| `summary` | 历史消息数 > 阈值（默认 6） | 有消息被摘要时 |
| `none` | 历史消息数 > 0 | 有任何历史时 |

### 策略效果展示

两处展示策略效果：

1. **BottomPanel 中间区域**：替换原 `StrategyComparator`，完整版左右分栏对比，带最大化按钮
2. **交互过程时间线（TimelineReplay）**：作为步骤插入，精简版一行摘要 + 可展开详情，仅在策略触发时显示

各策略的展示样式：

- **sliding**：被截断消息用删除线标记（灰色），保留消息正常显示，底部"保留 N 条 / 共 M 条 · 节省 X%"
- **summary**：被摘要消息折叠为摘要块，显示摘要内容，底部"摘要 N 条 · 摘要 X tokens / 原文 Y tokens"
- **none**：所有历史删除线标记，仅当前消息绿色高亮，底部"丢弃 M 条 · 节省 X%"
- **full**：全部正常显示，底部"共 N 条 · X tokens"

## 组件架构

### 新增组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `StrategyEffectCard` | BottomPanel 中间区域 | 完整版策略前后对比，左右分栏 |
| `StrategyEffectStep` | TimelineReplay 步骤中 | 精简版策略步骤，一行摘要 + 可展开 |

### 修改组件

| 组件 | 修改内容 |
|------|---------|
| `BottomPanel` | 替换 `StrategyComparator` 为 `StrategyEffectCard`，加最大化按钮 |
| `TimelineReplay` | 在 API 调用步骤前插入 `StrategyEffectStep`（条件渲染） |
| `agentService` | 实现 `summary`/`none` 策略逻辑，`applyStrategy` 返回过滤结果 |
| `appStore` | 新增 `strategyEffect` 状态字段 |

### 数据流

```
用户发送消息
  → agentService.sendMessage(text, ..., strategy)
    → applyStrategy(messages, strategy)
      → 返回 StrategyEffect
    → 存入 appStore.strategyEffect
  → TimelineReplay 读取 strategyEffect，条件渲染 StrategyEffectStep
  → BottomPanel StrategyEffectCard 读取 strategyEffect，展示完整对比
```

### 状态结构

```typescript
interface StrategyEffect {
  strategy: ContextStrategy;
  triggered: boolean;
  beforeMessages: ClaudeMessage[];
  afterMessages: ClaudeMessage[];
  removedMessages: ClaudeMessage[];
  summaryContent?: string;
  beforeTokenCount: number;
  afterTokenCount: number;
  degraded?: boolean;          // 摘要降级标记
  degradeReason?: string;      // 降级原因
}
```

## 边界情况

- **摘要 API 失败**：降级为 sliding 策略，步骤中标注降级信息，不阻塞对话
- **首次对话**：消息数 0 或 1 时任何策略都不触发，BottomPanel 显示空状态
- **策略切换**：下次发送消息时生效，不回溯修改已有展示
- **滑动窗口 N 值**：暂不做成可配置项，默认 10
- **Token 计数**：使用 tokenService 估算，不追求精确

## 文件影响范围

### 新增文件
- `src/components/StrategyEffectCard.tsx`
- `src/components/StrategyEffectStep.tsx`

### 修改文件
- `src/services/agentService.ts` — 实现 summary/none 策略，提取 applyStrategy
- `src/stores/appStore.ts` — 新增 strategyEffect 状态
- `src/types/index.ts` — 新增 StrategyEffect 接口
- `src/components/BottomPanel.tsx` — 替换 StrategyComparator，加最大化
- `src/components/TimelineReplay.tsx` — 条件插入 StrategyEffectStep

### 可删除文件
- `src/components/StrategyComparator.tsx` — 被 StrategyEffectCard 替代

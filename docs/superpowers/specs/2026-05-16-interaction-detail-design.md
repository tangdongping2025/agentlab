---
name: RQ-015 交互过程详情描述优化
version: "1.0.0"
date: 2026-05-16
status: approved
---

# RQ-015：优化交互过程详情描述

## 目标

为时间线的每个步骤增加可展开的详情描述，支持查看具体的 API 报文内容、工具调用详情、上下文组织结构。同时让时间线步骤反映真实的 API 交互流程，而非模拟动画。

## 现状分析

- `TimelineReplay` 仅显示步骤图标+标签+颜色状态，无详情内容
- `ApiReorganizeStep`、`ToolInteractionDetails`、`DetailModal` 三个详情组件已编写但未接入
- `agentService` 有完整的 API 报文记录机制（`addApiRequest`/`addApiResponse`），但工具记录方法 `setToolRecordingMethods` 从未被调用
- 步骤推进用 setTimeout 模拟，不反映真实 API 流程

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 详情范围 | 时间线步骤为主，对话气泡辅助 | 步骤是交互流程的核心，气泡补充上下文信息 |
| 详情内容 | 4类全部：完整 HTTP 报文、工具调用详情、上下文组织结构、步骤描述说明 | 用户需要全面的交互过程可观测性 |
| 展开方式 | 混合：步骤摘要内联展开，完整报文弹窗 | 摘要不离开上下文，报文内容大适合弹窗 |
| 步骤真实性 | 改为真实 API 流程 | 模拟动画无法提供真实信息，与详情展示目标矛盾 |
| 实现方案 | 方案 B：重写组件 | 不受旧组件设计约束，结构更清晰 |

## 一、时间线步骤结构重构

### 动态步骤生成

步骤不再硬编码为 6 步，而是根据实际 API 交互流程动态生成：

**基础流程（无工具调用）**：
```
💬 用户输入 → 📤 API 请求 → 📥 API 响应 → 🤖 智能体回复
```

**有工具调用时**：
```
💬 用户输入 → 📤 API 请求 → 📥 API 响应(含tool_call)
→ 🔧 工具调用(工具名) → 📤 API 请求(带tool_result) → 📥 API 响应
→ 🤖 智能体回复
```

多次工具调用时自动循环 🔧→📤→📥 环节。

### 步骤类型定义

| 步骤类型 | ID | 图标 | 说明 |
|---------|-----|------|------|
| 用户输入 | `user-input` | 💬 | 用户发送的消息 |
| API 请求 | `api-request` | 📤 | 发送给 Claude API 的请求 |
| API 响应 | `api-response` | 📥 | Claude API 返回的响应 |
| 工具调用 | `tool-call` | 🔧 | 执行工具（动态显示工具名） |
| 智能体回复 | `agent-response` | 🤖 | 最终智能体回复内容 |

### 步骤类型扩展

```typescript
interface TimelineStep {
  id: string;
  type: 'user-input' | 'api-request' | 'api-response' | 'tool-call' | 'agent-response';
  icon: string;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
  expandable: boolean;
  expanded: boolean;
  // 新增：关联真实数据
  apiInteractionId?: string;  // 关联 apiInteractions 中的记录
  toolCallName?: string;      // 工具调用名称（tool-call 类型）
  duration?: number;          // 该步骤耗时（ms）
  tokenUsage?: {              // token 使用量
    input: number;
    output: number;
  };
  details?: StepDetails;
}

interface UserInputDetails {
  type: 'user-input';
  text: string;
  tokenCount: number;
  conversationTurns: number;
}

interface ApiRequestDetails {
  type: 'api-request';
  url: string;
  model: string;
  contextBreakdown: { section: string; tokenCount: number; percentage: number }[];
  requestBody?: string;  // 完整请求体 JSON（弹窗用）
}

interface ApiResponseDetails {
  type: 'api-response';
  statusCode: number;
  duration: number;
  tokenUsage: { input: number; output: number };
  responseType: 'tool_call' | 'final_response' | 'error';
  responseBody?: string;  // 完整响应体 JSON（弹窗用）
}

interface ToolCallDetails {
  type: 'tool-call';
  toolName: string;
  toolDescription: string;
  parameters: Record<string, any>;
  reasoning: string;
  result?: any;
  resultSummary?: string;
  reorganizedContext?: string;
}

interface AgentResponseDetails {
  type: 'agent-response';
  text: string;
  tokenUsage: { input: number; output: number };
  toolsUsed: string[];
  apiCallCount: number;
}

type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails;
```

## 二、StepDetailPanel 组件

### 新建组件：`StepDetailPanel.tsx`

每个步骤类型对应的内联详情展示：

| 步骤类型 | 内联摘要内容 | 弹窗完整报文 |
|---------|------------|------------|
| `user-input` | 用户输入文本预览（截断）+ token 数 | 完整用户消息 |
| `api-request` | 请求 URL + 模型名 + 上下文结构（系统提示词/对话历史/工具列表 各占多少 token） | 完整 HTTP 请求（headers + body） |
| `api-response` | 状态码 + 耗时 + token 用量 + 响应类型判断（tool_call / final_response） | 完整 HTTP 响应（headers + body） |
| `tool-call` | 工具名 + 参数摘要 + 调用原因 + 返回结果摘要 | 工具完整参数 + 完整返回 + 上下文重组 |
| `agent-response` | 回复文本预览（截断）+ token 数 | 完整回复内容 |

### 内联摘要布局示例

```
┌──────────────────────────────────────┐
│ 📤 API 请求                          │
│ 模型: claude-3.5-sonnet  耗时: --     │
│                                      │
│ 上下文结构:                           │
│  ▸ 系统提示词  234 tokens (12%)      │
│  ▸ 对话历史   512 tokens (27%)      │
│  ▸ 工具列表   128 tokens (7%)       │
│                                      │
│ [📄 查看完整报文]                     │
└──────────────────────────────────────┘
```

### DetailModal 复用

点击"查看完整报文"弹出已有 `DetailModal`，展示格式化的 JSON 报文。需要增强 `DetailModal` 支持 JSON 语法高亮和折叠长字段。

## 三、对话气泡辅助详情

### 气泡增强

每个气泡右下角增加 `···` 按钮，点击展开小面板：

**用户消息气泡**：
- 发送时的上下文快照
- 对话历史轮数
- 输入 token 数

**智能体回复气泡**：
- 该回复消耗的 token 数（input + output）
- 涉及的 API 调用次数
- 是否使用了工具（及工具名列表）
- 该回复对应的 timeilne 步骤索引

面板以内联展开方式显示，不弹窗。

## 四、数据流改造

### agentService 改造

1. 在 `sendMessage` 中增加阶段回调：
   - 发送请求前 → 回调 `onApiRequestStart(requestInfo)`
   - 收到响应后 → 回调 `onApiResponseReceived(responseInfo)`
   - 检测到 `tool_use` → 回调 `onToolCallDetected(toolInfo)`
   - 工具返回结果后 → 回调 `onToolResultReady(toolResult)`

2. 调用 `setToolRecordingMethods` 注入工具记录方法，让 `recordToolInteraction` 真正触发

3. 去除 setTimeout 模拟步骤推进逻辑

### Store 改造

1. `TimelineStep` 增加字段：`apiInteractionId`、`toolCallName`、`duration`、`tokenUsage`

2. 新增 actions：
   - `addTimelineStep(step)`：动态添加步骤
   - `updateTimelineStepData(stepId, data)`：更新步骤详情数据
   - `completeTimelineStep(stepId, data?)`：标记步骤完成并更新数据

3. 保留 `toggleStepExpanded`（已有但未用，现在启用）

4. `Message` 类型扩展：
   ```typescript
   interface Message {
     role: 'user' | 'assistant';
     content: string;
     timestamp: Date;
     // 新增
     tokenUsage?: { input: number; output: number };
     apiCallCount?: number;
     toolsUsed?: string[];
     timelineStepIndex?: number;
   }
   ```

### ChatInteraction 改造

1. 去掉 setTimeout 模拟逻辑
2. 步骤推进完全由 agentService 的回调驱动
3. 每条消息关联其对应的时间线步骤索引
4. 气泡组件接收扩展的 Message 数据渲染辅助详情

## 五、旧组件处理

以下组件在重写后变为死代码，需清理：
- `ApiReorganizeStep.tsx` — 功能被 `StepDetailPanel` 替代
- `ToolInteractionDetails.tsx` — 功能被 `StepDetailPanel` 的 tool-call 详情替代
- 相关测试文件一并清理

保留的组件：
- `DetailModal.tsx` — 复用，需增强（JSON 语法高亮、长字段折叠）
- `TimelineReplay.tsx` — 保留框架，改造内部逻辑

## 六、乔布斯设计理念合规检查

| 原则 | 合规措施 |
|------|---------|
| 极简 | 步骤默认收起，只展示图标+标题；摘要内联展开不离开上下文 |
| 专注 | 每次只展开一个步骤详情，点击其他步骤自动收起当前 |
| 直觉 | 步骤可点击即暗示可展开；"查看完整报文"文字明确无歧义 |
| 一致性 | 详情面板样式与现有深色主题统一；展开/收起动画与已有 collapsible 一致 |
| 工匠精神 | 报文 JSON 格式化展示；敏感信息脱敏；token 百分比精确计算 |

## 七、测试策略

- 单元测试：`StepDetailPanel` 各步骤类型的渲染测试
- 单元测试：`TimelineReplay` 动态步骤生成和展开/收起
- 集成测试：agentService 回调驱动的步骤推进流程
- 集成测试：工具调用场景的完整步骤链路

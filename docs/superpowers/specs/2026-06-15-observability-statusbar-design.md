# RQ-6 重新定位:可观察性状态栏(ObservabilityBar)— 规格设计

> 需求编号:RQ-6 重新定位(原 PrincipleExplorerAgent 独立 agent → 横切可观察性能力)
> 日期:2026-06-15
> 前置:总体架构见 `2026-06-14-agent-carrier-platform-design.md`

## 需求概述

将 RQ-6 的「原理探索」从一个**独立 agent**(PrincipleExplorerAgent)重新定位为**横切所有 agent 的可观察性能力**:一个底部常驻的状态栏(ObservabilityBar),任何 agent 运行时都能观察其「原理」——运行步骤时间线、Token 消耗、上下文策略效果、工具调用明细。折叠态显示轻量摘要,展开看完整可视化。

**核心动机**:原 PrincipleExplorerAgent 被做成「只能演示自己 4 策略的孤立 agent」,且 v1 只在 AgentWorkspace 渲染了一行 11px 小字,与「原理探索」预期严重不符,用户反馈「感觉没起作用」。根因是定位错误——可观察性应横切所有 agent,而非孤立 agent;且项目已有的成熟可视化资产(StrategyEffectCard 等)未被新界面复用。

## 现状(已核实)

- **旧可视化资产完整且成熟**:`BottomPanel`(App.tsx:186 在用)含 `TokenAllocation` / `StrategyEffectCard` / `TimelineReplay`,其中 StrategyEffectCard 已实现 before/after 消息对比、token 节省%、摘要原文展开、降级提示等丰富可视化
- **绑定旧架构**:这些组件直接 `useAppStore`(前端 agentService 直调 LLM 那套),新的 AgentRuntimeView(agentRuntimeStore + 后端 SSE)完全没接
- **RQ-6 v1 实现**:`PrincipleExplorerAgent` 是独立 agent,前端 eventAdapter 把 `strategy_effect` 渲染成 AgentWorkspace 里一行 11px 小字(`AgentWorkspace.tsx:40-44`)
- **后端事件类型齐全**:`events.py` 定义 TEXT / THINKING / TOOL_CALL / TOOL_RESULT / TOKEN_USAGE / ACTION / ERROR / DONE

## 关键决策(brainstorming 确认)

| 决策点 | 选择 |
|--------|------|
| 定位 | 横切所有 agent 的可观察性(非独立 agent) |
| 形态 | 底部常驻双行摘要 + 可展开完整面板(折中方案) |
| 字号 | 常驻条/内容 14px,标题 13px(告别之前的 11px) |
| 观察内容 | 运行步骤时间线 + Token 消耗 + 上下文策略效果 + 工具调用明细(全要) |
| 复用策略 | 方案1:解耦旧可视化组件为 props 驱动,新旧界面共享 |
| PrincipleExplorerAgent | 删除,4 策略逻辑下沉到 BaseAgent |
| 默认策略 | sliding(纯本地裁剪、零 LLM 成本);summary 作可选 |
| 破坏性 | 不破坏旧 ChatInteraction(旧 BottomPanel 继续绑 appStore) |

## 架构

### 布局

AgentRuntimeView 从纯 row 改成 column(三栏在上 + ObservabilityBar 底部):

```
AgentRuntimeView (column)
├─ row: AgentLibrary │ AgentWorkspace │ AssistantSidebar   (现有三栏不变)
└─ ObservabilityBar (新增,底部常驻,可折叠)
    ├─ 常驻双行摘要(14px)
    └─ 展开面板:TimelineReplay │ TokenAllocation │ StrategyEffectCard
```

### 常驻摘要(双行宽松,14px)

```
┌──────────────────────────────────────────────────────────┐
│ ● {agent名}                   {运行中/空闲}    [展开 ⩘]   │
│ Token {in}/{out}     步骤 {n}     策略 {strategy} · 省{x}% │
└──────────────────────────────────────────────────────────┘
```

展开后下拉面板含三栏可视化(TimelineReplay 运行步骤 / TokenAllocation token 消耗 / StrategyEffectCard 策略效果 before-after 对比),各子面板支持最大化(沿用旧 BottomPanel 能力)。

### 组件解耦(核心改动)

3 个可视化组件从直接读 store 改为 props 驱动:

| 组件 | 现状 | 改成 |
|---|---|---|
| `StrategyEffectCard` | `useAppStore(s=>s.strategyEffect)` | `<StrategyEffectCard effect={...} />` |
| `TokenAllocation` | `useAppStore(...)` | `<TokenAllocation data={...} />` |
| `TimelineReplay` | `useAppStore(s=>s.steps...)` | `<TimelineReplay steps={...} onViewFullPayload={...} />` |

- **旧 ChatInteraction**:加 wrapper 从 appStore 取数据传 props(行为完全不变)
- **新 ObservabilityBar**:加 adapter 从 agentRuntimeStore 取数据传 props
- 新旧两套界面共享同一份解耦后的组件

### 数据流

```
agent.run() → emit(thinking / tool_call / tool_result / token_usage / strategy_effect / text)
   → SSE → agentRuntimeStore(累积 observability 聚合状态)
       → ObservabilityBar 常驻摘要 + 展开面板(经 adapter 喂给解耦组件)
```

`eventAdapter` 增强:把后端标准事件映射成各组件需要的 props 格式。

### BaseAgent 策略集成

- `_apply_strategy`(full / sliding / summary / none)从 `PrincipleExplorerAgent` **下沉到 `BaseAgent`**
- 所有 agent run 前:apply strategy → emit `strategy_effect` → stream
- 删除 `PrincipleExplorerAgent`(逻辑已泛化,不再是独立 agent)
- 默认策略 `sliding`(纯本地裁剪、零 LLM 成本);`summary` 额外调 LLM,作可选

### 配套布局调整(用户追加)

ObservabilityBar 之外,AgentRuntimeView 还有两处布局优化(同批调整,与状态栏布局一起改):

1. **AgentLibrary 去掉「项目助手」**:assistant agent 已在右侧 AssistantSidebar 常驻,库内再列一项重复。处理:前端 AgentLibrary 过滤掉 `assistant`(后端 /api/agents 仍返回,仅前端不展示)。
2. **AssistantSidebar 可收缩**:加折叠 toggle;折叠时侧栏宽度收起,AgentWorkspace flex 扩展占满(工作区变大);展开恢复。

## v1 范围

✅ 做:
- ObservabilityBar(常驻双行摘要 + 可展开面板,14px)
- 解耦 `StrategyEffectCard` / `TokenAllocation` / `TimelineReplay` 为 props 驱动
- BaseAgent 加 `_apply_strategy` + emit `strategy_effect`(扩展 effect 数据含 before/after messages 明细,供 StrategyEffectCard)
- eventAdapter 增强(事件 → props 映射)
- 删除 `PrincipleExplorerAgent`
- 旧 ChatInteraction 加 wrapper(保持行为不变)
- AgentLibrary 过滤掉 `assistant`(避免与右侧助手重复)
- AssistantSidebar 加折叠 toggle,折叠时 AgentWorkspace 扩展占满

⏸ 推后:
- 策略切换 UI(用户在工作台选 full/sliding/summary/none)
- 多 agent 对比实验(同任务跑不同 agent 对比)
- 可观察性历史回放

## 测试

- **后端**:BaseAgent._apply_strategy 4 策略(从 principle_explorer 现有测试迁移)、各 agent run 时 emit strategy_effect、effect 数据结构完整
- **前端**:eventAdapter 事件→props 映射、ObservabilityBar 常驻/展开渲染、解耦组件 props 模式不破坏旧 wrapper

## 风险

1. **解耦旧组件影响旧界面**:改 StrategyEffectCard 等接 props,必须保证旧 ChatInteraction 行为不变(加 wrapper 从 appStore 取数据传 props 兜底)
2. **所有 agent apply 策略的性能/成本**:sliding/none/full 零成本;summary 调 LLM(成本 + 延迟)。默认 sliding 规避
3. **strategy_effect 数据结构扩展**:principle_explorer 现在 emit 的 effect 只有 counts,StrategyEffectCard 需要 beforeMessages/afterMessages/removedMessages 明细 → BaseAgent 下沉时必须扩展 effect 数据

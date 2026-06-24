# 智能体运行状态可见性

> 2026-06-23。claude-sdk agent(龙虾 Agent)在 WebSearch 执行期与冷启动期主对话区状态静态,用户「卡死感」。

## 问题

实测 TTFT≈10s(CLI 子进程冷启动 + glm 首 token,与请求大小无关),WebSearch 另加 ~35s。这些静默期主对话区只有一个静态状态文字(如「正在使用工具…」),长时间不变化,无计时无动效 → 卡死感。

瓶颈本身(TTFT 10s)短期难改(架构+glm 限制,探索已证伪 thinking/模型/系统提示四个假设),但**卡死感是纯体验问题,可解**。

## 目标

让 agent 运行期间主对话区状态**有进度感**:具体状态 + 已用计时 + 动效。

## 范围

1. `getWorkspaceStatus` 增补 WebSearch 专门状态(显示 query) + 冷启动状态(零事件 → 「正在启动…」)
2. 状态卡片加「已用 Xs」计时(每秒 tick)+ 省略号/spinner 动效
3. 提取 `getWorkspaceStatus` 到 `eventAdapter.ts`(纯函数,TDD)

## 非目标

- 不提速(TTFT 受架构+glm 限制)
- 不改后端(纯前端)
- 不重构 claude_sdk_agent runtime(排进 RQ-8)

# RQ-8 ReAct:研究助手推理可见

> 2026-06-24。research 工具循环推理隐式(LLM 黑盒决定),用户看不到 agent 思路。ReAct 显式化:调工具前的 text 展示为 Thought(推理链)。

## 目标

research 多步任务时,每步推理(Thought)可见——LLM 调工具前先输出推理 text,前端识别为 Thought 展示。让 agent 思考过程从黑盒变白盒。

## 方案(前端为主,BaseAgent 不改,不牺牲流式)

LLM 流式输出 text + tool_use。ReAct 下 LLM 在 tool_use 前先输出推理 text。

1. **research system prompt** 加 ReAct 引导(调工具前用一句话说明思路,会展示给用户)
2. **前端 store**(agentRuntimeStore): 收 TOOL_CALL 时,把当前 `workspaceStreaming` 转成 Thought(thinking display event)+ 清空 `workspaceStreaming`;最后无工具的 `workspaceStreaming` = 最终回答
3. **前端展示**: Thought 推理链淡色折叠(默认收起,点开看)

## 范围

- research agent(龙虾 claude-sdk 不改)
- 前端 store + 展示
- BaseAgent 零改动

## 非目标

- planning / 自纠错 / 可干预(RQ-8 B/C,本次不做)
- 龙虾不改

## 约束

- 不牺牲流式:简单问题(无工具)仍流式回答;多步问题推理 + 回答都流式
- LLM 不输出推理则无 Thought(自然降级为普通工具循环,不强求)

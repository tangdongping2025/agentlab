# 实现计划:RQ-8 ReAct 推理可见

## Task 1: research system prompt 加 ReAct 引导

- `research_agent.py` system_prompt 加:调工具前先用一句话说明你的思路(会展示给用户),再调用工具
- `test_research_agent.py` 验证 system_prompt 含 ReAct 引导关键词

## Task 2: 前端 store TOOL_CALL 转 Thought(TDD)

- `agentRuntimeStore.ts` onEvent: 收 `tool_call` 事件时,若 `workspaceStreaming` 非空,把它转成一个 thinking display event(Thought)加入 `workspaceEvents`,再清空 `workspaceStreaming`
- 效果: ReAct 下 LLM 调工具前的推理 text → Thought(不混进最终回答)
- `agentRuntimeStore.test.ts` 验证: 发 text→tool_call,workspaceStreaming 清空 + workspaceEvents 含 thinking Thought

## Task 3: 前端展示 Thought(淡色折叠)

- ChatWorkspace/MessageBubble: Thought(thinking display event)淡色折叠展示(默认收起,点击展开)
- 复用现有 thinking 展示逻辑(toDisplayEvent thinking)

## Task 4: 验证 + 部署

- `npm test` + `npm run typecheck`
- 本地 docker 验证:research 多步任务(如「搜索 X 并总结」)显示 Thought 推理链 + 最终回答
- 重建部署 ECS + 本地
- commit + push

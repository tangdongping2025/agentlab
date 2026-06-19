# 移除 Echo 并置顶龙虾 Agent 设计

## 背景

Echo 智能体只是早期验证骨架的回显 agent，当前在应用库中没有实际使用价值，会干扰用户选择。龙虾 Agent 是主要行动型智能体，应在应用库中优先展示。

## 设计

- 不再在默认 agent 注册入口中注册 `echo`，使 `/api/agents` 和应用库不再展示 Echo。
- `claude-sdk` 保持 id 不变，显示名保持 `龙虾 Agent`。
- 调整注册顺序，使 `claude-sdk` 在 `/api/agents` 返回列表中排第一；应用库沿用接口顺序展示。
- 不删除已有历史会话数据，不迁移历史 `agentId=echo`。

## 验收

- `/api/agents` 返回列表第一项是 `claude-sdk` / `龙虾 Agent`。
- `/api/agents` 返回列表不包含 `echo`。
- `/api/agents/echo` 返回 404。
- 前端应用库按接口顺序展示时，龙虾 Agent 排第一。

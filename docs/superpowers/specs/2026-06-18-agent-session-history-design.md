# Agent 会话历史与消息时间显示

## 需求

1. 智能体中的“新建对话”必须创建一个新的 session，而不是复用或清空当前 agent 的唯一 session。
2. 历史会话详情中，每条消息需要显示消息时间。

## 设计

- Agent 是能力类型，Session 是一次独立对话/任务；同一个 agent 可以有多条 session。
- 切换 agent 时仍可加载该 agent 最近 session，便于继续工作。
- 点击“新建对话”时创建新的空 session，写入当前 `agentId`，并把工作区切到这个新 session；旧 session 保留在历史页。
- 历史详情右侧在“用户/助手”旁显示消息时间。
- 后端返回消息时间时，优先使用消息 payload 中的 `timestamp`；如果为空，用 `messages.created_at` 兜底。

## 验收

- 连续点击同一 agent 的“新建对话”并发送消息后，历史页能看到该 agent 的多条 session。
- 选择历史 session 后，右侧每条消息显示时间。
- 旧 agent session 不被新建对话覆盖或清空。

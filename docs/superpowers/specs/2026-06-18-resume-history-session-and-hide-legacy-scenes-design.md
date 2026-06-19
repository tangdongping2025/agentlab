# 历史会话继续对话与旧场景入口隐藏

## 需求

1. 历史页选择某个 agent session 后，可以基于该 session 继续对话。
2. 当前智能体载体平台不再展示旧版场景区入口，避免用户进入已经不适配当前定位的旧 chat 视图。

## 设计

- 历史详情右侧增加“继续此会话”操作，仅当 session 存在 `agentId` 时展示。
- 点击“继续此会话”后，应用回到智能体运行页，并把该 session 恢复为当前工作区：
  - `currentAgentId = session.agentId`
  - `workspaceSessionId = session.id`
  - `workspaceMessages = session.messages` 中的 user/assistant 文本消息
  - 清空 streaming、events、observability、running、abort controller、reset token
- 恢复后继续发送消息时，沿用现有 `runWorkspace` 持久化逻辑，追加写回同一个 session。
- 历史页对没有 `agentId` 的旧 session 不显示继续入口。
- App 层移除旧 chat 视图入口，不再挂载 `ConfigSidebar` / `SceneEditModal` / 旧场景区；旧 scene/appStore/ChatInteraction 代码暂时保留，不做本需求内的大规模删除。

## 验收

- 从历史页选择一个 agent session，点击“继续此会话”后跳回智能体工作区，当前 agent 与消息内容恢复正确。
- 在恢复后的工作区继续发送消息，会追加到同一个 session，而不是创建新 session。
- 当前 UI 不再提供进入旧场景区的入口。
- 自动测试覆盖 store 恢复 action、HistoryPage 继续按钮回调、App 从历史页恢复 session。
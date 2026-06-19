# 龙虾 Agent 描述文案设计

## 背景

`龙虾 Agent` 的现有描述仍是 `Claude Agent SDK 驱动的 coding agent...`，过于技术实现导向，也把能力限定在 coding 场景，不符合“有手有脚、能行动”的智能体定位。

## 设计

将 `claude-sdk` 的用户可见描述改为：

> 会使用工具、读写文件、执行命令并观察结果的行动型智能体

保持 `id=claude-sdk`、显示名 `龙虾 Agent`、workspace 和 capabilities 不变。

## 验收

- `/api/agents` 中 `claude-sdk` 的 `name` 为 `龙虾 Agent`。
- `/api/agents` 中 `claude-sdk` 的 `description` 为新文案。
- 应用库不再显示 `Claude Agent SDK 驱动的 coding agent...`。

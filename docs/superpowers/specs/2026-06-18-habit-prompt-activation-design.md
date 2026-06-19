# 习惯生效 v1

## 背景

历史洞察沉淀闭环已经能把候选洞察人工采纳为“用户习惯库”和“知识素材池”。下一步需要让用户习惯在用户明确授权后影响智能体协作方式，但不能默认生效，避免误采纳的候选长期污染 system prompt。

## 需求

1. 用户习惯库中的每条习惯增加“用于智能体提示词”的启用开关。
2. 新采纳的习惯默认不启用。
3. 用户开启后，该习惯在支持 LLM 的智能体运行时追加到 system prompt。
4. 用户关闭后，该习惯不再注入 system prompt。
5. 启用状态必须持久化，刷新页面后仍保留。
6. 只有 `kind = habit`、`status = accepted`、已启用的条目可以进入提示词。
7. 知识素材池条目不进入提示词。
8. `echo` 等非 LLM 智能体不受影响。
9. 用户仍能查看来源 session、删除习惯。

## 设计

- 扩展 `insight_items` 数据模型，新增布尔字段：
  - `enabled_for_prompt`
- API 使用 camelCase 暴露：
  - `enabledForPrompt`
- 默认值：`false`。
- 新增或扩展后端接口：
  - `PATCH /api/db/insights/{insight_id}`
  - payload: `{ "enabledForPrompt": true | false }`
- 前端“沉淀库 → 用户习惯库”中，每条习惯显示开关：
  - 文案：`用于智能体提示词`
  - 已开启时显示 `已生效` 标签。
- 后端 agent runtime 构建 system prompt 时读取已启用习惯，追加为独立段落：

```text
用户协作偏好：
- 偏好先设计和计划：多次提到设计、规格或计划，适合先明确方案再实现。
- 重视验证和验收：多次提到验证或验收，说明完成判断需要可检查证据。
```

- 注入顺序靠后，作为用户协作偏好补充，不覆盖：
  - 全局系统提示词
  - agent 自带提示词
  - Skill prompt
- 第一版注入范围：
  - `assistant`
  - `research`
  - `claude-sdk`
- 不注入：
  - `echo`

## 不做

- 不自动启用任何习惯。
- 不注入 `kind = knowledge` 的知识素材。
- 不写入 Claude Code memory。
- 不修改全局系统提示词配置本身。
- 不做 per-agent 习惯启用配置。
- 不做权重、优先级、排序管理。
- 不调用 LLM 改写或总结习惯内容。
- 不做 RAG 或知识库检索。

## 验收

- 用户可以在沉淀库中开启某条习惯的“用于智能体提示词”。
- 页面刷新后开关状态保留。
- 已启用习惯会进入支持 LLM 智能体的 system prompt。
- 未启用习惯不会进入 system prompt。
- 知识素材不会进入 system prompt。
- 关闭开关后，该习惯不再注入。
- 来源 session 打开、删除沉淀项和继续上下文能力不回归。

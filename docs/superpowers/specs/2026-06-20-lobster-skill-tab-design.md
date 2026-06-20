# 龙虾 Agent Skill Tab 设计

## 目标

在龙虾 Agent 工作区新增「Skill」Tab，让用户看见该智能体当前有哪些 prompt 增强能力，并能把当前工作目录下的 `.claude/skills` 手动启用给龙虾 Agent。

## 范围

- 龙虾 Agent tabs 从 `对话 / 文件` 扩展为 `对话 / 文件 / Skill`。
- Skill 页展示平台 skill 与当前工作目录 skill。
- 工作目录 skill 来源为当前 `workspaceCwd` 下的 `.claude/skills/<id>/{SKILL.md,skill.md,README.md}`。
- 工作目录 skill 默认只发现、不启用；用户点击启用后才注入给 `claude-sdk`。
- 启用状态保存到现有 skill settings 中，并仅影响后续新请求。

## 安全约束

- 不自动加载工作目录 skill。
- 工作目录 skill 必须位于当前 `ROOT_DIR` 允许范围内。
- 同名 skill 仍按平台目录优先，工作目录 skill 不覆盖平台 skill。
- Skill 内容继续限制最大注入长度，超长标记 `truncated`。

## 成功标准

- 龙虾 Agent 显示 Skill Tab。
- Skill Tab 能列出已启用给龙虾的 skill、未启用的平台 skill、当前工作目录发现的 skill。
- 用户能在 Skill Tab 中启用/禁用某个 skill 给龙虾 Agent。
- 后端 prompt 注入只包含显式启用且分配给 `claude-sdk` 的 skill。

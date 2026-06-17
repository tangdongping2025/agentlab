# Global System Prompt 设计

## 目标

在设置页新增“全局提示词”配置，保存一段平台级 system prompt，并对 LLM 推理型智能体生效：`assistant`、`research`、`claude-sdk`。

## 范围

- 支持保存/读取全局 system prompt。
- 作用范围：`assistant` / `research` / `claude-sdk`。
- `echo` 等非 LLM 推理型智能体不注入，并在 UI 中标注不支持。
- 注入顺序：全局 system prompt → agent 自带 system prompt → Skill prompt。
- 保存文件只存 prompt 文本，不保存 secret，不执行任何命令。

## 非目标

- 不做 per-agent 全局提示词差异化。
- 不做 prompt 模板变量。
- 不做远程 prompt 市场或自动推荐。
- 不改变旧版 Chat 实验页的 API 设置。

## 验收

- `/api/settings/global-prompt` GET/POST 可读写全局提示词。
- `BaseAgent` 与 `ClaudeSdkAgent` 都按全局优先顺序注入 prompt。
- 设置页可编辑并保存全局提示词，展示支持/不支持智能体。
- 自动测试覆盖 settings API、注入顺序、设置页展示。
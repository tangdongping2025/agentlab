# Skill Adapter 设计

## 背景

当前平台已经支持两类 agent 运行方式：

- `assistant` / `research`：继承 `BaseAgent`，走自研 LLM + tool-use loop。
- `claude-sdk`：走 Claude Agent SDK，由 SDK 自主管理工具循环。

用户希望 Claude Code 风格的 skill 不只服务于 `claude-sdk`，也能被 `assistant` / `research` 等平台内智能体复用。这里的 skill 不是 MCP server，也不是运行时工具，而是一组流程说明、角色约束和提示词增强。

第四阶段目标是新增 Skill Adapter：把本地允许目录内的 skill 文档读取为安全的 prompt 增强，并按平台设置注入到多个支持的 agent。

## 目标

- 平台可以发现本地允许目录中的 Claude Code 风格 skill。
- 设置页可以显示 skill 列表，并配置每个 skill 关联哪些 agent。
- `assistant` / `research` 运行时可以注入已关联 skill 的内容。
- `claude-sdk` 运行时也可以注入已关联 skill 的内容，不只依赖 SDK 原生机制。
- `echo` 继续不支持 skill，因为它不是 LLM 推理型智能体。
- skill 只作为 prompt 增强，不执行任意命令，不安装依赖，不保存密钥。

## 非目标

- 不做自动 skill 匹配；第一版只支持用户显式启用和关联。
- 不执行 skill 文档中提到的 shell command、hook、脚本或外部动作。
- 不允许 UI 配置任意 skill 路径。
- 不支持远程 skill 市场或在线下载。
- 不解析复杂 frontmatter 行为；第一版只读取 `name`、`description` 和正文内容。
- 不改变 MCP Tool Adapter；MCP 继续负责工具能力，Skill Adapter 只负责行为/流程提示能力。

## 第一版 skill 来源

第一版只读取本地白名单目录，避免任意路径读取：

1. `backend/skills/`
2. 仓库内 `.claude/skills/`

如果目录不存在则返回空列表。每个 skill 目录内优先读取：

- `SKILL.md`
- `skill.md`
- `README.md`

只读取 UTF-8 文本文件。单个 skill 内容设置长度上限，超出时截断并在返回数据中标注 `truncated: true`。

## 设置模型

新增 `backend/skill-settings.local.json`，只保存非敏感配置：

```json
{
  "skills": {
    "skill-id": {
      "enabled": true,
      "agentIds": ["assistant", "research", "claude-sdk"]
    }
  }
}
```

保存时过滤：

- 未发现的 skill id。
- 未知 agent id。
- 不支持 skill 的 agent id。
- 任何额外字段。

默认所有 skill 为未启用，避免新功能自动改变已有 agent 行为。

## 支持范围

`SUPPORTED_SKILL_AGENT_IDS` 第一版为：

- `assistant`
- `research`
- `claude-sdk`

`echo` 显示为暂不支持，原因是“非 LLM 推理型智能体暂不支持 skill 注入”。

## 架构

### Skill 服务层

新增 `backend/skill_settings.py`，职责：

- 发现本地白名单 skill。
- 读取 skill 元信息和正文。
- 读取、清洗、保存 skill 设置。
- 构造 Settings API 响应。
- 为指定 agent 生成要注入的 skill prompt。

生成 prompt 时使用固定包裹格式：

```text

[启用的 Skill: skill-name]
<skill 正文>
[/Skill]
```

多个 skill 按名称排序后拼接，保证输出稳定。

### API 层

新增设置 API：

- `GET /api/settings/skills`
- `POST /api/settings/skills`

响应包含：

- `skills`: 已发现 skill 列表、启用状态、关联 agent、描述、是否截断。
- `agents`: agent 支持状态和不支持原因。

POST payload 只接受：

```json
{
  "skills": {
    "skill-id": {
      "enabled": true,
      "agentIds": ["assistant"]
    }
  }
}
```

### BaseAgent 接入层

`BaseAgent.run()` 在调用 provider 前构造 system prompt：

```python
system_prompt = self.system_prompt + build_skill_prompt_for_agent(self.metadata.id)
```

如果没有启用 skill，则保持原 system prompt 不变。

### Claude SDK 接入层

`ClaudeSdkAgent._build_options()` 在当前 `task.system or _DEFAULT_SYSTEM_PROMPT` 基础上追加：

```python
build_skill_prompt_for_agent("claude-sdk")
```

AMap MCP 的系统提示追加逻辑保持不变。

### 前端 UI

`SettingsModal` 新增 `Skill` tab，展示：

- skill 名称、描述、来源路径。
- 是否启用。
- 关联支持 skill 的智能体：`assistant` / `research` / `claude-sdk`。
- 暂不支持 skill 的智能体：`echo`。
- 保存按钮。

UI 不显示完整 skill 正文，避免设置页过长；只显示描述和路径。

## 安全约束

- 只读取仓库内白名单目录，不接受用户输入路径。
- 只读取 Markdown 文本，不执行任何内容。
- 不保存、不显示任何 secret。
- 不开放 shell command / args。
- 不把 skill 自动转成工具；skill 不具备执行权限。
- 内容长度有上限，避免 prompt 膨胀。

## 测试策略

- `test_skill_settings.py`
  - 能发现白名单目录下的 skill。
  - 能解析 frontmatter 中的 `name` / `description`。
  - 保存设置时过滤未知 skill、未知 agent、`echo` 和额外字段。
  - 为指定 agent 只拼接已启用且已关联的 skill。
  - 超长 skill 会截断并标记。
- `test_base_agent.py`
  - BaseAgent 调 provider 时 system prompt 包含已关联 skill 内容。
  - 未关联时不改变 system prompt。
- `test_claude_sdk_agent.py`
  - ClaudeSdkAgent options 的 system_prompt 包含已关联 skill 内容。
- 前端测试
  - SettingsModal Skill tab 显示支持/不支持 agent 分组。
  - 已发现 skill 可以勾选 agent 并保存。
- 验证
  - 后端相关 pytest 通过。
  - `npm run typecheck` 通过。
  - `npm run build` 通过。

## 验收标准

- 设置页出现 Skill tab。
- `assistant` / `research` / `claude-sdk` 显示为支持 skill。
- `echo` 显示为暂不支持。
- 用户可显式启用一个本地 skill 并关联到支持的 agent。
- 被关联的 agent 运行时 system prompt 包含该 skill 内容。
- 未关联 agent 不受影响。
- 不执行 skill 文档中的任何命令。
- 自动测试通过。

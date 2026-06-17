# 设置数据库化与智能体模型配置设计

## 背景

MCP 设置和 Skill 设置目前仍写入后端本地 JSON 文件：`backend/mcp-settings.local.json` 与 `backend/skill-settings.local.json`。这种方式在 Docker、Watchtower 自动重建、不同启动目录或多环境部署时容易丢失或形成多份真相源。全局提示词已经迁移到 MySQL `app_settings`，同类设置应采用相同的数据库持久化模式。

智能体运行时目前统一使用后端环境变量里的 `llm_base_url`、`llm_model`、`llm_api_key`。用户希望不同智能体可配置不同模型端点、模型名和 API key，以便在同一平台内对比不同模型或让不同智能体走不同供应商。

## 目标

- MCP 设置迁移到 MySQL `app_settings`。
- Skill 设置迁移到 MySQL `app_settings`。
- 数据库为空时自动导入旧 JSON 配置；导入后数据库成为唯一真相源。
- 新增按智能体维度的模型配置，支持 `base_url`、`model`、`api_key`。
- 模型 API key 加密后入库，读取接口不回显明文。
- Settings 增加“模型配置”tab。
- 未配置某智能体时保留现有环境变量默认行为。

## 数据存储

继续复用 `app_settings` 表：

- `setting_key = "mcp_settings"`：保存 MCP 启用状态、关联智能体、启动模式。
- `setting_key = "skill_settings"`：保存 Skill 启用状态、关联智能体。
- `setting_key = "agent_model_settings"`：保存各智能体模型配置。

MCP 与 Skill 的数据结构沿用现有 sanitize 后的 JSON 结构，避免前端 API 大改。

模型配置数据库结构：

```json
{
  "agents": {
    "assistant": {
      "baseUrl": "https://example.com/api",
      "model": "model-name",
      "apiKeyEncrypted": "..."
    },
    "research": {
      "baseUrl": "https://example.com/api",
      "model": "model-name"
    }
  }
}
```

响应给前端时转换为：

```json
{
  "agents": [
    {
      "id": "assistant",
      "name": "项目助手",
      "supportsModelConfig": true,
      "baseUrl": "https://example.com/api",
      "model": "model-name",
      "apiKeyConfigured": true,
      "unsupportedReason": ""
    }
  ],
  "encryptionConfigured": true
}
```

API key 明文只允许出现在保存请求体中，后端保存前加密；读取响应、诊断响应、日志和测试断言中都不得出现明文。

## 旧 JSON 自动导入

MCP/Skill 读取逻辑改为：

1. 先查 `app_settings` 对应 key。
2. 如果数据库已有记录，返回数据库记录。
3. 如果数据库没有记录，读取旧 JSON 文件。
4. 旧 JSON 存在且有有效配置时，sanitize 后写入数据库并返回。
5. 旧 JSON 不存在或无有效配置时，返回默认值；默认值不强制写入数据库。

保存逻辑只写数据库，不再写旧 JSON。旧 JSON 不作为失败兜底，避免双真相源。

## 加密方案

后端新增服务器侧主密钥配置，例如 `model_config_master_key`，从环境变量读取。

- 保存 `apiKey` 时，如果主密钥为空，接口返回 400，说明当前环境不允许保存 API key。
- 保存 `baseUrl` / `model` 时不需要主密钥。
- 如果请求未携带 `apiKey` 字段，保留原有加密 key 状态。
- 如果请求携带空字符串 `apiKey: ""`，清除该智能体已保存的 API key。
- 加密结果只存数据库，读取接口仅返回 `apiKeyConfigured`。

加密实现使用后端可用的 Python 加密库；如果项目依赖中没有现成加密库，则新增最小依赖并在测试中覆盖加密/解密 roundtrip。明文 API key 不允许写入数据库。

## 支持范围

支持模型配置的智能体：

- `assistant`
- `research`
- `claude-sdk`

不支持：

- `echo` 等非 LLM 智能体。

`assistant` / `research` 等 `BaseAgent` 系智能体使用配置解析后的 `base_url`、`model`、`api_key` 创建 `ArkProvider`。

`claude-sdk` 先在 Settings 中展示为可配置，保存同样进入数据库。运行时接入以 SDK 当前能力为准：如果当前 `claude_agent_sdk` 只通过环境变量或 CLI 默认配置选模型，则本次先保存配置并在规格中标注限制，不伪装为已完全生效；能安全传入的字段才接入。

## API 设计

新增：

- `GET /api/settings/agent-models`
- `POST /api/settings/agent-models`

`POST` 请求示例：

```json
{
  "agents": {
    "assistant": {
      "baseUrl": "https://example.com/api",
      "model": "model-name",
      "apiKey": "new-secret"
    }
  }
}
```

字段规则：

- 未知智能体忽略。
- 不支持模型配置的智能体忽略其配置。
- `baseUrl` 和 `model` trim 后保存，空字符串表示回退环境变量默认值。
- `apiKey` 字段不存在表示保留原 key。
- `apiKey` 为空字符串表示清除原 key。
- `apiKey` 非空且无主密钥时返回 400。

## Settings UI

Settings 新增“模型配置”tab：

- 每个支持的 LLM 智能体显示 `baseUrl`、`model`、API key 输入框。
- API key 输入框为空不代表清除，默认提示“留空表示不修改”。
- 已配置 key 时显示“已配置”。
- 提供“清除 key”操作。
- 非 LLM 智能体显示不支持原因，不提供输入框。
- 保存成功后清空 API key 输入框，继续显示 `apiKeyConfigured` 状态。

## 非目标

- 不把 MCP secret 保存到数据库；高德 MCP key 继续只读 `AMAP_MAPS_API_KEY` 环境变量。
- 不回显任何 API key 明文。
- 不新增远程 Skill 市场。
- 不执行 Skill 文档里的命令。
- 不开放任意 shell command、args 或任意路径作为 Skill 设置。
- 不改变全局提示词的注入顺序。
- 不改造前端旧的浏览器 LLM 配置存储；本需求只覆盖后端 Agent Runtime。

## 测试与验证

后端：

- MCP 设置数据库 roundtrip。
- MCP 旧 JSON 自动导入到 `app_settings`。
- MCP 保存不写旧 JSON，不保存 secret。
- Skill 设置数据库 roundtrip。
- Skill 旧 JSON 自动导入到 `app_settings`。
- 模型配置保存 `baseUrl/model`。
- 模型 API key 加密入库，响应不回显明文，解密后运行时可使用。
- 无主密钥保存新 API key 返回 400。
- 未配置智能体时回退 `settings.llm_*`。

前端：

- Settings “模型配置”tab 能加载、编辑并保存。
- 已配置 key 状态显示正确。
- 保存后不保留明文 key 输入值。

手动验证：

- 重启后端后 MCP/Skill 设置仍从数据库恢复。
- 配置某智能体模型后，该智能体运行时使用对应模型配置。
- 未配置的智能体仍使用环境变量默认模型配置。

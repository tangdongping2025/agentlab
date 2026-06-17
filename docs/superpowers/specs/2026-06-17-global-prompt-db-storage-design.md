# 全局提示词数据库存储设计

## 背景

当前全局系统提示词保存在 `backend/global-prompt-settings.local.json`。本地运行有效，但 Docker 容器重建后容器可写层会丢失该文件，不适合作为生产持久化来源。

## 目标

将全局系统提示词改为存储在 MySQL 中，保持现有设置页和 API 不变：

- `GET /api/settings/global-prompt`
- `POST /api/settings/global-prompt`

## 范围

- 新增通用设置表 `app_settings`。
- 全局提示词使用 `setting_key = "global_prompt"` 存储一条 JSON 配置。
- 配置内容仍只包含 `enabled` 和 `prompt`。
- 首次读取时如果数据库没有 `global_prompt`，且旧 JSON 文件存在，则自动导入旧 JSON 内容到数据库。
- 本地和线上共享 MySQL 时，全局提示词作为共享配置处理。

## 非目标

- 不迁移 MCP 设置和 Skill 设置。
- 不做 per-agent 差异化提示词。
- 不做模板变量。
- 不保存密钥。
- 不执行提示词内容中的命令。
- 不保留 JSON 作为数据库失败时的兜底真相源。

## 数据模型

新增 `app_settings` 表：

- `setting_key`：字符串主键。
- `setting_value`：JSON，不为空。
- `updated_at`：更新时间。

全局提示词记录：

```json
{
  "enabled": true,
  "prompt": "全局系统提示词内容"
}
```

## 行为

1. 保存全局提示词时，后端校验并截断 `prompt`，然后 upsert 到 `app_settings`。
2. 读取全局提示词时，优先读取数据库。
3. 数据库没有记录时，读取旧 JSON 文件；如果存在有效配置，则写入数据库并返回。
4. 数据库和旧 JSON 都没有配置时，返回默认值：

```json
{
  "enabled": false,
  "prompt": ""
}
```

## 验证

- 后端单测覆盖 roundtrip、超长截断、旧 JSON 自动导入、API 兼容返回。
- runtime 注入顺序保持：全局提示词 → 智能体自带提示词 → Skill。
- 前端无需改动。

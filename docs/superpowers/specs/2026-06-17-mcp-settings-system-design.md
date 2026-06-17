# MCP 设置系统 v1 设计

## 背景

当前 AMap MCP 只在 `ClaudeSdkAgent` 中通过 `ClaudeAgentOptions.mcp_servers` 注入，启用条件仅为 `AMAP_MAPS_API_KEY` 存在。右上角设置页已经新增系统信息，但还不能查看或管理 MCP 状态。

## 目标

实现一个低风险的 MCP 设置系统 v1：平台级全局配置，当前仅 SDK 型智能体实际生效；UI 明确展示支持范围。密钥只读 env，不通过 UI 保存。

## 范围

### 后端

1. 新增非敏感 MCP 配置读写：`backend/mcp-settings.local.json`。
2. 新增 MCP 设置 API：
   - `GET /api/settings/mcp`
   - `POST /api/settings/mcp`
   - `POST /api/settings/mcp/diagnose`
3. AMap MCP 配置项：
   - `enabled: boolean`
   - `agentIds: string[]`
   - `launchMode: "auto" | "npx" | "bundled"`
4. 诊断信息：
   - secret env 名称与是否配置（不返回明文）
   - 当前平台
   - node/npm/npx 是否可用
   - bundled 入口是否存在
   - 当前 launchMode 下将选择的 command/args
   - 支持/不支持 MCP 的 agent 列表
5. `ClaudeSdkAgent` 注入 AMap MCP 时读取配置：
   - disabled → 不注入
   - 当前 agent 不在 `agentIds` → 不注入
   - 缺 `AMAP_MAPS_API_KEY` → 不注入
   - 根据 `launchMode` 选择启动方式

### 前端

在右上角设置页新增「MCP」tab：

1. 显示 `amap-maps` 状态。
2. 显示密钥状态：已配置/未配置，不显示明文。
3. 可修改：启用/禁用、启动模式、关联 agent。
4. 只允许关联支持 MCP 的 agent。当前仅 `claude-sdk` 支持。
5. 展示不支持 MCP 的 agent 及原因。
6. 提供「保存」与「运行诊断」按钮。

## 配置文件

路径：`backend/mcp-settings.local.json`

默认配置：

```json
{
  "servers": {
    "amap-maps": {
      "enabled": true,
      "agentIds": ["claude-sdk"],
      "launchMode": "auto"
    }
  }
}
```

该文件只保存非敏感配置，必须 gitignore。

## 安全约束

- 不在 UI 输入、显示或保存 MCP API key。
- 不开放任意 command/args 编辑。
- POST API 忽略或拒绝密钥字段。
- 只允许已知 server id 与枚举 launchMode。
- 只允许已知 agent id；当前只有 SDK 型 agent 可作为实际关联目标。

## 当前生效范围

- `claude-sdk`：支持 MCP 注入，AMap MCP 可实际生效。
- `assistant` / `research` / `echo`：当前不支持 MCP 注入。未来可通过 MCP Tool Adapter 扩展。

## 非目标

- 不实现 BaseAgent MCP Tool Adapter。
- 不做 MCP server 热加载/长驻连接管理。
- 不支持用户新增任意 MCP server。
- 不支持 UI 修改 API key。
- 不支持 UI 任意编辑 command/args。

## 验收

1. 无配置文件时，GET 返回默认配置。
2. 保存 enabled/agentIds/launchMode 后，GET 能读回。
3. 诊断不泄露 API key。
4. `ClaudeSdkAgent` 在 disabled、缺 key、agentIds 不包含 `claude-sdk` 时都不注入 AMap MCP。
5. `launchMode` 三种模式选择符合预期。
6. 设置页 MCP tab 可查看、修改、保存、诊断。

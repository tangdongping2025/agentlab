# MCP Tool Adapter 设计

## 背景

当前 MCP 设置是平台级配置，但实际只有 `claude-sdk` 通过 Claude Agent SDK 原生 `mcp_servers` 注入使用 AMap MCP。`assistant` / `research` 等 BaseAgent 系智能体走项目自研 LLM tool-use 循环，只能使用内部 `runtime.tools.base.Tool` 协议工具，无法直接使用 MCP server。

第三阶段目标是让 MCP 对 BaseAgent 系智能体也生效。第一版只打通 `amap-maps`，不做通用任意 MCP server 管理。

## 目标

- `assistant` / `research` 可以在 MCP 设置中被关联到 `amap-maps`。
- BaseAgent 初始化工具列表时追加当前 agent 可用的 AMap MCP adapter tools。
- AMap MCP adapter tools 对 LLM 暴露为内部工具定义，命名沿用 `mcp__amap-maps__<tool>`。
- 工具执行时调用高德 Web API 或等价 adapter，实现和 AMap MCP 同类能力的首批工具。
- 保持 `claude-sdk` 原有 MCP server 注入路径不变。
- 密钥仍只从 `AMAP_MAPS_API_KEY` 环境变量读取，UI 不输入、不保存、不显示明文。

## 非目标

- 不开放任意 MCP command / args。
- 不允许 UI 保存任何 API Key。
- 不支持用户添加任意 MCP server。
- 不一次性实现 AMap MCP 的全部工具；第一版实现最小可验证工具集。
- 不改 EchoAgent；它不是 BaseAgent，没有 LLM tool-use 循环。

## 第一版工具范围

第一版为 BaseAgent 暴露 3 个 AMap adapter tools：

1. `mcp__amap-maps__maps_geo`
   - 输入：`address: string`，`city?: string`
   - 输出：高德地理编码结果 JSON 字符串。
2. `mcp__amap-maps__maps_weather`
   - 输入：`city: string`
   - 输出：高德天气结果 JSON 字符串。
3. `mcp__amap-maps__maps_text_search`
   - 输入：`keywords: string`，`city?: string`，`types?: string`
   - 输出：高德 POI 关键词搜索结果 JSON 字符串。

说明：这不是通用 MCP stdio client，而是 AMap 专用 Tool Adapter。原因是当前项目目标是教学/理解向平台，先用最小稳定实现验证“同一个 MCP 设置影响 BaseAgent + Claude SDK Agent”的产品体验；后续可替换为真正 MCP stdio client。

## 架构

### 设置层

`backend/mcp_settings.py` 将 `SUPPORTED_MCP_AGENT_IDS` 扩展为：

- `claude-sdk`
- `assistant`
- `research`

Settings API 继续返回每个 agent 的 `supportsMcp` 和 `unsupportedReason`。`echo` 仍显示不支持，因为它没有 BaseAgent 工具循环。

默认 `agentIds` 仍可保持 `['claude-sdk']`，避免新功能自动改变现有 BaseAgent 行为。用户可在 MCP tab 手动勾选 `assistant` / `research`。

### Adapter 层

新增 `backend/runtime/tools/mcp_amap.py`，职责：

- 读取 `load_mcp_settings()`。
- 检查 server 是否 enabled。
- 检查当前 agent 是否在 `agentIds`。
- 检查 `AMAP_MAPS_API_KEY` 是否存在。
- 返回当前 agent 可用的 AMap Tool 实例列表。

每个 Tool 实现 `runtime.tools.base.Tool` 协议：

- `name`
- `description`
- `input_schema`
- `async execute(**params) -> str`

执行通过 `httpx.AsyncClient` 调用高德 HTTPS API，返回 JSON 字符串。错误统一返回可读错误字符串，避免打断 BaseAgent 主循环。

### BaseAgent 接入层

`backend/runtime/base_agent.py` 的 `__init__()` 在现有 `tool_names` 工具之外追加：

```python
get_mcp_tools_for_agent(self.metadata.id)
```

后续 `_tool_defs` / `_tool_map` / `run()` tool-use 循环保持不变。

### Claude SDK 路径

`backend/runtime/claude_sdk_agent.py` 不改或仅随 settings 支持范围自然兼容。`claude-sdk` 继续通过 `ClaudeAgentOptions(mcp_servers=...)` 使用原生 MCP server。

## UI 行为

现有 MCP tab 自动使用 Settings API 返回的支持范围。扩展后：

- `assistant` / `research` 显示为支持 MCP。
- `echo` 显示为暂不支持，原因是“不具备 LLM tool-use 循环”。
- 保存 payload 仍只有 `enabled` / `agentIds` / `launchMode`。
- 密钥仍只显示“已配置/未配置”。

## 测试策略

- `test_mcp_settings.py`
  - `assistant` / `research` 不再被过滤。
  - `echo` 仍被过滤。
  - secret 字段仍不会保存/返回明文。
- `test_tool_system.py` 或新增 `test_mcp_amap_tools.py`
  - 无 key / disabled / agent 未选择时返回空工具。
  - agent 选择且 key 存在时返回 3 个工具。
  - mock httpx 验证 `maps_geo` 调用参数和返回 JSON。
- `test_base_agent.py`
  - BaseAgent 子类在 MCP enabled 且选择当前 agent 时，tool definitions 包含 AMap adapter tools。
  - 模拟 provider 触发 `mcp__amap-maps__maps_geo` tool_use，BaseAgent 能 emit TOOL_CALL / TOOL_RESULT。
- 前端
  - `npm run typecheck`
  - `npm run build`

## 验收标准

- MCP 设置页可勾选 `assistant` / `research`。
- `assistant` 或 `research` 被勾选且 `AMAP_MAPS_API_KEY` 已配置时，其工具定义包含 AMap adapter tools。
- `claude-sdk` 原有 MCP 行为不回归。
- UI 不显示、不输入、不保存任何密钥。
- 自动测试通过。

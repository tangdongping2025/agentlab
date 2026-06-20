# 龙虾 Agent MCP Tab 设计

## 目标

在龙虾 Agent 工作区的 `对话 / 文件 / Skill` 旁新增 `MCP` tab，用于展示当前智能体可使用的 MCP server、启用状态和运行诊断信息。

## 范围

- 龙虾 Agent tabs 扩展为 `对话 / 文件 / Skill / MCP`。
- MCP tab 读取现有 `/api/settings/mcp` 和 `/api/settings/mcp/diagnose`。
- 首版只读展示，不在工作区内编辑 MCP 配置。
- 每个 MCP server 展示：名称、启用状态、是否分配给龙虾、secret 是否配置、launchMode、支持的 agent、诊断命令、运行环境和错误信息。
- 提供“刷新诊断”按钮，手动重新请求诊断结果。

## 约束

- 不新增 MCP server 注册机制；沿用现有高德地图 MCP 配置。
- 不暴露 secret 值，只显示是否已配置。
- 不改变 MCP 注入逻辑；龙虾实际可用 MCP 仍由后端 `load_mcp_settings()` 和环境变量决定。
- 若诊断失败，页面显示错误提示，不阻断对话和文件功能。

## 验收

- 龙虾 Agent metadata 返回 `MCP` tab。
- 点击 `MCP` tab 后能看到高德地图 MCP 卡片。
- 卡片能显示“已分配给龙虾/未分配给龙虾”、secret 配置状态、launchMode 和诊断命令。
- “刷新诊断”会调用诊断 API 并更新展示。

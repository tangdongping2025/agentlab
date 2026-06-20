# 手机窄屏对话窗口精简模式设计

## 目标

在手机窄屏下把垂直空间优先留给龙虾 Agent 对话窗口。

## 范围

- 当视口宽度不超过 768px 时隐藏顶部 `AGENT LAB` header。
- 当视口宽度不超过 768px 时隐藏 Agent workspace 的 tabbar（`对话 / 文件 / Skill / MCP`）。
- 当视口宽度不超过 768px 时隐藏 ChatWorkspace 顶部的龙虾 Agent 名称、描述和按钮行。
- 保留消息区、输入框、发送/停止按钮。

## 非目标

- 不新增移动端抽屉或更多菜单。
- 不改变桌面端布局。
- 不改后端和 Agent runtime 数据流。

## 验收

- 相关区域具备可被 media query 命中的 class。
- 桌面端仍渲染原有 header、tabbar、ChatWorkspace header。
- CSS 中存在 `@media (max-width: 768px)`，隐藏上述三类区域。

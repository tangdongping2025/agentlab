---
name: RQ-017 对话区域场景选择功能
version: "1.0.0"
date: 2026-05-16
status: approved
---

# RQ-017：对话区域场景选择功能

## 目标

在对话输入区域添加场景选择按钮，让用户无需打开侧栏即可快速切换场景。

## 现状

- 场景选择仅在左侧 ConfigSidebar 的 SceneCards 中，对话输入区域无场景信息
- 切换场景必须展开侧栏，操作路径长
- ToolSelectorBar 已有类似的"点击弹出上拉菜单"交互模式

## 设计

### 位置

输入框左侧，ToolSelectorBar 的左边：`[场景选择] [工具选择] [输入框]`

### UI

- 按钮：显示当前场景图标+名称，如 `🍽️ 餐厅预订`
- 点击弹出上拉菜单，列出所有场景，当前场景高亮
- 选择场景后自动切换（调用 store 的 `setScene`）

### 交互

与 ToolSelectorBar 一致：
- 点击按钮展开/收起菜单
- 点击菜单外部关闭
- 选中场景后菜单自动关闭

### 数据流

复用 store 已有的 `scenes`、`currentScene`、`setScene`，无需新增状态。

## 改动范围

仅修改 `context-lab/src/components/ChatInteraction.tsx`。

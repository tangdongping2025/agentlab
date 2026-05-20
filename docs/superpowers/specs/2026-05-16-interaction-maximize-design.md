---
name: RQ-016 交互过程区域最大化按钮
version: "1.0.0"
date: 2026-05-16
status: approved
---

# RQ-016：交互过程区域最大化按钮

## 目标

在 BottomPanel 的"交互过程"栏添加最大化按钮，点击后以全屏弹窗方式展示交互过程详情，解决信息密集时区域太小看不清楚的问题。

## 现状

- BottomPanel 三栏布局（Token 分配 / 策略对比 / 交互过程），交互过程栏 `flex: 1.2`
- 高度受 `var(--bottom-panel-height)` 限制，展开步骤详情后空间不足
- TimelineReplay 已支持动态步骤和内联展开详情
- DetailModal 已有全屏弹窗的模式

## 设计

### 触发方式

在"交互过程"栏标题行右侧添加 ⛶ 最大化图标按钮。

### 最大化展示

点击最大化按钮后：
- 弹出全屏模态框，覆盖整个页面（z-index: 50）
- 模态框内渲染完整的 TimelineReplay（含 StepDetailPanel）
- "查看完整报文"按钮打开的 DetailModal 在全屏模态框之上（z-index: 51）

### 关闭方式

- 点击模态框右上角 × 按钮
- 按 ESC 键关闭

### 样式

- 模态框背景：`rgba(0,0,0,0.7)`
- 内容区背景：`var(--bg-base)`
- 标题栏：显示"交互过程"标题 + × 关闭按钮
- 内容区域占满模态框剩余空间，支持滚动

### 数据流

- 无需新增 store 状态
- 模态框的打开/关闭由 BottomPanel 的本地 `useState` 管理
- TimelineReplay 和 StepDetailPanel 完全复用现有 props 机制

## 改动范围

仅修改 `context-lab/src/components/BottomPanel.tsx`：
- 添加 `isMaximized` 本地 state
- 在"交互过程"栏标题旁添加 ⛶ 按钮
- 添加全屏模态框 JSX
- 模态框内渲染 TimelineReplay + DetailModal

无需修改 TimelineReplay、StepDetailPanel、Store、agentService。

## 乔布斯设计理念合规

| 原则 | 合规 |
|------|------|
| 极简 | 按钮只在标题行出现，不占用内容区空间 |
| 专注 | 最大化后只展示交互过程，无干扰 |
| 直觉 | ⛶ 是通用的最大化图标 |
| 一致性 | 模态框样式与 DetailModal 统一 |

---
name: RQ-018 全局字体大小调整
version: "1.0.0"
date: 2026-05-16
status: approved
---

# RQ-018：全局字体大小调整

## 目标

将应用中所有字号统一提升 2px，解决字体过小、看不清楚的问题。

## 现状

- 所有字体大小为硬编码像素值，分布在 15 个组件中
- 最常用字号 10px（40+ 处）和 11px（15+ 处），在深色背景上难以阅读
- 9px 出现 3 处（时间戳、徽章），几乎无法辨认
- 无 CSS 变量或设计令牌层，全部为 inline `fontSize`

## 设计

### 调整规则

每个 fontSize 值 +2px，28px 页面标题保持不变：

| 当前 | 调整后 | 语义角色 | 影响组件数 |
|------|--------|---------|-----------|
| 9px | 11px | 时间戳、徽章 | 3 |
| 10px | 12px | 标签、代码、小文字 | 40+ |
| 11px | 13px | 元数据、monospace | 15+ |
| 12px | 14px | 名称、按钮、次要文字 | 10+ |
| 13px | 15px | 消息正文 | 2 |
| 14px | 16px | 标题、正文 | 5+ |
| 15px | 17px | 模态框标题 | 2 |
| 16px | 18px | 图标、关闭按钮 | 4 |
| 28px | 28px | 页面标题（不变） | 1 |

### 不做的事

- **不引入 CSS 变量层**：当前目标是调大字体，不是重构设计系统
- **不改为 rem/em**：保持 px 与现有代码一致
- **不改 Tailwind text-sm/text-lg**：PromptEditor 和 ToolSelector 的 Tailwind 类不变（14px 和 18px 已在合理范围）

## 改动范围

逐个替换 15 个组件中的 inline `fontSize` 值：

- BottomPanel.tsx
- ChatInteraction.tsx
- ContextSizePresets.tsx
- DetailModal.tsx
- SceneCards.tsx
- SceneEditModal.tsx
- SettingsModal.tsx
- StepDetailPanel.tsx
- StrategyComparator.tsx
- TimelineReplay.tsx
- TokenAllocation.tsx
- ToolSelectorBar.tsx
- SessionList.tsx
- WelcomeScreen.tsx

# 工具配置区域默认收缩优化 Design Spec

**RQ-008** - 工具配置区域默认收缩优化

## Overview

**Goal:** 使工具配置区域默认为收缩状态，具有类似RQ-006和RQ-007的展开/收起功能，在需要时可以展开查看详细配置。

**Priority:** High  
**Estimated Time:** 0.5天

## Problem

工具配置区域当前占用空间较大，而用户在大部分情况下不需要查看工具配置，因此应该默认为收缩状态，节省界面空间，提升用户体验。

## Solution

为工具配置区域添加可收起/展开功能，类似API交互过程和系统提示词编辑器的设计。

### Architecture
- 使用React的useState管理展开/收起状态
- 显示工具配置区域的简要信息（工具数量）
- 点击时展开显示详细配置
- 默认收缩状态

### Components Affected
- `context-lab/src/components/ToolSelector.tsx`（可能是包含工具配置的组件）

## Requirements

### Functional Requirements
1. 工具配置区域默认为收缩状态
2. 显示工具配置区域的摘要（如工具数量）
3. 点击时有动画效果的展开/收起
4. 收起时显示箭头图标，指示可以展开
5. 展开时显示所有工具配置选项

### Design Requirements
1. 清晰的视觉层次
2. 一致的交互样式（与RQ-006和RQ-007保持一致）
3. 响应式设计

### Technical Requirements
1. 使用React `useState`进行状态管理
2. 使用Tailwind CSS进行样式设计
3. 添加适当的测试覆盖

---

## User Story

**As a user,**  
**I want** the tool configuration section to be collapsed by default,  
**So that** I can focus on other sections of the interface, and only expand the tool configuration when I need to adjust settings.

---

## Acceptance Criteria

- [ ] 工具配置区域在页面加载时默认为收缩状态
- [ ] 显示工具配置的摘要信息（如工具数量）
- [ ] 点击时平滑展开显示所有工具配置
- [ ] 再次点击可以收起
- [ ] 使用与RQ-006和RQ-007类似的箭头图标指示状态

---

## Technical Approach

### State Management
```typescript
const [isToolConfigExpanded, setIsToolConfigExpanded] = useState(false);
```

### Collapsed View
- 显示工具配置区域标题
- 显示工具数量
- 显示箭头图标

### Expanded View
- 显示所有工具配置选项
- 保持原有的功能不变

---

## Related Requirements

- **RQ-006** - API交互过程默认收缩优化
- **RQ-007** - 系统提示词区域默认收缩优化

---

## 设计验证

- ✅ 与RQ-006和RQ-007保持一致的交互风格
- ✅ 不影响现有功能的可用性
- ✅ 提升了界面空间的利用率
- ✅ 提供了更好的用户体验

---

**Created:** 2026-05-15  
**Status:** 📝 待开始

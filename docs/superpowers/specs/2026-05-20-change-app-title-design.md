---
name: RQ-037 设计规格
description: 把左侧上面的Context Lab改成agent lab（全大写 AGENT LAB）
---

# RQ-037 设计规格

## 需求概述

将界面左侧顶部的标题从 "Context Lab" 改为 "AGENT LAB"（全大写）。

## 修改内容

### 目标文件
- `src/App.tsx`

### 具体修改
- **位置**：第89行
- **原内容**：`<span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>Context Lab</span>`
- **新内容**：`<span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>AGENT LAB</span>`

## 影响范围

### 仅修改
- 用户看到的界面标题

### 不修改
- 项目文档中的 "Context Lab" 文本
- `CLAUDE.md` 中的项目名称
- 跟踪矩阵中的项目名称
- 其他任何文件中的 "Context Lab" 文本

## 方案选择

采用 **方案 A**：直接替换文本。这是最小改动，风险低，适合这种简单的文本修改。

## 验收标准

- 界面左侧顶部显示 "AGENT LAB"（全大写）
- 样式保持不变（字体、大小、间距等）
- 功能无任何影响

## 任务清单

1. 修改 `src/App.tsx` 中的标题文本
2. 验证修改正确显示
3. Git Commit


# RQ-021 优化对话窗口的体验

## 概述

AI 回复消息目前以纯文本显示，无段落分隔、无标题、无加粗、无代码块渲染。需要为 assistant 消息添加标准 Markdown 渲染，使 AI 回复具备可读性和结构化展示。

## 痛点

- AI 回复无段落，长文本挤成一团
- 标题、加粗、斜体等格式丢失
- 代码块无区分，与正文混在一起
- 无法复制代码内容

## 需求范围

### 包含

- AI（assistant）消息的标准 Markdown 渲染
- 支持语法：段落、标题(h3/h4)、加粗、斜体、行内代码、代码块、有序/无序列表、引用、链接
- 代码块带复制按钮
- 代码块水平滚动
- 用户消息保持纯文本显示不变

### 不包含

- 代码语法高亮（后续可扩展）
- 数学公式渲染
- 用户消息 Markdown 渲染
- 表格渲染（GFM 表格支持但非重点）

## 技术方案

### 依赖

```
react-markdown
remark-gfm
```

### 组件架构

新增 4 个组件，从 ChatInteraction.tsx 中提取：

```
ChatInteraction.tsx（瘦身）
├── MessageList.tsx（新）消息列表容器
│   └── MessageBubble.tsx（新）单条消息气泡
│       └── MarkdownRenderer.tsx（新）AI 消息 Markdown 渲染
│           └── CodeBlock.tsx（新）代码块 + 复制按钮
└── ChatInput.tsx（提取）输入区域
```

### 组件职责

#### MarkdownRenderer

- Props: `{ content: string }`
- 使用 react-markdown 渲染，配置 remark-gfm 插件
- 自定义 `components` 属性覆盖 `pre` 和 `code` 渲染器
- 有语言标签的 `<pre><code className="language-xxx">` → 交给 CodeBlock 渲染
- 无语言标签的行内 `<code>` → 渲染为行内代码样式

#### CodeBlock

- Props: `{ language?: string; children: string }`
- 顶部栏：左侧显示语言标签（无则不显示），右侧显示复制按钮
- 复制按钮：点击 → `navigator.clipboard.writeText(children)` → 按钮文字变"已复制" → 1.5秒后恢复
- 内容区：深色背景，等宽字体 13px，横向滚动（overflow-x: auto）
- Loading 状态：复制按钮在 isLoading 时禁用

#### MessageList

- Props: `{ messages: ConversationMessage[]; onToggleDetail: (index: number) => void; expandedBubble: number | null }`
- 从 ChatInteraction.tsx 提取消息列表渲染逻辑
- 保持现有 scrollToBottom 行为
- 消息使用 message.id 或 `${message.role}-${index}` 作为 key（替代纯 index）

#### MessageBubble

- Props: `{ message: ConversationMessage; index: number; isExpanded: boolean; onToggleDetail: () => void }`
- 根据 `message.role` 选择渲染路径：
  - `user` → 纯文本显示（保持现有样式）
  - `assistant` → MarkdownRenderer 渲染
- 保持现有气泡样式（头像、对齐、圆角）
- 保持现有"..."详情按钮和辅助面板

### 数据流

```
appStore.conversationHistory
  → MessageList (map)
    → MessageBubble (per message)
      → role === 'user' ? 纯文本 : MarkdownRenderer
        → code block ? CodeBlock : 行内代码
```

## 样式规格

### MarkdownRenderer 内部样式

| 元素 | 样式 |
|------|------|
| 段落 | line-height: 1.7, margin-bottom: 10px, word-break: break-word |
| 标题 h3 | font-size: 16px, font-weight: 600, color: #2c3e50, margin-top: 12px, margin-bottom: 8px |
| 标题 h4 | font-size: 14px, font-weight: 600, color: #2c3e50, margin-top: 10px, margin-bottom: 6px |
| h1/h2 | 降级为 h3（font-size: 16px, 同 h3 样式） |
| 加粗 | font-weight: 600, color: #2c3e50 |
| 斜体 | font-style: italic |
| 行内代码 | background: #e8e8e8, padding: 2px 6px, border-radius: 3px, font-family: 'Fira Code', Consolas, monospace, font-size: 0.9em |
| 有序/无序列表 | padding-left: 20px, margin: 6px 0, li margin-bottom: 4px |
| 引用 | border-left: 3px solid #667eea, padding-left: 12px, background: #f9f9f9, margin: 10px 0, color: #666 |
| 链接 | color: #667eea, text-decoration: none, hover: underline |
| 分隔线 | border: none, border-top: 1px solid #e0e0e0, margin: 16px 0 |

### CodeBlock 样式

| 部分 | 样式 |
|------|------|
| 容器 | background: #1e1e2e, border-radius: 8px, overflow: hidden, margin: 10px 0 |
| 顶栏 | background: #2d2d3f, padding: 6px 12px, display: flex, justify-content: space-between, align-items: center |
| 语言标签 | font-size: 11px, color: #999, text-transform: lowercase |
| 复制按钮 | font-size: 12px, color: #7ec8e3, cursor: pointer, hover: color #27ae60 |
| 复制按钮(已复制) | color: #27ae60, 1.5秒后恢复 |
| 代码内容 | padding: 12px, color: #cdd6f4, font-family: 'Fira Code', Consolas, monospace, font-size: 13px, overflow-x: auto, white-space: pre |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/MarkdownRenderer.tsx` | 新增 | react-markdown + remark-gfm，自定义 pre/code 渲染器 |
| `src/components/CodeBlock.tsx` | 新增 | 代码块容器 + 语言标签 + 复制按钮 |
| `src/components/MessageList.tsx` | 新增 | 从 ChatInteraction 提取消息列表 |
| `src/components/MessageBubble.tsx` | 新增 | 单条消息气泡，区分 user/assistant 渲染路径 |
| `src/components/ChatInteraction.tsx` | 修改 | 提取消息列表和输入区域，使用新组件 |
| `src/components/ChatInput.tsx` | 新增(提取) | 从 ChatInteraction 提取输入区域 |
| `package.json` | 修改 | 添加 react-markdown, remark-gfm |

## 安全考虑

- react-markdown 默认不渲染原始 HTML（需要 rehype-raw 才启用），本项目不引入 rehype-raw，避免 XSS
- CodeBlock 复制使用 `navigator.clipboard.writeText`，不涉及 execCommand

## 设计理念合规检查（乔布斯五原则）

| 原则 | 合规 |
|------|------|
| 极简 | ✅ 仅添加 Markdown 渲染，不添加多余交互。代码块复制按钮是必要功能而非装饰 |
| 专注 | ✅ 一个组件一个职责：MarkdownRenderer 只管渲染，CodeBlock 只管代码块 |
| 直觉 | ✅ 代码块复制按钮位置固定（右上角），行为标准（点击→已复制→恢复） |
| 一致性 | ✅ 使用项目已有的颜色变量（#667eea 主色、#2c3e50 文字色），样式与现有气泡风格统一 |
| 工匠精神 | ✅ 标题降级处理（h1→h3）避免气泡内标题过大；行内代码和代码块分别处理不混用 |

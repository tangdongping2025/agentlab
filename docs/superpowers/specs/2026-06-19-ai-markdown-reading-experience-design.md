# AI 回复 Markdown 阅读体验专业化设计

## 背景

当前 `ChatWorkspace` 的 AI 回复已经通过 `react-markdown` 渲染，但 `Markdown.tsx` 只设置了基础字号、行高和代码块映射，标题、段落、列表、引用、表格等元素基本依赖浏览器默认样式。实际观感接近普通文本排列，和元宝、DeepSeek 类产品的结构化阅读体验有明显差距。

## 目标

把 AI 回复从“能解析 Markdown”提升为“适合长文阅读的 Markdown 文章卡”，让分析、方案、总结类回答具备清晰的视觉层级和阅读节奏。

## 范围

1. AI 回复使用“元宝式文章卡”视觉：浅色内容卡片、细边框、圆角、舒适内边距和合适阅读宽度。
2. Markdown 元素提供显式样式：
   - 标题：`h1` 降级为文章内标题，`h2/h3` 层级清晰，间距稳定。
   - 段落：统一行高、段间距和首尾 margin。
   - 列表：缩进清楚，列表项有适度间距。
   - 引用：左侧强调线 + 浅色背景提示块。
   - 表格：外层横向滚动，表头背景，单元格边框和内边距。
   - 分割线：弱化颜色，形成章节节奏。
   - 链接：使用项目强调色，并在新窗口打开；必须设置 `rel="noopener noreferrer"`。
   - 行内代码：保留轻量背景与等宽字体。
3. 代码块继续使用现有 `CodeBlock`，保留高亮和复制能力。
4. 流式 AI 回复和历史 AI 回复使用同一套文章卡视觉。
5. 用户消息保持右侧蓝色纯文本气泡，不进行 Markdown 渲染。

## 设计

### 组件边界

- `src/components/agentRuntime/Markdown.tsx`
  - 保留 `react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`。
  - 扩展 `components` 映射，为 Markdown 结构元素提供显式样式。
  - 不启用 raw HTML 渲染，避免 XSS 风险。

- `src/components/agentRuntime/MessageBubble.tsx`
  - assistant 分支增加文章卡容器。
  - 复制/重新生成操作栏保留在卡片底部，视觉弱化但可发现。

- `src/components/agentRuntime/ChatWorkspace.tsx`
  - 流式回复不再裸渲染 `Markdown`，改为复用 assistant 消息文章卡结构，保证流式和历史消息一致。

### 视觉规格

- AI 文章卡：
  - 背景：`var(--bg-surface)`。
  - 边框：`1px solid var(--border-subtle)`。
  - 圆角：`12px`。
  - 内边距：`14px 16px`。
  - 最大宽度：阅读区不超过当前消息列宽，保持 `maxWidth: 88%`。

- Markdown 正文：
  - 字号：`14px`。
  - 行高：`1.75`。
  - 颜色：`var(--text-primary)`。

- 标题：
  - `h1/h2`：`18px`，`font-weight: 700`，上间距 `14px`，下间距 `8px`。
  - `h3`：`16px`，`font-weight: 650`，上间距 `12px`，下间距 `6px`。
  - 第一个标题不增加额外上间距。

- 段落与列表：
  - 段落 margin：`0 0 10px`。
  - 列表 margin：`6px 0 10px`，左侧 padding `22px`。
  - 列表项 margin：`4px 0`。

- 引用：
  - 左边框：`3px solid var(--accent-blue)`。
  - 背景：`var(--bg-deep)`。
  - 内边距：`8px 12px`。
  - 圆角：`8px`。

- 表格：
  - 外层 `overflowX: auto`。
  - 表格宽度 `100%`，边框折叠。
  - 表头背景 `var(--bg-deep)`。
  - 单元格边框 `1px solid var(--border-subtle)`。
  - 单元格 padding `8px 10px`。

## 非目标

- 不修改模型 prompt 或强制输出模板。
- 不新增对话模板配置。
- 不改变 agent runtime、SSE、消息持久化或历史恢复逻辑。
- 不改变用户消息渲染方式。
- 不引入新的设计系统或主题变量。
- 不新增第三方依赖。

## 验收

- AI 回复中的 Markdown 标题、列表、引用、表格、分割线呈现出明显结构层级。
- AI 历史消息和流式消息视觉一致。
- 代码块高亮和复制按钮仍可用。
- 用户消息仍保持纯文本气泡。
- 普通模式和全屏模式都使用同一套 AI 文章卡样式。
- TypeScript 检查通过。
- 浏览器中使用包含标题、列表、引用、表格和代码块的回复样例进行人工验收，观感不再像普通文本堆叠。

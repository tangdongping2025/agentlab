# ChatWorkspace 对话窗口专业化 设计

## 背景

ChatWorkspace(workspace tabs 的 tab1 对话)当前是朴素文本气泡(`whiteSpace: pre-wrap`),无 markdown 渲染、无代码高亮、无消息操作。用户要做成专业对话窗口(参考元宝/deepseek)。

**现有依赖**:`package.json` 已有 `react-markdown@10` + `remark-gfm@4`(未启用)→ markdown 渲染零新依赖。无代码高亮库、无 LaTeX 库。

## 目标

ChatWorkspace 渲染专业化:markdown 渲染 + 代码块高亮复制 + 流式平滑 + 消息操作栏(复制/重新生成)+ LaTeX 公式 + 头像卡片视觉 + 字号规范。

## 需求

### R1: markdown 渲染
- AI 消息用 `react-markdown` + `remark-gfm` 渲染:标题/列表/表格/链接/粗体/引用。
- 用户消息保持纯文本气泡(不渲染 markdown,用户输入原样)。
- 流式消息(`workspaceStreaming`)实时渲染(部分文本也能渲染,边收边显示)。

### R2: 代码块高亮 + 复制
- `CodeBlock` 组件:`react-syntax-highlighter`(prism 主题,多语言高亮)。
- 顶部:语言标识 + 「复制」按钮(`navigator.clipboard.writeText`,复制后短暂显示"已复制")。
- 代码块横向滚动(不换行),等宽字体。

### R3: 流式平滑
- 流式 delta 实时走 markdown 渲染。
- 平滑 = `React.memo` + 稳定 key,避免每个 delta 整块重渲染闪烁。
- **不做逐字延迟打字机** —— delta 流式本身已是打字机效果,逐字延迟反而卡顿。

### R4: 消息操作栏
- AI 消息底部 hover 出现操作按钮:「复制」(复制整条 AI 回复,`navigator.clipboard`)、「重新生成」。
- 重新生成:`store.regenerateLast` —— 取最后一条 user 消息重发,替换最后一条 assistant 回复(流式覆盖)。

### R5: LaTeX 公式
- `remark-math` + `rehype-katex` + katex CSS。
- `$...$` 行内、`$$...$$` 块公式。

### R6: 头像 + 卡片视觉
- 参考 deepseek:AI 消息左对齐卡片(头像 + markdown 块,全宽阅读区);用户消息右对齐气泡。
- 复用现有 CSS 变量(`--bg-surface`/`--bg-deep`/`--accent-blue`/`--text-primary` 等),不引新设计系统。

### R7: 字号规范
- 消息正文 14px;代码块、输入框 13px。
- 当前消息未设字号、继承偏大默认值,显式设定。

## 架构

- `ChatWorkspace.tsx`:消息列表渲染改造,AI 消息走 Markdown,抽 `MessageBubble`。
- 新 `MessageBubble.tsx`:单条消息(角色头像 + 内容渲染 + 操作栏)。
- 新 `CodeBlock.tsx`:`react-markdown` 的 `components.code` 自定义,高亮 + 复制。
- `agentRuntimeStore.ts`:加 `regenerateLast()`(取最后 user msg 重发,替换最后 assistant)。

## 依赖新增(4 + types)
- `react-syntax-highlighter` + `@types/react-syntax-highlighter`(代码高亮)
- `remark-math` + `rehype-katex`(LaTeX 解析)
- `katex`(LaTeX 渲染 + CSS)

## 测试(TDD)
- `CodeBlock`:复制逻辑(clipboard 调用)、语言标识。
- `MessageBubble`:角色渲染(AI markdown / 用户纯文本)、操作栏显隐、复制调用。
- `regenerateLast`:store 逻辑(取最后 user msg、重发、替换最后 assistant)—— mock runAgent。
- markdown/katex 渲染本身靠库,不单测。

## 关键约束
- 流式渲染不闪烁(memo + 稳定 key)
- 代码块不换行(横向滚动)
- 重新生成替换最后 assistant(不追加新条)
- 字号显式设定(不靠继承)

## 非目标
- 逐字延迟打字机(明确不做,见 R3)
- 新设计系统/主题切换(复用现有 CSS 变量)
- 对话级一键导出(本次不做,可后续)
- 用户消息渲染 markdown(用户输入原样纯文本)
- 编辑消息(只读 + 重新生成)

# 手机端长代码块撑爆 ChatWorkspace panel 修复 — 规格设计

## 问题(根因)

手机端多次对话后,一旦 AI 回复含多行代码块(尤其长单行:压缩 JS / 长 URL / 长命令),**消息区右侧 + 发送按钮的右半边一起"看不见"**。不弹软键盘、与任务面板无关。

根因链(三因素叠加):

1. `CodeBlock.tsx` 的 `react-syntax-highlighter` 渲染 `<pre white-space:pre>`,长代码行不换行,固有超宽
2. CodeBlock 外层 div `overflow:'hidden'` 但**无 `maxWidth`**,未约束自身宽度
3. 移动端 flex 链 `min-width:auto` + ChatWorkspace 消息 viewport 只设 `overflowY:'auto'`、**未显式 `overflowX`**(iOS Safari 等将其退化为 visible)

→ 超宽 `<pre>` 层层撑出 ChatWorkspace panel,被 `AgentRuntimeView` 中间 row 的 `overflow:hidden` 齐齐切右半。

## 已排除(非根因)

- 软键盘 + 100vh(用户确认不弹键盘也复现)
- SessionTaskNavigator 浮层(用户确认无关)
- viewport meta(正常 `width=device-width, initial-scale=1.0`)
- 长 URL / inline code / 表格:`overflow-wrap` 是 CSS 继承属性,MessageBubble 内容区 `overflowWrap:'anywhere'`(MessageBubble.tsx:235)兜住;表格已有 `overflowX:'auto'` 包裹(Markdown.tsx:96)

## 修法(最小集)

### 1. `CodeBlock.tsx`(根因主修)

- 外层 div 加 `maxWidth: '100%'`(`overflow:hidden` 保留以裁圆角)
- `SyntaxHighlighter` 外包一层 `<div style={{ overflowX:'auto', maxWidth:'100%' }}>`,让 `<pre>` 在块内横滚,固有超宽不再外溢

### 2. `ChatWorkspace.tsx`(防御)

- 消息 viewport(ChatWorkspace.tsx:298)显式补 `overflowX: 'auto'`,兜底移动端 `overflowX` 退化为 visible,防未来其他超宽源再撑爆

## 不做(YAGNI / surgical)

- 不改 `Markdown.tsx`(inline code / URL / 表格均已正确处理)
- 不加 flex 链全局 `minWidth:0`(当前无其他超宽源,过度)
- 桌面端零影响(桌面宽,代码块本就横滚)

## 体验决策

多行代码块的长行:**块内横向滚动**(保代码原格式,GitHub / VSCode 行业惯例)。移动端需双指横滑看全行,可接受。

inline code / 长 URL / 普通长文本:沿用既有 `overflow-wrap:anywhere`,自动换行,无需改。

## 测试

- **单元**:`CodeBlock` 渲染含超长单行代码的输入,断言外层 `maxWidth:'100%'` 与内层 `overflowX:'auto'` 的 style 生效(jsdom 测不了真实横向溢出,断言 style 而非布局几何)
- **实测**:dev server(5173)+ Chrome 移动模拟,塞含长代码的消息,确认右侧消息 + 发送按钮均不再被切

## 风险

- 代码块横滑在移动端的发现性(行业惯例,可接受)
- jsdom 无法验证真实横向溢出几何,以 style 断言为准

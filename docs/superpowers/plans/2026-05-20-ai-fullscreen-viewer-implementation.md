# RQ-034 实现计划：AI 回复全屏查看功能

## 任务清单

### T1：创建 FullscreenViewer 组件

**新建文件**：`src/components/FullscreenViewer.tsx`

**具体步骤**：
1. 接收 props：`content: string`、`onClose: () => void`
2. 渲染全屏模态层：
   - 外层：`position: fixed, inset: 0, z-index: 1000, background: rgba(0,0,0,0.7)`，点击背景关闭
   - 内层：居中白色卡片，`max-width: 900px, max-height: 90vh, overflow-y: auto, border-radius: 12px, padding: 32px`
   - 右上角关闭按钮 ✕
3. 用 MarkdownRenderer 渲染 content
4. useEffect 监听 ESC 键关闭
5. 打开时禁止背景滚动（document.body.style.overflow = 'hidden'），关闭时恢复

### T2：MessageBubble 添加全屏按钮 + ChatInteraction 管理全屏状态

**修改文件**：`src/components/MessageBubble.tsx`、`src/components/ChatInteraction.tsx`

**具体步骤**：
1. MessageBubble 接收新 prop：`onFullscreen: (content: string) => void`
2. AI 气泡右上角添加 🔍 全屏按钮（与 💾 保存按钮并列，同样 hover 显现）
3. ChatInteraction 添加 state：`fullscreenContent: string | null`
4. 传入 `onFullscreen` 回调给 MessageBubble：`setFullscreenContent(content)`
5. fullscreenContent 不为 null 时渲染 `<FullscreenViewer content={fullscreenContent} onClose={() => setFullscreenContent(null)} />`

**验证**：
- AI 回复 hover 时右上角出现 🔍 和 💾 两个按钮
- 点击 🔍 → 全屏模态层展示 Markdown 内容
- ESC 或点击关闭按钮 → 关闭模态层
- 点击背景遮罩 → 关闭模态层
- 全屏内容可滚动

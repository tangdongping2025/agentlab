# RQ-032 优化首页内容 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 默认进入新建对话 + 能力清单轮播欢迎页

**Architecture:** 新建 WelcomePage 组件，ChatIntegration 在空对话时显示它，appStore 不再恢复 lastSessionId

**Tech Stack:** React 18、CSS-in-JS（内联样式，与现有代码一致）

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `context-lab/src/stores/appStore.ts` | loadUserConfig 不恢复 currentSessionId |
| 新建 | `context-lab/src/components/WelcomePage.tsx` | 欢迎页：标题 + 轮播卡片 + 输入框 |
| 修改 | `context-lab/src/components/ChatInteraction.tsx` | 空对话时显示 WelcomePage，输入事件传给 WelcomePage |

---

### Task 1: 修改 appStore 默认不恢复上次会话

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 注释掉 currentSessionId 恢复逻辑**

在 `loadUserConfig` 中，注释掉恢复 `currentSessionId` 的整段代码（约第 744-766 行）。改为：

```typescript
      // 不恢复上次会话，每次打开都是新建对话
      // if (config.currentSessionId) {
      //   const session = sessionService.getById(config.currentSessionId);
      //   ...
      // }
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts && git commit -m "feat(RQ-032/T1): default to new conversation on app load"
```

---

### Task 2: 创建 WelcomePage 组件

**Files:**
- Create: `context-lab/src/components/WelcomePage.tsx`

- [ ] **Step 1: 创建 WelcomePage.tsx**

将预览文件 `public/welcome-preview.html` 的设计和逻辑移植为 React 组件，使用内联样式（与项目现有风格一致）。关键差异：

1. 卡片数据提取为 `CAPABILITIES` 常量数组，每项包含：`icon`、`title`、`desc`、`color`、`featured`、`action`
2. 接受 `onSend` 回调 prop，输入框回车或点击发送按钮时调用
3. 轮播逻辑用 `useState` + `useEffect`(auto-rotate) + `useRef`(pause)
4. 每页 3 个卡片，从 `CAPABILITIES` 数组自动分页

20 个能力数据：

```typescript
const CAPABILITIES = [
  { icon: '🔍', title: '联网搜索', desc: '23 个垂直领域实时搜索，金融行情、代码仓库、学术论文一键查询', color: 'cyan', featured: true, action: '选择投资助手或研究分析场景 →' },
  { icon: '💭', title: '深度思考', desc: '模型先思考再回答，推理过程透明可见，预算可调', color: 'amber', featured: true, action: '点击💡深度思考按钮开启 →' },
  { icon: '🧠', title: '4 种上下文策略', desc: '完整记忆 / 滑动窗口 / 摘要记忆 / 无记忆，控制对话记忆范围', color: 'violet', featured: true, action: '在⚙设置中切换策略 →' },
  { icon: '📊', title: '策略效果可视化', desc: '实时看消息裁了哪些、Token 省了多少，策略决策透明', color: 'emerald', featured: true, action: '发送消息后查看策略效果区 →' },
  { icon: '🎭', title: '多场景切换', desc: '投资助手 / 研究分析 / 日常对话，一键换角色换工具', color: 'rose', featured: true, action: '点击左侧场景卡片切换 →' },
  { icon: '📄', title: '网页提取', desc: '给 URL 即可提取全文内容，深度研读任意网页', color: 'blue', action: '选择研究分析场景 →' },
  { icon: '📎', title: '文件上传', desc: '图片、PDF、Markdown 直接发给模型分析', color: 'orange', action: '点击📎按钮选择文件 →' },
  { icon: '🌡️', title: '温度控制', desc: '精确 / 低 / 平衡 / 创意，4 档预设调控模型输出风格', color: 'lime', action: '在⚙设置中选择温度 →' },
  { icon: '📋', title: '交互时间线', desc: '逐步回放 API 请求、工具调用、策略决策全过程', color: 'pink', action: '发送消息后查看交互过程区 →' },
  { icon: '📈', title: 'Token 分配', desc: '可视化系统提示词 / 对话历史 / 工具结果的 Token 占比', color: 'teal', action: '查看右侧 Token 分配面板 →' },
  { icon: '💬', title: '流式输出', desc: '打字机效果实时显示模型回复，支持中断控制', color: 'sky' },
  { icon: '💾', title: '会话持久化', desc: '对话历史、场景配置自动保存，切换无丢失', color: 'indigo' },
  { icon: '✏️', title: '系统提示词编辑', desc: '自定义系统提示词，预设场景一键恢复默认', color: 'fuchsia', action: '在输入框上方编辑提示词 →' },
  { icon: '🔧', title: '工具选择', desc: '按需开关工具，控制模型可用的能力范围', color: 'red', action: '点击🔧工具按钮选择 →' },
  { icon: '🗂️', title: '会话管理', desc: '创建 / 切换 / 删除会话，历史消息完整恢复', color: 'yellow', action: '在左侧会话列表管理 →' },
  { icon: '⏱️', title: '工具调用超时', desc: '15 秒超时保护 + 中断按钮，防止无限等待', color: 'cyan' },
  { icon: '📐', title: '上下文窗口调节', desc: '4K ~ 1M 可选，灵活控制模型可见上下文大小', color: 'violet', action: '在⚙设置中调节 →' },
  { icon: '📦', title: '配置持久化', desc: '场景、策略、工具、温度等设置自动保存到本地', color: 'emerald' },
  { icon: '🔽', title: '交互过程折叠', desc: 'API 请求 / 工具调用默认收缩，按需展开详情', color: 'amber' },
  { icon: '⛶', title: '交互区域最大化', desc: '全屏查看交互详情，深入分析每次 API 调用', color: 'rose' },
];
```

组件接口：

```typescript
interface WelcomePageProps {
  onSend: (message: string) => void;
}
```

样式从预览文件移植，色系变量用 JS 对象映射（因为内联样式不支持 CSS 变量的 rgba 动态组合）。

- [ ] **Step 2: Typecheck**

```bash
cd context-lab && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd context-lab && git add src/components/WelcomePage.tsx && git commit -m "feat(RQ-032/T2): add WelcomePage component with capability carousel"
```

---

### Task 3: 集成 WelcomePage 到 ChatInteraction

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: 导入 WelcomePage**

在 ChatInteraction.tsx 顶部添加：

```typescript
import WelcomePage from './WelcomePage';
```

- [ ] **Step 2: 在空对话时显示 WelcomePage**

找到 MessageList 渲染的位置，将条件渲染从：

```typescript
<MessageList
  messages={conversationHistory}
  expandedBubble={expandedBubble}
  onToggleDetail={(index) => setExpandedBubble(expandedBubble === index ? null : index)}
/>
```

替换为：

```typescript
{conversationHistory.length === 0 ? (
  <WelcomePage onSend={(msg) => { setInput(msg); handleSendWithMessage(msg); }} />
) : (
  <MessageList
    messages={conversationHistory}
    expandedBubble={expandedBubble}
    onToggleDetail={(index) => setExpandedBubble(expandedBubble === index ? null : index)}
  />
)}
```

- [ ] **Step 3: 提取 handleSend 为可传参的函数**

当前 `handleSend` 从 `input` state 读取消息。需要新增一个 `handleSendWithMessage(msg: string)` 函数，逻辑与 handleSend 相同但接受参数而非从 state 读取。提取核心逻辑到共享函数，两个入口都调用它。

- [ ] **Step 4: 隐藏输入区当 WelcomePage 显示时**

在输入区域（底部 textarea + 按钮）外层加条件：`conversationHistory.length > 0 &&`，空对话时隐藏底部输入区（因为 WelcomePage 自带输入框）。

- [ ] **Step 5: Typecheck**

```bash
cd context-lab && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd context-lab && git add src/components/ChatInteraction.tsx && git commit -m "feat(RQ-032/T3): integrate WelcomePage into ChatInteraction"
```

---

### Task 4: 验证 + 清理

- [ ] **Step 1: Typecheck + Build**

```bash
cd context-lab && npm run typecheck && npm run build
```

- [ ] **Step 2: 手动验证**

1. 刷新页面，确认显示欢迎页（Agent Lab 标题 + 轮播卡片）
2. 确认不恢复上次对话
3. 点击左右箭头、圆点切换轮播页
4. 在欢迎页输入框输入文字，回车发送，确认对话开始
5. 发送后确认欢迎页消失，显示正常对话界面
6. 刷新页面，确认再次显示欢迎页

- [ ] **Step 3: 删除预览文件**

```bash
rm context-lab/public/welcome-preview.html
```

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add -A && git commit -m "feat(RQ-032/T4): verify and cleanup"
```

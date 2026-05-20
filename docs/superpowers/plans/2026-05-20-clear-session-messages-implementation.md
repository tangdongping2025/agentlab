# RQ-033 实现计划：增加清除会话信息的功能

## 任务清单

### T1：在 ChatInteraction 组件中添加清除对话按钮和确认交互

**修改文件**：`src/components/ChatInteraction.tsx`

**具体步骤**：
1. 从 store 解构 `clearHistory`、`resetTimeline`、`saveCurrentSession`
2. 引入 `agentService`
3. 添加组件内 state `showClearConfirm: boolean`（默认 false）
4. 在输入区域底部工具栏（与文件附件按钮同行左侧）添加 🗑️ 清除按钮
   - 按钮样式：与附件按钮同尺寸、圆角、浅色背景、hover 变红
   - 仅在有消息时显示（conversationHistory.length > 0）
5. 点击清除按钮 → `setShowClearConfirm(true)`
6. 渲染确认气泡（定位在按钮上方），包含"确定清除？"文字 + 确认/取消两个小按钮
7. 确认按钮点击：
   - 调用 `clearHistory()`
   - 调用 `resetTimeline()`
   - 调用 `agentService.clearHistory()`
   - 调用 `saveCurrentSession()`
   - `setShowClearConfirm(false)`
8. 取消按钮点击 → `setShowClearConfirm(false)`

**验证**：
- 有消息时按钮可见，无消息时隐藏
- 确认气泡正确定位，不遮挡输入框
- 确认后消息清空，WelcomePage 显示
- 取消后无操作

### T2：验证 + 收尾

**验证清单**：
1. 有消息 → 点击清除 → 确认 → 消息清空 → WelcomePage 显示
2. 有消息 → 点击清除 → 取消 → 无操作
3. 清除后再次发送消息 → 新消息正常显示
4. 清除后切换到其他会话再切回 → 消息确实已清空（持久化生效）
5. 无消息时清除按钮不可见

**收尾**：
- 检查无残留旧代码
- 确认类型安全

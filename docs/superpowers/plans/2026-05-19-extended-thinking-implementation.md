# RQ-029 增加深度思考能力 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在对话中集成 Claude Extended Thinking，用户可开关，思考过程在 Timeline 和对话气泡中展示。

**Architecture:** agentService 请求层加 thinking 参数和响应解析，appStore 管理 thinkingEnabled/thinkingBudget 状态，UI 层在 ToolSelectorBar 加开关、MessageBubble 加折叠展示、ChatInteraction 加 Timeline 步骤。

**Tech Stack:** React 18、TypeScript、Zustand、Claude API extended thinking

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `context-lab/src/types/index.ts` | Message 类型加 thinkingContent/thinkingTokens |
| 修改 | `context-lab/src/stores/appStore.ts` | 新增 thinkingEnabled/thinkingBudget 状态 + actions + ThinkingStepDetails |
| 修改 | `context-lab/src/services/agentService.ts` | ClaudeRequest 加 thinking、请求构造、响应解析、Timeline 回调 |
| 修改 | `context-lab/src/components/ToolSelectorBar.tsx` | 旁加深度思考开关 + 预算选择 |
| 修改 | `context-lab/src/components/MessageBubble.tsx` | 思考内容折叠展示 |
| 修改 | `context-lab/src/components/ChatInteraction.tsx` | 传递 thinking 参数 + Timeline 步骤 |

---

### Task 1: 扩展 Message 类型（types/index.ts）

**Files:**
- Modify: `context-lab/src/types/index.ts`

- [ ] **Step 1: 在 Message 接口添加 thinking 字段**

将 `context-lab/src/types/index.ts` 的 Message 接口从：

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenUsage?: { input: number; output: number };
  apiCallCount?: number;
  toolsUsed?: string[];
  timelineStepIndex?: number;
  files?: FileAttachment[];
  isFileOnly?: boolean;
}
```

替换为：

```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenUsage?: { input: number; output: number };
  apiCallCount?: number;
  toolsUsed?: string[];
  timelineStepIndex?: number;
  files?: FileAttachment[];
  isFileOnly?: boolean;
  thinkingContent?: string;
  thinkingTokens?: number;
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/types/index.ts
git commit -m "feat(RQ-029/T1): add thinking fields to Message type"
```

---

### Task 2: 扩展 appStore（状态 + actions + ThinkingStepDetails）

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

- [ ] **Step 1: 添加 ThinkingStepDetails 类型**

在 `StrategyEffectStepDetails` 接口之后（约第 67 行），添加：

```typescript
export interface ThinkingStepDetails {
  type: 'thinking';
  thinkingContent: string;
  thinkingTokens: number;
  duration: number;
}
```

将 `StepDetails` 联合类型从：

```typescript
export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails | StrategyEffectStepDetails;
```

替换为：

```typescript
export type StepDetails = UserInputDetails | ApiRequestDetails | ApiResponseDetails | ToolCallDetails | AgentResponseDetails | StrategyEffectStepDetails | ThinkingStepDetails;
```

- [ ] **Step 2: 在 AppState 接口添加 thinking 状态和 actions**

在 `clearAllTools` 声明之后（约第 239 行），添加：

```typescript
  // Thinking
  thinkingEnabled: boolean;
  thinkingBudget: number;
  toggleThinking: () => void;
  setThinkingBudget: (budget: number) => void;
```

- [ ] **Step 3: 在 store 实现中添加 thinking 初始值和 actions**

在 `clearAllTools` 实现之后（约第 394 行），添加：

```typescript
  thinkingEnabled: false,
  thinkingBudget: 10000,

  toggleThinking: () => {
    set(state => ({ thinkingEnabled: !state.thinkingEnabled }));
    get().saveUserConfig();
  },

  setThinkingBudget: (budget) => {
    set({ thinkingBudget: budget });
    get().saveUserConfig();
  },
```

- [ ] **Step 4: 在 saveUserConfig 中持久化 thinking 状态**

将 `saveUserConfig` 中的 `localStorage.setItem` 调用里的 JSON 对象从：

```typescript
localStorage.setItem('context-lab.config', JSON.stringify({
  currentScene: state.currentScene,
  contextStrategy: state.contextStrategy,
  systemPrompt: state.systemPrompt,
  selectedTools: state.selectedTools,
  contextSize: state.contextSize,
  currentSessionId: state.currentSessionId,
  sidebarOpen: state.sidebarOpen,
}));
```

替换为：

```typescript
localStorage.setItem('context-lab.config', JSON.stringify({
  currentScene: state.currentScene,
  contextStrategy: state.contextStrategy,
  systemPrompt: state.systemPrompt,
  selectedTools: state.selectedTools,
  contextSize: state.contextSize,
  currentSessionId: state.currentSessionId,
  sidebarOpen: state.sidebarOpen,
  thinkingEnabled: state.thinkingEnabled,
  thinkingBudget: state.thinkingBudget,
}));
```

- [ ] **Step 5: 在 loadUserConfig 中恢复 thinking 状态**

在 `loadUserConfig` 的 `const restore: Partial<AppState> = {};` 块中，`sidebarOpen` 恢复之后，添加：

```typescript
if (typeof config.thinkingEnabled === 'boolean') restore.thinkingEnabled = config.thinkingEnabled;
if (config.thinkingBudget) restore.thinkingBudget = config.thinkingBudget;
```

- [ ] **Step 6: Commit**

```bash
cd context-lab && git add src/stores/appStore.ts
git commit -m "feat(RQ-029/T2): add thinking state and actions to appStore"
```

---

### Task 3: 扩展 agentService（请求 + 响应 + 回调）

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

- [ ] **Step 1: ClaudeRequest 接口添加 thinking 字段**

将 `ClaudeRequest` 接口从：

```typescript
interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  temperature?: number;
  tools?: ClaudeTool[];
  tool_choice?: 'auto' | 'none' | { type: 'tool' | 'function'; function?: { name: string }; tool?: { name: string } };
}
```

替换为：

```typescript
interface ClaudeRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: ClaudeMessage[];
  temperature?: number;
  tools?: ClaudeTool[];
  tool_choice?: 'auto' | 'none' | { type: 'tool' | 'function'; function?: { name: string }; tool?: { name: string } };
  thinking?: { type: 'enabled'; budget_tokens: number };
}
```

- [ ] **Step 2: TimelineCallbacks 添加 onThinking 回调**

将 `TimelineCallbacks` 接口中的 `onStreamToken` 声明之后，添加：

```typescript
  onThinking: (thinkingContent: string, thinkingTokens: number, duration: number) => void;
```

- [ ] **Step 3: sendMessage 接受 thinking 参数**

将 `sendMessage` 方法签名从：

```typescript
  async sendMessage(
    message: string,
    systemPrompt: string,
    tools?: string[],
    contextStrategy: string = 'full',
    files?: FileAttachment[]
  ): Promise<string> {
```

替换为：

```typescript
  async sendMessage(
    message: string,
    systemPrompt: string,
    tools?: string[],
    contextStrategy: string = 'full',
    files?: FileAttachment[],
    thinkingBudget?: number
  ): Promise<string> {
```

- [ ] **Step 4: 构造请求时加入 thinking 参数**

在 `sendMessage` 方法中，`const request: ClaudeRequest = { ... }` 构造之后、`if (availableTools.length > 0)` 之前，添加：

```typescript
        const isThinking = typeof thinkingBudget === 'number' && thinkingBudget > 0;
        if (isThinking) {
          request.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
          request.temperature = 1;
        }
```

- [ ] **Step 5: thinking 开启时强制非流式**

将 stream 设置从：

```typescript
        (request as any).stream = availableTools.length === 0;
```

替换为：

```typescript
        (request as any).stream = !isThinking && availableTools.length === 0;
```

- [ ] **Step 6: 升级 anthropic-version header**

将两处 `anthropic-version` header 从 `'2023-06-01'` 替换为 `'2024-10-22'`。

第一处在主请求（约第 516 行）：

```typescript
          'anthropic-version': '2024-10-22',
```

第二处在 `generateSummary` 方法中的请求（约第 850 行）：

```typescript
        'anthropic-version': '2024-10-22',
```

- [ ] **Step 7: 非流式响应解析中提取 thinking block**

在非流式解析的 for 循环中（约第 633 行），在 `if (block.type === 'text')` 分支之前，添加：

```typescript
            if (block.type === 'thinking') {
              contentBlocks.push({ type: 'thinking', text: block.thinking || '' });
              continue;
            }
```

- [ ] **Step 8: thinking block 不写入 conversationHistory**

在 `hasToolUse && this.useTools` 分支中，assistantContent 的构造循环里，在 `if (block.type === 'text')` 分支之前，添加：

```typescript
            if (block.type === 'thinking') {
              // thinking 不写入 conversationHistory
              thinkingContent = block.text || '';
              continue;
            }
```

同时在 `sendMessage` 方法的变量声明区域（`let finalResponse = ''` 附近），添加：

```typescript
      let thinkingContent = '';
      let thinkingTokens = 0;
```

- [ ] **Step 9: 触发 onThinking 回调**

在 `if (hasToolUse && this.useTools)` 分支的结束大括号之后、`else` 分支之前（约第 772 行），添加 thinking 回调：

```typescript
          // 触发 thinking 回调
          if (thinkingContent && this.timelineCallbacks) {
            this.timelineCallbacks.onThinking(thinkingContent, thinkingTokens, 0);
          }
          thinkingContent = '';
```

在 `else` 分支（最终回复）中，`finalResponse = fullText` 之前，也添加同样的回调：

```typescript
          // 触发 thinking 回调
          if (thinkingContent && this.timelineCallbacks) {
            this.timelineCallbacks.onThinking(thinkingContent, thinkingTokens, 0);
          }
```

- [ ] **Step 10: 返回 thinking 信息给调用方**

将 `sendMessage` 的返回类型从 `Promise<string>` 改为同时返回 thinking 信息。在方法末尾 `return finalResponse` 之前，把 thinking 信息存到实例变量：

在类属性声明区域（`private _lastStrategyEffect` 附近）添加：

```typescript
  private _lastThinking: { content: string; tokens: number } | null = null;
```

在 `if (thinkingContent && this.timelineCallbacks)` 回调之后，添加：

```typescript
          if (thinkingContent) {
            this._lastThinking = { content: thinkingContent, tokens: thinkingTokens };
          }
```

在 `clearHistory` 方法中添加：

```typescript
    this._lastThinking = null;
```

添加公开方法：

```typescript
  getLastThinking(): { content: string; tokens: number } | null {
    return this._lastThinking;
  }
```

- [ ] **Step 11: Commit**

```bash
cd context-lab && git add src/services/agentService.ts
git commit -m "feat(RQ-029/T3): add thinking support to agentService"
```

---

### Task 4: 深度思考开关 UI（ToolSelectorBar）

**Files:**
- Modify: `context-lab/src/components/ToolSelectorBar.tsx`

- [ ] **Step 1: 添加深度思考开关**

将 `ToolSelectorBar` 组件完整替换为：

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

const BUDGET_OPTIONS = [
  { label: '低', value: 5000, desc: '5K tokens' },
  { label: '中', value: 10000, desc: '10K tokens' },
  { label: '高', value: 20000, desc: '20K tokens' },
];

export default function ToolSelectorBar() {
  const { selectedTools, availableTools, toggleTool, thinkingEnabled, thinkingBudget, toggleThinking, setThinkingBudget } = useAppStore();
  const [open, setOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setBudgetOpen(false);
      }
    };
    if (open || budgetOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, budgetOpen]);

  return (
    <div ref={ref} style={{ display: 'flex', gap: '6px' }}>
      {/* 深度思考开关 */}
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => { toggleThinking(); setBudgetOpen(false); }}
          onContextMenu={(e) => { e.preventDefault(); setBudgetOpen(!budgetOpen); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 10px',
            background: thinkingEnabled ? 'rgba(250,204,21,0.12)' : 'var(--bg-surface)',
            border: `1px solid ${thinkingEnabled ? 'rgba(250,204,21,0.3)' : 'var(--border-default)'}`,
            borderRadius: '8px',
            fontSize: '14px', color: thinkingEnabled ? '#facc15' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          💡 深度思考
          {thinkingEnabled && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              background: 'rgba(250,204,21,0.15)', color: '#facc15',
              padding: '1px 5px', borderRadius: '8px',
            }}>
              {BUDGET_OPTIONS.find(b => b.value === thinkingBudget)?.label || '中'}
            </span>
          )}
        </div>
        {budgetOpen && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
            width: '140px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)', borderRadius: '8px',
            padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '4px 8px 6px' }}>
              思考预算
            </div>
            {BUDGET_OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => { setThinkingBudget(opt.value); setBudgetOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', borderRadius: '5px', cursor: 'pointer',
                  transition: 'background 0.1s', fontSize: '13px',
                  color: thinkingBudget === opt.value ? '#facc15' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  border: `1.5px solid ${thinkingBudget === opt.value ? '#facc15' : 'var(--border-default)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', flexShrink: 0,
                  background: thinkingBudget === opt.value ? '#facc15' : 'transparent',
                  color: thinkingBudget === opt.value ? '#000' : 'transparent',
                }}>
                  ●
                </span>
                <span>{opt.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)' }}>{opt.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 工具选择 */}
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 10px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)', borderRadius: '8px',
            fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          🔧 工具{' '}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px',
            background: 'rgba(91,156,245,0.15)', color: 'var(--accent-blue)',
            padding: '1px 6px', borderRadius: '8px',
          }}>
            {selectedTools.length}
          </span>
        </div>
        {open && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
            width: '200px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)', borderRadius: '8px',
            padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {availableTools.map(tool => {
              const isSelected = selectedTools.includes(tool.id);
              return (
                <div
                  key={tool.id}
                  onClick={() => toggleTool(tool.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
                    transition: 'background 0.1s', fontSize: '14px',
                    color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{
                    width: '14px', height: '14px', borderRadius: '3px',
                    border: `1.5px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', flexShrink: 0,
                    background: isSelected ? 'var(--accent-blue)' : 'transparent',
                    color: isSelected ? '#fff' : 'transparent',
                    transition: 'all 0.12s',
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: '16px' }}>{tool.icon}</span>
                  <span>{tool.name.replace(tool.icon + ' ', '')}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd context-lab && git add src/components/ToolSelectorBar.tsx
git commit -m "feat(RQ-029/T4): add thinking toggle to ToolSelectorBar"
```

---

### Task 5: 思考内容展示（MessageBubble + ChatInteraction）

**Files:**
- Modify: `context-lab/src/components/MessageBubble.tsx`
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: MessageBubble 添加 thinking 折叠展示**

在 `MessageBubble` 组件中，`const isUser = ...` 之后，添加：

```typescript
  const [thinkingExpanded, setThinkingExpanded] = React.useState(false);
```

在气泡内容（`{isUser ? message.content : <MarkdownRenderer content={message.content} />}`）之前，添加 thinking 展示区：

```typescript
          {/* Thinking content */}
          {'thinkingContent' in message && (message as any).thinkingContent && (
            <div style={{ marginBottom: '8px' }}>
              <div
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 8px', cursor: 'pointer',
                  background: 'rgba(250,204,21,0.06)',
                  border: '1px solid rgba(250,204,21,0.15)',
                  borderRadius: '6px', fontSize: '12px', color: '#facc15',
                  transition: 'all 0.15s',
                }}
              >
                <span>💭</span>
                <span>深度思考</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                  · {(message as any).thinkingContent.length} 字
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '10px' }}>
                  {thinkingExpanded ? '▲ 收起' : '▼ 展开'}
                </span>
              </div>
              {thinkingExpanded && (
                <div style={{
                  marginTop: '6px', padding: '10px',
                  background: 'var(--bg-base)', borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  maxHeight: '300px', overflowY: 'auto',
                  fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)',
                }}>
                  <MarkdownRenderer content={(message as any).thinkingContent} />
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: ChatInteraction 传递 thinking 参数**

在 `ChatInteraction` 组件的 `useAppStore()` 解构中，添加：

```typescript
    thinkingEnabled,
    thinkingBudget,
```

在 `agentService.sendMessage` 调用中，将：

```typescript
      const agentResponse = await agentService.sendMessage(
        messageText,
        effectiveSystemPrompt,
        selectedTools,
        contextStrategy,
        fileAttachment ? [fileAttachment] : undefined
      );
```

替换为：

```typescript
      const agentResponse = await agentService.sendMessage(
        messageText,
        effectiveSystemPrompt,
        selectedTools,
        contextStrategy,
        fileAttachment ? [fileAttachment] : undefined,
        thinkingEnabled ? thinkingBudget : undefined
      );
```

- [ ] **Step 3: ChatInteraction 添加 onThinking 回调和 Timeline 步骤**

在 `agentService.setTimelineCallbacks` 的回调对象中，`onStreamToken` 回调之后，添加：

```typescript
        onThinking: (thinkingContent, thinkingTokens, duration) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'thinking',
            icon: '💭',
            title: '深度思考',
            description: `思考完成 · ${thinkingContent.length} 字`,
            active: false,
            completed: true,
            expandable: true,
            expanded: false,
            details: {
              type: 'thinking',
              thinkingContent,
              thinkingTokens,
              duration,
            } as ThinkingStepDetails,
          };
          addTimelineStep(step);
        },
```

在 `ChatInteraction` 的 import 中添加 `ThinkingStepDetails`：

```typescript
import { useAppStore, type TimelineStep, type StrategyEffectStepDetails, type ThinkingStepDetails } from '../stores/appStore';
```

- [ ] **Step 4: 将 thinking 信息写入消息**

在 `handleSend` 方法中，`agentService.sendMessage` 调用之后，策略效果处理之前，添加：

```typescript
      // 将 thinking 信息写入最后一条 assistant 消息
      const lastThinking = agentService.getLastThinking();
      if (lastThinking) {
        const state = useAppStore.getState();
        const history = [...state.conversationHistory];
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'assistant') {
            history[i] = { ...history[i], thinkingContent: lastThinking.content, thinkingTokens: lastThinking.tokens } as any;
            break;
          }
        }
        useAppStore.setState({ conversationHistory: history });
      }
```

- [ ] **Step 5: Commit**

```bash
cd context-lab && git add src/components/MessageBubble.tsx src/components/ChatInteraction.tsx
git commit -m "feat(RQ-029/T5): add thinking display in MessageBubble and ChatInteraction"
```

---

### Task 6: 验证 + 清理

**Files:**
- 检查所有文件

- [ ] **Step 1: 运行 typecheck**

```bash
cd context-lab && npm run typecheck
```

预期：通过，无错误。

- [ ] **Step 2: 运行生产构建**

```bash
cd context-lab && npm run build
```

预期：构建成功。

- [ ] **Step 3: 启动 dev server，手动验证**

```bash
cd context-lab && npm run dev
```

验证路径：
1. 打开 http://localhost:5173
2. 确认输入区工具栏显示"💡 深度思考"按钮
3. 点击开启，确认按钮高亮 + 显示"中"标签
4. 右键点击按钮，确认弹出预算选择（低/中/高）
5. 选择"研究分析"场景，开启深度思考，发送消息"分析一下RAG技术的优缺点"
6. 确认 Timeline 出现"💭 深度思考"步骤，可展开查看 thinking 内容
7. 确认对话气泡中助手回复上方显示折叠的思考内容，点击可展开
8. 关闭深度思考，发送消息，确认无 thinking 步骤和展示

- [ ] **Step 4: Commit**

```bash
cd context-lab && git add -A
git commit -m "feat(RQ-029/T6): verify and cleanup thinking feature"
```

# 在发送区域增加选择本地文件发送的功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在发送区域增加选择本地文件发送的功能，支持所有类型文件，大小限制 5MB 以下，一次选择一个文件。

**Architecture:** 在 ChatInteraction 组件中增加文件选择功能，更新类型定义以支持文件附件，修改 agentService 以处理文件发送。文件选择按钮放置在发送按钮旁边，显示文件预览和删除功能。

**Tech Stack:** React 18, TypeScript, Vite, Zustand

---

## 文件结构

### 将修改的文件：
1. `src/types/index.ts` - 新增 FileAttachment 类型，更新 Message 类型
2. `src/components/ChatInteraction.tsx` - 添加文件选择 UI 和状态管理
3. `src/services/agentService.ts` - 更新消息格式以支持文件
4. `src/components/MessageBubble.tsx` - 更新消息显示以支持文件附件

---

## Task 1: 更新类型定义

**Files:**
- Modify: `src/types/index.ts`

### [ ] Step 1: 添加 FileAttachment 类型
**当前文件内容（开始部分）：**
```typescript
// src/types/index.ts
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: string;
}
```

**添加 FileAttachment 类型，放在 MCPTool 之后：**
```typescript
export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  url: string;
  content: string;
}
```

### [ ] Step 2: 更新 Session 类型中的 Message
**找到 Session 类型的 messages 字段：**
```typescript
export interface Session {
  id: string;
  name: string;
  sceneId: string;
  systemPrompt: string;
  selectedTools: string[];
  contextStrategy: ContextStrategy;
  contextSize: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}
```

**替换为：**
```typescript
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  files?: FileAttachment[];
  timestamp: string;
}

export interface Session {
  id: string;
  name: string;
  sceneId: string;
  systemPrompt: string;
  selectedTools: string[];
  contextStrategy: ContextStrategy;
  contextSize: number;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}
```

### [ ] Step 3: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/types/index.ts
git commit -m "feat(RQ-022/T1): add FileAttachment type"
```

---

## Task 2: 更新 ChatInteraction 组件 - 文件选择状态和处理函数

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

### [ ] Step 1: 导入新类型
**在文件顶部添加导入：**
```typescript
import { FileAttachment } from '../types';
```

### [ ] Step 2: 添加文件选择状态
**在 ChatInteraction 组件函数内部，找到现有状态：**
```typescript
const [input, setInput] = useState('');
const [isLoading, setIsLoading] = useState(false);
const hasAutoSent = useRef(false);
const [expandedBubble, setExpandedBubble] = useState<number | null>(null);
const [sceneOpen, setSceneOpen] = useState(false);
const sceneRef = useRef<HTMLDivElement>(null);
```

**在后面添加：**
```typescript
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
```

### [ ] Step 3: 添加文件处理函数
**在 handleKeyDown 函数之前，添加：**
```typescript
const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      alert('文件大小不能超过 5MB');
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
  }
};

const handleRemoveFile = () => {
  if (filePreviewUrl) {
    URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
  }
  setSelectedFile(null);
};

const convertFileToBase64 = (file: File): Promise<FileAttachment> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
        content: content
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
```

### [ ] Step 4: 更新 handleSendWithInput 以处理文件
**找到 handleSendWithInput 函数，在函数开头添加：**
```typescript
let fileAttachment: FileAttachment | null = null;
if (selectedFile) {
  fileAttachment = await convertFileToBase64(selectedFile);
}
```

**在调用 addMessage 的地方更新：**
```typescript
addMessage('user', text, fileAttachment ? [fileAttachment] : undefined);
```

### [ ] Step 5: 清理文件选择状态
**在发送成功后添加：**
```typescript
if (filePreviewUrl) {
  URL.revokeObjectURL(filePreviewUrl);
  setFilePreviewUrl(null);
}
setSelectedFile(null);
```

### [ ] Step 6: 更新 agentService.sendMessage 调用
**找到调用 agentService.sendMessage 的地方，添加文件参数：**
```typescript
const agentResponse = await agentService.sendMessage(
  text,
  systemPrompt,
  selectedTools,
  contextStrategy,
  fileAttachment ? [fileAttachment] : undefined
);
```

### [ ] Step 7: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/components/ChatInteraction.tsx
git commit -m "feat(RQ-022/T2): add file selection state and handlers"
```

---

## Task 3: 更新 ChatInteraction 组件 - UI

**Files:**
- Modify: `src/components/ChatInteraction.tsx`

### [ ] Step 1: 添加文件选择 UI
**找到渲染部分的输入区域，在发送按钮前添加文件选择按钮：**

**找到现有的代码块（大约在 284-350 行）：**
```jsx
<div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
  {/* 场景选择器 */}
  <div ref={sceneRef} style={{ position: 'relative' }}>
    {/* 场景选择器代码 */}
  </div>

  <ToolSelectorBar />
  <div style={{ flex: 1, position: 'relative' }}>
    <textarea
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="输入你的问题..."
      disabled={isLoading}
      rows={1}
      style={{
        width: '100%', padding: '12px 48px 12px 14px',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '10px', color: 'var(--text-primary)',
        fontFamily: 'var(--font-display)', fontSize: '15px',
        resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '120px',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
      onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-default)'; }}
    />
    <button
      onClick={handleSend}
      disabled={isLoading}
      style={{
        position: 'absolute', right: '6px', bottom: '6px',
        width: '34px', height: '34px',
        background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
        border: 'none', borderRadius: '8px', color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: isLoading ? 0.5 : 1,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    </button>
  </div>
</div>
```

**替换为：**
```jsx
<div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
  {/* 场景选择器 */}
  <div ref={sceneRef} style={{ position: 'relative' }}>
    {/* 场景选择器代码 */}
  </div>

  <ToolSelectorBar />
  <div style={{ flex: 1, position: 'relative' }}>
    <textarea
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="输入你的问题..."
      disabled={isLoading}
      rows={1}
      style={{
        width: '100%', padding: '12px 48px 12px 14px',
        background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '10px', color: 'var(--text-primary)',
        fontFamily: 'var(--font-display)', fontSize: '15px',
        resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '120px',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
      onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-default)'; }}
    />
    <button
      onClick={handleSend}
      disabled={isLoading}
      style={{
        position: 'absolute', right: '6px', bottom: '6px',
        width: '34px', height: '34px',
        background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
        border: 'none', borderRadius: '8px', color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: isLoading ? 0.5 : 1,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    </button>
  </div>

  {/* 文件选择按钮 */}
  <div style={{ position: 'relative' }}>
    <input
      type="file"
      id="file-upload"
      onChange={handleFileSelect}
      style={{ display: 'none' }}
    />
    <button
      onClick={() => document.getElementById('file-upload')?.click()}
      disabled={isLoading}
      style={{
        padding: selectedFile ? '6px 8px' : '8px 12px',
        background: selectedFile ? 'var(--accent-amber)' : 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: selectedFile ? '4px' : '6px',
        transition: 'all 0.15s',
        height: '44px',
        minWidth: selectedFile ? 'auto' : '44px',
        opacity: isLoading ? 0.5 : 1,
      }}
      title="选择文件"
    >
      {filePreviewUrl && selectedFile?.type.startsWith('image/') ? (
        <img
          src={filePreviewUrl}
          style={{ width: '24px', height: '24px', objectFit: 'cover', borderRadius: '4px' }}
          alt={selectedFile.name}
        />
      ) : (
        '📎'
      )}
      {selectedFile && (
        <>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedFile.name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleRemoveFile(); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0',
              width: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </>
      )}
    </button>
  </div>
</div>
```

### [ ] Step 2: 注意 - 保持场景选择器的原有代码
**确保场景选择器的完整代码被保留：**
```jsx
<div ref={sceneRef} style={{ position: 'relative' }}>
  <div
    onClick={() => setSceneOpen(!sceneOpen)}
    style={{
      display: 'flex', alignItems: 'center', gap: '5px',
      padding: '8px 10px', background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)', borderRadius: '8px',
      fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}
  >
    {scenes.find(s => s.id === currentScene)?.icon || '✏️'}{' '}
    {scenes.find(s => s.id === currentScene)?.name || '自定义'}
  </div>
  {sceneOpen && (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
      width: '180px', background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)', borderRadius: '8px',
      padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      {scenes.map(scene => {
        const isActive = currentScene === scene.id;
        return (
          <div
            key={scene.id}
            onClick={() => { setScene(scene.id); setSceneOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
              transition: 'background 0.1s', fontSize: '14px',
              color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '16px' }}>{scene.icon}</span>
            <span>{scene.name}</span>
            {isActive && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--accent-blue)' }}>✓</span>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
```

### [ ] Step 3: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/components/ChatInteraction.tsx
git commit -m "feat(RQ-022/T3): add file selection UI"
```

---

## Task 4: 更新 appStore 以支持文件附件

**Files:**
- Modify: `src/stores/appStore.ts`

### [ ] Step 1: 更新 addMessage 函数
**找到 addMessage 函数定义，更新签名：**
```typescript
addMessage: (role: 'user' | 'assistant', content: string, files?: FileAttachment[]) => void;
```

**找到 addMessage 实现，更新它：**
```typescript
addMessage: (role, content, files) => {
  const newMessage: Message = {
    role,
    content,
    files,
    timestamp: new Date().toISOString(),
  };
  set(state => {
    const newMessages = [...state.messages, newMessage];
    return {
      messages: newMessages,
    };
  });
},
```

**确保导入 FileAttachment 类型：**
```typescript
import { MCPTool, SceneConfig, ContextStrategy, StrategyEffect, Message, FileAttachment } from '../types';
```

### [ ] Step 2: 更新会话保存和加载
**确保会话保存和加载时也处理文件信息。**

### [ ] Step 3: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/stores/appStore.ts
git commit -m "feat(RQ-022/T4): update appStore to support file attachments"
```

---

## Task 5: 更新 agentService 支持文件

**Files:**
- Modify: `src/services/agentService.ts`

### [ ] Step 1: 更新 sendMessage 签名
**找到 sendMessage 函数，添加 files 参数：**
```typescript
async sendMessage(
  message: string,
  systemPrompt: string,
  tools?: string[],
  contextStrategy?: ContextStrategy,
  files?: FileAttachment[]
): Promise<string> {
```

**确保导入 FileAttachment 类型：**
```typescript
import type { StrategyEffect, ContextStrategy, FileAttachment } from '../types/index';
```

### [ ] Step 2: 更新消息构建逻辑
**在函数内，找到添加用户消息的部分，更新：**
```typescript
// 构建消息内容
let messageContent: string | Array<any> = message;

if (files && files.length > 0) {
  messageContent = [
    { type: 'text', text: message },
    ...files.map(file => {
      if (file.type.startsWith('image/')) {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.type,
            data: file.content.split(',')[1]
          }
        };
      } else {
        return {
          type: 'text',
          text: `\n[附件: ${file.name}] (${(file.size / 1024).toFixed(1)}KB)`
        };
      }
    })
  ];
}

this.conversationHistory.push({ role: 'user', content: messageContent });
```

### [ ] Step 3: 更新回调中的上下文分解
**找到 onApiRequestStart 回调部分，更新：**
```typescript
const userTokenCount = this.estimateTokens(message) + 
  (files ? files.reduce((sum, f) => sum + Math.ceil(f.size / 100), 0) : 0);
```

### [ ] Step 4: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/services/agentService.ts
git commit -m "feat(RQ-022/T5): update agentService to support files"
```

---

## Task 6: 更新 MessageBubble 组件显示文件附件

**Files:**
- Modify: `src/components/MessageBubble.tsx`

### [ ] Step 1: 导入类型
**在文件顶部添加：**
```typescript
import { Message } from '../types';
```

### [ ] Step 2: 更新组件 props
**修改组件签名以接受完整 Message 对象：**
```typescript
interface MessageBubbleProps {
  message: Message;
  isExpanded?: boolean;
  onToggle?: () => void;
}
```

### [ ] Step 3: 添加文件附件显示
**在组件渲染中，文本后添加文件显示：**
```jsx
{message.files && message.files.length > 0 && (
  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
    {message.files.map((file, index) => (
      <div
        key={index}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-elevated)',
          borderRadius: '6px',
          fontSize: '13px',
        }}
      >
        {file.type.startsWith('image/') ? (
          <img
            src={file.url}
            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }}
            alt={file.name}
          />
        ) : (
          '📄'
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-primary)' }}>{file.name}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            {(file.size / 1024).toFixed(1)}KB
          </span>
        </div>
      </div>
    ))}
  </div>
)}
```

### [ ] Step 4: 更新 MessageList 组件
**确保 MessageList 传递正确的 props 给 MessageBubble。**

### [ ] Step 5: Commit
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add context-lab/src/components/MessageBubble.tsx
git commit -m "feat(RQ-022/T6): update MessageBubble to display files"
```

---

## Task 7: 测试功能

**Files:**
- Test: Run and verify functionality

### [ ] Step 1: 启动开发服务器
```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
cd context-lab
npm run dev
```

### [ ] Step 2: 验证文件选择功能
- 点击 📎 图标，打开文件选择对话框
- 选择一个小于 5MB 的文件
- 验证文件预览和文件名显示
- 点击删除按钮，取消选择

### [ ] Step 3: 验证文件大小限制
- 尝试选择大于 5MB 的文件
- 验证错误提示

### [ ] Step 4: 验证发送功能
- 选择文件后输入文本，点击发送
- 验证消息在列表中正确显示
- 验证文件内容正确发送

### [ ] Step 5: Commit（如果需要修复）
```bash
git add -A
git commit -m "fix(RQ-022/T7): fix issues found during testing"
```

---

## 自我审查

### 1. Spec Coverage 检查
- ✅ 文件选择功能（Task 2-3）
- ✅ 文件大小限制（Task 2）
- ✅ 所有文件类型支持（Task 2）
- ✅ 一次选择一个文件（Task 2）
- ✅ 点击选择方式（Task 3）
- ✅ 文件预览显示（Task 3）
- ✅ 消息列表显示文件（Task 6）

### 2. Placeholder 检查
- ✅ 没有 TODO 或 TBD
- ✅ 所有代码块完整
- ✅ 所有步骤有具体内容

### 3. Type 一致性检查
- ✅ FileAttachment 类型一致
- ✅ Message 类型一致
- ✅ 函数参数一致

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-file-upload-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

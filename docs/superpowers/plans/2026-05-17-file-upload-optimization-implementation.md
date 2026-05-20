# 文件上传功能优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 进一步优化文件上传功能，包括：
1. 修复文件内容显示乱码问题
2. 实现自动解析文件内容并发送给 AI
3. 允许只上传文件而不输入文本

**Architecture:** 使用 jschardet 库自动检测文本文件编码，解码后正确显示和发送给 AI。支持单独发送文件功能。

**Tech Stack:** React, TypeScript, Vite, jschardet

---

## 文件结构

### 待修改文件
1. `context-lab/src/components/ChatInteraction.tsx` - 解码和发送逻辑优化
2. `context-lab/src/services/agentService.ts` - 文件内容发送优化
3. `context-lab/src/types/index.ts` - 类型定义更新
4. `context-lab/package.json` - 新增依赖

---

## 任务分解

### Task 1: 更新类型定义

**Files:**
- Modify: `context-lab/src/types/index.ts`

**Steps:**

- [ ] **Step 1: 新增文件内容类型定义**

在 `FileAttachment` 接口中添加 `encoding` 字段：

```typescript
// src/types/index.ts
export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  url: string;
  content: string;
  encoding?: string; // 新增：编码信息
}
```

- [ ] **Step 2: 更新 Message 类型**

更新 Message 接口支持单独发送文件：

```typescript
// src/types/index.ts
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokenUsage?: { input: number; output: number };
  apiCallCount?: number;
  toolsUsed?: string[];
  timelineStepIndex?: number;
  files?: FileAttachment[];
  isFileOnly?: boolean; // 新增：是否是单独文件消息
}
```

- [ ] **Step 3: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/types/index.ts
git commit -m "feat(RQ-023/T1): update type definitions"
```

---

### Task 2: 新增编码检测库

**Files:**
- Modify: `context-lab/package.json`

**Steps:**

- [ ] **Step 1: 安装 jschardet 库**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm install jschardet@^3.0.0
```

- [ ] **Step 2: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add package.json package-lock.json
git commit -m "feat(RQ-023/T2): add jschardet encoding detector"
```

---

### Task 3: 优化解码逻辑

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

**Steps:**

- [ ] **Step 1: 导入编码检测库**

```typescript
// src/components/ChatInteraction.tsx
import * as jschardet from 'jschardet';
import type { FileAttachment } from '../types';
```

- [ ] **Step 2: 重写 convertFileToBase64 方法**

替换原有的解码逻辑：

```typescript
const convertFileToBase64 = (file: File): Promise<FileAttachment> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const rawContent = e.target?.result as ArrayBuffer;
      const buffer = Buffer.from(rawContent);
      
      // 自动检测编码
      const encodingResult = jschardet.detect(buffer);
      const encoding = encodingResult.encoding || 'UTF-8';
      
      // 解码内容
      let content: string;
      try {
        content = buffer.toString(encoding);
      } catch {
        content = buffer.toString('UTF-8');
      }
      
      const dataURL = `data:${file.type};base64,${buffer.toString('base64')}`;
      
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        url: dataURL,
        content: content,
        encoding: encoding
      });
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file); // 使用 ArrayBuffer 读取原始字节
  });
};
```

- [ ] **Step 3: 优化发送逻辑**

修改 `handleSendWithInput` 支持单独文件发送：

```typescript
const handleSendWithInput = async (text: string) => {
  // 如果既没有文本也没有文件，不发送
  if (!text.trim() && !selectedFile) {
    return;
  }

  let fileAttachment: FileAttachment | null = null;
  if (selectedFile) {
    fileAttachment = await convertFileToBase64(selectedFile);
  }

  const messageText = text.trim() || (fileAttachment ? fileAttachment.name : '');
  
  try {
    resetTimeline();
    setLastUserInput(messageText);
    setIsLoading(true);

    // 用户输入步骤
    const userInputStep: TimelineStep = {
      id: nextStepId(),
      type: text.trim() ? 'user-input' : 'file-upload',
      icon: text.trim() ? '💬' : '📎',
      title: text.trim() ? '用户输入' : '文件上传',
      description: text.trim() 
        ? `发送请求：${text.slice(0, 50)}...` 
        : `发送文件：${fileAttachment?.name}`,
      active: false,
      completed: true,
      expandable: true,
      expanded: false,
      details: {
        type: text.trim() ? 'user-input' : 'file-upload',
        text: messageText,
        tokenCount: Math.ceil((text.length + (fileAttachment?.content.length || 0)) / 4),
        conversationTurns: conversationHistory.filter(m => m.role === 'user').length + 1,
        fileName: fileAttachment?.name,
        fileSize: fileAttachment?.size,
      },
    };
    addTimelineStep(userInputStep);

    // 初始化 agent
    if (!agentService.isAgentInitialized()) {
      const config = {
        apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
        baseURL: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
        model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
      };
      agentService.initialize(config);
    }

    // 设置回调
    agentService.setTimelineCallbacks({
      // 省略...
    });

    // 发送消息
    const agentResponse = await agentService.sendMessage(
      messageText,
      systemPrompt,
      selectedTools,
      contextStrategy,
      fileAttachment ? [fileAttachment] : undefined
    );

    // 处理响应
    addMessage('user', messageText, fileAttachment ? [fileAttachment] : undefined, text.trim() === '');
    saveCurrentSession();
    setInput('');
    handleRemoveFile();
  } catch (error) {
    console.error('发送失败:', error);
  } finally {
    setIsLoading(false);
  }
};
```

- [ ] **Step 4: 优化发送按钮状态**

```typescript
// 在 JSX 中修改发送按钮
<button
  onClick={handleSend}
  disabled={!isSendButtonEnabled}
  style={{
    position: 'absolute',
    right: '6px',
    bottom: '6px',
    width: '34px',
    height: '34px',
    background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    cursor: (!isSendButtonEnabled || isLoading) ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: (!isSendButtonEnabled || isLoading) ? 0.5 : 1,
  }}
>
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
</button>
```

- [ ] **Step 5: 添加发送按钮状态逻辑**

```typescript
const isSendButtonEnabled = text.trim() || selectedFile;
```

- [ ] **Step 6: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/components/ChatInteraction.tsx
git commit -m "feat(RQ-023/T3): optimize encoding detection and decoding"
```

---

### Task 4: 优化文件内容发送

**Files:**
- Modify: `context-lab/src/services/agentService.ts`

**Steps:**

- [ ] **Step 1: 优化发送逻辑**

```typescript
// src/services/agentService.ts
import type { FileAttachment } from '../types';

async sendMessage(text: string, systemPrompt: string, tools?: string[], contextStrategy?: ContextStrategy, files?: FileAttachment[]): Promise<string> {
  // 处理空文本但有文件的情况
  let messageContent = text;
  if (!text.trim() && files && files.length > 0) {
    const mainFile = files[0];
    messageContent = `我上传了一个文件：${mainFile.name}。请帮我分析或处理这个文件的内容。`;
  }
  
  // 处理文件内容
  if (files && files.length > 0) {
    for (const file of files) {
      if (isTextFile(file)) {
        const fileText = file.content || '';
        let contentToSend = fileText;
        
        // 截断过长内容
        const MAX_CONTENT_LENGTH = 10000;
        if (contentToSend.length > MAX_CONTENT_LENGTH) {
          contentToSend = contentToSend.slice(0, MAX_CONTENT_LENGTH) + '...\n\n[文件内容过长，已截断]';
        }
        
        messageContent += `\n\n以下是文件 "${file.name}" 的内容：\n${contentToSend}`;
      } else {
        messageContent += `\n\n已上传文件 "${file.name}"（${(file.size / 1024).toFixed(1)} KB）`;
      }
    }
  }
  
  // 继续原有的发送逻辑...
}

// 文件类型判断辅助函数
private isTextFile(file: FileAttachment): boolean {
  const textExtensions = ['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.css', '.js'];
  const contentType = file.type.toLowerCase();
  return contentType.startsWith('text/') || 
         textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
}
```

- [ ] **Step 2: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/services/agentService.ts
git commit -m "feat(RQ-023/T4): optimize file content sending"
```

---

### Task 5: 优化 appStore

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

**Steps:**

- [ ] **Step 1: 更新 addMessage 方法**

```typescript
addMessage: (role, content, files?, isFileOnly = false) => set(state => ({
  conversationHistory: [...state.conversationHistory, { 
    role, 
    content, 
    timestamp: new Date(), 
    files, 
    isFileOnly 
  }]
})),
```

- [ ] **Step 2: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
git add src/stores/appStore.ts
git commit -m "feat(RQ-023/T5): update appStore to support file-only messages"
```

---

### Task 6: 测试与验证

**Steps:**

- [ ] **Step 1: 启动开发服务器**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent\context-lab"
npm run dev
```

- [ ] **Step 2: 测试 UTF-8 文件**

1. 选择一个 UTF-8 编码的文本文件
2. 发送（输入框可以为空）
3. 验证文件内容是否正确发送

- [ ] **Step 3: 测试 GBK/GB2312 文件**

1. 创建一个 GBK 编码的中文文本文件
2. 发送
3. 验证文件内容是否正确显示和发送

- [ ] **Step 4: 测试大文件**

1. 创建一个超过 10KB 的文本文件
2. 发送
3. 验证内容是否正确截断

- [ ] **Step 5: 测试各种文件类型**

1. 测试 .md, .csv, .json 等文本文件
2. 验证发送和显示

- [ ] **Step 6: 测试仅文件发送**

1. 选择文件但输入框为空
2. 点击发送
3. 验证发送成功

---

### Task 7: 更新项目跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`
- Modify: `项目执行跟踪矩阵.html`

**Steps:**

- [ ] **Step 1: 更新状态**

```markdown
| RQ-023 | 进一步优化文件上传功能 | [`2026-05-17-file-upload-optimization-design.md`](docs/superpowers/specs/2026-05-17-file-upload-optimization-design.md) | [`2026-05-17-file-upload-optimization-implementation.md`](docs/superpowers/plans/2026-05-17-file-upload-optimization-implementation.md) | 🔄 执行中 |
```

- [ ] **Step 2: 更新时间线**

```markdown
- 📝 生成计划：RQ-023
```

- [ ] **Step 3: 生成 HTML**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
node .claude/skills/我要干活了/scripts/markdown-to-html.js "项目执行跟踪矩阵.md"
```

- [ ] **Step 4: Commit**

```bash
cd "D:\我的个人区间\糖糖的仓库\03-Projects（关注项目）\contextagent"
git add 项目执行跟踪矩阵.md 项目执行跟踪矩阵.html docs/superpowers/plans/2026-05-17-file-upload-optimization-implementation.md
git commit -m "docs(RQ-023): add implementation plan"
```

---

## 执行选择

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-file-upload-optimization-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

# RQ-036 思维草稿可视化（方案A）— 规格设计

## 需求概述

对 Claude 的深度思考内容进行启发式解析，识别并可视化展示"草稿"、"自我修正"、"重新思考"等内容，让思考过程的透明度更高，帮助用户理解模型的推理轨迹。

## 现状

- 深度思考已集成（RQ-029），但只是完整展示原始文本
- 无草稿识别逻辑
- 无草稿特殊样式展示
- 无草稿统计
- 用户无法直观区分哪些是"正式思考"，哪些是"临时草稿"

## 目标架构

```
收到 thinking 文本
  → ThinkingDraftParser.parse(thinkingText)
    → 生成带标记的 segments
  → UI 渲染
    → 正式思考：正常样式
    → 草稿：灰色删除线样式
  → 展示草稿统计：N 处草稿
```

## 功能设计

### 1. 草稿识别引擎

#### 识别规则（启发式）

识别以下模式为"草稿"：

```typescript
// 草稿关键词/模式
const DRAFT_PATTERNS = [
  // 中文模式
  /^\s*等等[，,.。！！!?]/i,           // "等等，让我想想"
  /^\s*哦，对了/i,                     // "哦，对了"
  /^\s*不对[，,.。！！!?]/i,            // "不对，应该是"
  /^\s*让我重新/i,                     // "让我重新考虑"
  /^\s*等等，我刚才/i,                  // "等等，我刚才的分析"
  /^\s*等一下[，,.。！！!?]/i,          // "等一下，我漏了"
  /^\s*等等，不对/i,                    // "等等，不对"

  // 英文模式
  /^\s*wait[，,.。！！!?\s]/i,         // "Wait, let me think"
  /^\s*wait a minute/i,                // "Wait a minute"
  /^\s*wait no/i,                      // "Wait no"
  /^\s*actually/i,                     // "Actually, ..."
  /^\s*wait actually/i,                // "Wait actually"
  /^\s*hold on/i,                      // "Hold on"
  /^\s*wait let me/i,                  // "Wait let me"

  // 删除线模拟（如果文本中有 ~~ 标记）
  /^~~.*~~$/,

  // 修正标记
  /^\s*(?:修正|修正一下|修改|改一下)\s*[：:]/i,  // "修正：..."
  /^\s*(?:更正|纠正)\s*[：:]/i,                     // "更正："

  // 自我否定
  /^\s*不，?\s*(?:应该|应当|是|不对)/i,  // "不，应该是..."
  /^\s*(?:不对|不对不对|不对不对不对)/i,  // "不对不对..."
];

// 过渡模式（表示草稿结束，开始正式思考）
const TRANSITION_PATTERNS = [
  /^\s*好，?\s*/i,                       // "好，"
  /^\s*好的，?\s*/i,                     // "好的，"
  /^\s*好的吧[，,.。！！!?\s]/i,         // "好的吧，"
  /^\s*那(?:好|么|就)[，,.。！！!?\s]/i, // "那好，"
  /^\s*(?:所以|因此|总之)\s*[，,.。！！!?]/i, // "所以，"
  /^\s*(?:最终|最后|总结)\s*[：:，,.。！！!?]/i, // "最终，"
  /^\s*(?:现在|好现在)\s*[，,.。！！!?]/i, // "现在，"
];
```

#### 解析算法

```typescript
interface ThinkingSegment {
  type: 'thinking' | 'draft' | 'transition';
  text: string;
  lineNumber: number;
  isDraft: boolean;
  pattern?: string; // 匹配到的模式（调试用）
}

export class ThinkingDraftParser {
  parse(thinkingText: string): ThinkingSegment[] {
    const lines = thinkingText.split('\n');
    const segments: ThinkingSegment[] = [];
    let inDraftMode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. 检查是否匹配草稿模式
      const matchedDraft = DRAFT_PATTERNS.find(p => p.test(trimmed));
      if (matchedDraft) {
        inDraftMode = true;
        segments.push({
          type: 'draft',
          text: line,
          lineNumber: i,
          isDraft: true,
          pattern: matchedDraft.toString(),
        });
        continue;
      }

      // 2. 检查是否匹配过渡模式（草稿结束）
      const matchedTransition = TRANSITION_PATTERNS.find(p => p.test(trimmed));
      if (matchedTransition && inDraftMode) {
        inDraftMode = false;
        segments.push({
          type: 'transition',
          text: line,
          lineNumber: i,
          isDraft: false,
        });
        continue;
      }

      // 3. 检查空行是否结束草稿
      if (inDraftMode && trimmed === '') {
        // 看后面几行是否都是草稿
        const nextLines = lines.slice(i + 1, i + 3);
        const hasMoreDraft = nextLines.some(l => 
          DRAFT_PATTERNS.some(p => p.test(l.trim()))
        );
        
        if (!hasMoreDraft) {
          inDraftMode = false;
        }
      }

      // 4. 默认：延续当前模式
      segments.push({
        type: inDraftMode ? 'draft' : 'thinking',
        text: line,
        lineNumber: i,
        isDraft: inDraftMode,
      });
    }

    // 后处理：合并连续的相同类型
    return this.mergeSegments(segments);
  }

  private mergeSegments(segments: ThinkingSegment[]): ThinkingSegment[] {
    const merged: ThinkingSegment[] = [];
    let current: ThinkingSegment | null = null;

    for (const seg of segments) {
      if (current && current.type === seg.type) {
        current.text += '\n' + seg.text;
      } else {
        if (current) merged.push(current);
        current = { ...seg };
      }
    }

    if (current) merged.push(current);
    return merged;
  }

  // 统计草稿
  getDraftStats(segments: ThinkingSegment[]): DraftStats {
    const draftSegments = segments.filter(s => s.isDraft);
    const draftLines = draftSegments.reduce((sum, s) => 
      sum + s.text.split('\n').filter(l => l.trim() !== '').length, 0
    );
    const totalLines = segments.filter(s => s.text.trim() !== '').length;
    return {
      draftCount: draftSegments.length,
      draftLineCount: draftLines,
      totalLines: totalLines,
      draftRatio: totalLines > 0 ? draftLines / totalLines : 0,
    };
  }
}
```

### 2. UI 展示设计

#### 对话气泡中的展示

在现有思考内容展示的基础上，增加草稿样式：

```
┌─────────────────────────────────────────────────────────┐
│  💭 深度思考 · 1,247 tokens · [📝 草稿: 3处] [展开]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  我需要回答用户的问题...                           │
│                                                          │
│  ┌───────────────────────────────────────────────┐  │
│  │ 📝 草稿（已划掉）                       │  │
│  │ ~~等等，我刚才的分析有误...~~              │  │
│  │ ~~哦，对了，还需要考虑这个因素~~          │  │
│  └───────────────────────────────────────────────┘  │
│                                                          │
│  好的，让我正式分析一下...                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 样式设计

```css
/* 草稿样式 */
.thinking-draft {
  background: rgba(255, 193, 7, 0.08); /* 淡黄色背景 */
  border-left: 3px solid rgba(255, 193, 7, 0.4);
  padding: 6px 10px;
  margin: 4px 0;
  border-radius: 4px;
}

.thinking-draft-text {
  text-decoration: line-through; /* 删除线 */
  color: var(--text-tertiary); /* 浅灰色 */
  opacity: 0.7;
}

/* 草稿标记图标 */
.draft-icon {
  display: inline-block;
  margin-right: 6px;
  font-size: 12px;
  opacity: 0.8;
}

/* 草稿统计标签 */
.draft-stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.25);
  border-radius: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.draft-stat-badge:hover {
  background: rgba(255, 193, 7, 0.25);
  color: #f59e0b;
}

.draft-stat-badge.active {
  background: rgba(255, 193, 7, 0.15);
  color: #f59e0b;
}

/* 草稿切换按钮 */
.toggle-drafts-btn {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-drafts-btn:hover {
  background: var(--bg-surface);
}

.toggle-drafts-btn.hidden {
  opacity: 0.5;
}
```

#### 交互功能

**草稿显示/隐藏切换**：
- 默认显示草稿（视觉上用删除线区分）
- 点击 `📝 草稿: 3处` 按钮可切换草稿的可见性
- 隐藏时：只显示 `📝 草稿: 3处 (已隐藏)`，草稿内容不显示
- 切换状态仅 UI 局部，不持久化

**草稿悬浮提示**：
- 鼠标悬浮在草稿区域时，显示小提示："这是模型的思考草稿，可能包含临时想法"

### 3. Timeline 中的展示

在 Timeline 的深度思考步骤中也展示草稿统计：

```
💭 深度思考完成 · 1,247 tokens · 📝 3处草稿
[展开]
```

展开后显示同样的带样式内容。

### 4. 数据结构扩展

#### Message 类型已有支持
（无需改动，thinkingContent 已存在）

#### 新增解析结果类型

```typescript
// 在 types/index.ts 或相关文件中添加
interface ThinkingSegment {
  type: 'thinking' | 'draft' | 'transition';
  text: string;
  lineNumber: number;
  isDraft: boolean;
  pattern?: string;
}

interface DraftStats {
  draftCount: number;
  draftLineCount: number;
  totalLines: number;
  draftRatio: number;
}
```

## 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/utils/thinking-draft-parser.ts` | 新增 | 草稿识别引擎 |
| `src/components/MessageBubble.tsx` | 修改 | 增加草稿样式展示、草稿显示/隐藏切换功能 |
| `src/components/TimelineReplay.tsx` | 修改 | Timeline 中展示草稿统计 |
| `src/types/index.ts` | 修改（可选） | 新增类型定义 |

## 约束与考量

### 1. 识别准确率

- 启发式规则不可能 100% 准确
- 设计目标：80% 的常见情况能识别
- 不追求完美，追求"有比没有好"
- 如果识别错误，用户仍能看到完整文本（只是样式不对）

### 2. 性能

- 解析在客户端进行，对普通长度的 thinking（几千字）无压力
- 不需要持久化解析结果，每次渲染时重新解析（简单可靠）

### 3. 向后兼容

- 无草稿时，UI 与之前完全一致
- 有草稿时，渐进增强展示
- 零侵入现有功能

### 4. 可扩展性

- `DRAFT_PATTERNS` 设计为可扩展的数组
- 未来可以：
  - 让用户自定义草稿标记（如 `// draft`）
  - 添加更复杂的 NLP 模型
  - 支持用户手动标记/取消标记草稿

## 用户体验目标

1. **直观性**：用户一眼就能看出哪些是草稿
2. **不干扰**：草稿不影响阅读正式内容
3. **信息丰富**：展示草稿数量，让用户知道模型"思考得多努力"
4. **可控制**：用户可以选择隐藏草稿，专注看正式内容

# RQ-036 思维草稿可视化（方案A） 实现计划

> **For agentic workers**: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: 实现思维草稿的启发式解析和可视化展示，让用户能直观区分"正式思考"和"临时草稿"。

**Architecture**: 新增 ThinkingDraftParser 工具类，修改 MessageBubble 增加草稿样式展示，修改 TimelineReplay 增加草稿统计。

**Tech Stack**: React 18、TypeScript、Zustand、启发式解析算法

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 新增 | `context-lab/src/utils/thinking-draft-parser.ts` | 草稿识别引擎 |
| 修改 | `context-lab/src/components/MessageBubble.tsx` | 草稿样式展示、草稿显示/隐藏切换 |
| 修改 | `context-lab/src/components/TimelineReplay.tsx` | Timeline 中展示草稿统计 |
| 修改（可选） | `context-lab/src/types/index.ts` | 新增类型定义 |

---

### Task 1: 创建草稿识别引擎（thinking-draft-parser.ts）

**Files**:
- New: `context-lab/src/utils/thinking-draft-parser.ts`

- [x] **Step 1: 创建完整的 ThinkingDraftParser 类**

在 `src/utils/` 下创建 `thinking-draft-parser.ts`，内容参考 spec 中的代码。

```typescript
export interface ThinkingSegment {
  type: 'thinking' | 'draft' | 'transition';
  text: string;
  lineNumber: number;
  isDraft: boolean;
  pattern?: string;
}

export interface DraftStats {
  draftCount: number;
  draftLineCount: number;
  totalLines: number;
  draftRatio: number;
}

// DRAFT_PATTERNS and TRANSITION_PATTERNS here...

export class ThinkingDraftParser {
  // parse, mergeSegments, getDraftStats methods...
}

export const thinkingDraftParser = new ThinkingDraftParser();
```

- [x] **Step 2: Commit**

```bash
cd context-lab && git add src/utils/thinking-draft-parser.ts
git commit -m "feat(RQ-036/T1): add ThinkingDraftParser utility"
```

---

### Task 2: 修改 MessageBubble.tsx 增加草稿样式展示

**Files**:
- Modify: `context-lab/src/components/MessageBubble.tsx`

- [x] **Step 1: 导入解析器和新增状态**

在 MessageBubble.tsx 的 import 区域添加：

```typescript
import { thinkingDraftParser } from '../utils/thinking-draft-parser';
```

在组件内部，`thinkingExpanded` 状态后添加：

```typescript
const [showDrafts, setShowDrafts] = React.useState(true);
```

- [x] **Step 2: 修改 thinking 内容展示区域，添加草稿统计按钮**

找到 thinking 展示区域，修改整个区域：

```typescript
{/* Thinking content */}
{'thinkingContent' in message && (message as any).thinkingContent && !isUser && (
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
      {/* Draft stats button */}
      {(() => {
        const segments = thinkingDraftParser.parse((message as any).thinkingContent);
        const draftStats = thinkingDraftParser.getDraftStats(segments);
        if (draftStats.draftCount > 0) {
          return (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDrafts(!showDrafts); }}
              style={{
                marginLeft: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: showDrafts ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.08)',
                border: '1px solid rgba(255,193,7,0.25)',
                borderRadius: '12px',
                fontSize: '11px',
                color: showDrafts ? '#f59e0b' : 'var(--text-tertiary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,193,7,0.2)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = showDrafts ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.08)';
              }}
              title={showDrafts ? '点击隐藏草稿' : '点击显示草稿'}
            >
              📝 {draftStats.draftCount}处草稿
            </button>
          );
        }
        return null;
      })()}
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
        fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)',
      }}>
        {renderThinkingContentWithDraftStyles(message, showDrafts)}
      </div>
    )}
  </div>
)}
```

- [x] **Step 3: 添加草稿渲染辅助函数**

在 MessageBubble 组件外部（导入之后）添加：

```typescript
// 渲染带草稿样式的 thinking 内容
function renderThinkingContentWithDraftStyles(message: any, showDrafts: boolean) {
  const thinkingContent = message.thinkingContent as string;
  if (!thinkingContent) return null;

  const segments = thinkingDraftParser.parse(thinkingContent);

  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.isDraft && !showDrafts) {
          return null; // 隐藏草稿
        }

        if (seg.isDraft) {
          // 草稿样式
          return (
            <div
              key={i}
              style={{
                background: 'rgba(255,193,7,0.08)',
                borderLeft: '3px solid rgba(255,193,7,0.4)',
                padding: '6px 10px',
                margin: '4px 0',
                borderRadius: '4px',
              }}
            >
              <span
                style={{
                  textDecoration: 'line-through',
                  color: 'var(--text-tertiary)',
                  opacity: 0.7,
                  whiteSpace: 'pre-wrap',
                }}
              >
                📝 {seg.text}
              </span>
            </div>
          );
        }

        // 正式思考样式
        return (
          <div key={i} style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>
            {seg.text}
          </div>
        );
      })}
    </div>
  );
}
```

- [x] **Step 4: Commit**

```bash
cd context-lab && git add src/components/MessageBubble.tsx
git commit -m "feat(RQ-036/T2): add draft visualization in MessageBubble"
```

---

### Task 3: 修改 TimelineReplay.tsx 展示草稿统计

**Files**:
- Modify: `context-lab/src/components/TimelineReplay.tsx`

- [x] **Step 1: 导入解析器**

在 TimelineReplay.tsx 的 import 区域添加：

```typescript
import { thinkingDraftParser } from '../utils/thinking-draft-parser';
```

- [x] **Step 2: 在 thinking 步骤展示草稿统计**

找到 TimelineReplay 中渲染步骤按钮的部分，修改按钮内的内容显示草稿统计：

```typescript
<button
  onClick={() => handleStepClick(step.id, !!isClickable)}
  style={{ ... }}
>
  {step.icon} {step.toolCallName || step.title}
  {/* Show draft stats for thinking steps */}
  {step.type === 'thinking' && step.details && (() => {
    const details = step.details as any;
    if (details.thinkingContent) {
      const segments = thinkingDraftParser.parse(details.thinkingContent);
      const draftStats = thinkingDraftParser.getDraftStats(segments);
      if (draftStats.draftCount > 0) {
        return (
          <span style={{
            marginLeft: '4px',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            background: 'rgba(255,193,7,0.08)',
            padding: '1px 6px',
            borderRadius: '8px',
          }}>
            📝 {draftStats.draftCount}
          </span>
        );
      }
    }
    return null;
  })()}
</button>
```

- [x] **Step 3: Commit**

```bash
cd context-lab && git add src/components/TimelineReplay.tsx
git commit -m "feat(RQ-036/T3): add draft stats in TimelineReplay"
```

---

### Task 4: 验证 + 清理 + 更新跟踪矩阵

**Files**:
- 检查所有文件

- [x] **Step 1: 运行 typecheck**

```bash
cd context-lab && npm run typecheck
```

预期：通过，无错误。

- [x] **Step 2: 运行生产构建**

```bash
cd context-lab && npm run build
```

预期：构建成功。

- [x] **Step 3: 打开浏览器，手动验证**

验证路径：
1. 打开应用
2. 确认开启深度思考（💡 按钮）
3. 发送一条消息（如"分析一下 RAG 的优缺点"）
4. 确认对话气泡中能看到 thinking 内容
5. 点击展开 thinking，确认草稿被识别并显示删除线样式
6. 点击 `📝 X处草稿` 按钮，确认草稿可以隐藏/显示
7. 查看 Timeline，确认 thinking 步骤显示草稿数量统计
8. 无草稿时，确认 UI 与之前一致（向后兼容）

- [x] **Step 4: 更新项目执行跟踪矩阵**

更新 `项目执行跟踪矩阵.md`，记录 RQ-036 完成。

- [x] **Step 5: Commit**

```bash
cd context-lab && git add -A
git commit -m "feat(RQ-036/T4): verify and cleanup thinking draft visualization"
```

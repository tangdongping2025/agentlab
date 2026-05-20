# 上下文窗口可视化学习界面 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an educational visualization interface for context window management, including token breakdown, context structure tree, strategy comparison, and timeline replay.

**Architecture:** Replace existing `ContextVisualizer.tsx` with a new modular component system. Each visualization feature is a standalone component that subscribes to Zustand store updates. All components follow existing patterns in the codebase.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, Recharts (for visualization)

---

## File Structure

### New Files (to create)
- `context-lab/src/components/TokenAllocation.tsx` - Token breakdown pie chart and legend
- `context-lab/src/components/ContextStructureTree.tsx` - Hierarchical context display
- `context-lab/src/components/StrategyComparator.tsx` - Strategy comparison display
- `context-lab/src/components/TimelineReplay.tsx` - Conversation timeline replay
- `context-lab/src/components/DetailPanel.tsx` - Expandable detail panel
- `context-lab/src/components/ContextWindowVisualizer.tsx` - Main wrapper component (replaces ContextVisualizer)

### Modified Files
- `context-lab/src/App.tsx` - Replace ContextVisualizer with new ContextWindowVisualizer
- `context-lab/src/stores/appStore.ts` - Add timeline replay state and learning notes
- `context-lab/src/utils/formatters.ts` - Add token percentage formatter

### Test Files
- `context-lab/src/components/TokenAllocation.test.tsx`
- `context-lab/src/components/ContextStructureTree.test.tsx`
- `context-lab/src/components/StrategyComparator.test.tsx`
- `context-lab/src/components/TimelineReplay.test.tsx`

---

## Task 1: Update Formatter Utils

**Files:**
- Modify: `context-lab/src/utils/formatters.ts`

### Step 1: Add token percentage formatter

```typescript
// src/utils/formatters.ts
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

export function formatTokenCount(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }

  return num.toString();
}

export function formatTokenPercentage(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `cd context-lab && npm run test:run -- utils`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/utils/formatters.ts
git commit -m "feat: add token percentage formatter"
```

---

## Task 2: Extend Zustand Store

**Files:**
- Modify: `context-lab/src/stores/appStore.ts`

### Step 1: Add new state types and properties

Add to AppState interface:
```typescript
// Timeline replay state
timelineReplayIndex: number;
isTimelinePlaying: boolean;
timelineSpeed: number;
showLearningNotes: boolean;
showDetailPanel: boolean;
learningNotes: string[];

// Timeline methods
setTimelineReplayIndex: (index: number) => void;
toggleTimelinePlaying: () => void;
setTimelineSpeed: (speed: number) => void;
toggleLearningNotes: () => void;
toggleDetailPanel: () => void;
addLearningNote: (note: string) => void;
clearLearningNotes: () => void;
```

### Step 2: Update store implementation

Add to store initial state:
```typescript
timelineReplayIndex: 0,
isTimelinePlaying: false,
timelineSpeed: 1000,
showLearningNotes: true,
showDetailPanel: false,
learningNotes: [
  "系统提示词定义了角色和任务",
  "对话历史是最大的Token消耗",
  "策略优化可以显著降低成本"
],
```

Add to store methods:
```typescript
setTimelineReplayIndex: (index) => set({ timelineReplayIndex: index }),
toggleTimelinePlaying: () => set((state) => ({ isTimelinePlaying: !state.isTimelinePlaying })),
setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),
toggleLearningNotes: () => set((state) => ({ showLearningNotes: !state.showLearningNotes })),
toggleDetailPanel: () => set((state) => ({ showDetailPanel: !state.showDetailPanel })),
addLearningNote: (note) => set((state) => ({ learningNotes: [...state.learningNotes, note] })),
clearLearningNotes: () => set({ learningNotes: [] }),
```

- [ ] **Step 3: Verify type checking**

Run: `cd context-lab && npm run typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add context-lab/src/stores/appStore.ts
git commit -m "feat: add timeline replay and learning notes state"
```

---

## Task 3: Create TokenAllocation Component

**Files:**
- Create: `context-lab/src/components/TokenAllocation.tsx`
- Test: `context-lab/src/components/TokenAllocation.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/TokenAllocation.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TokenAllocation from './TokenAllocation';

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    systemPrompt: "Test system prompt",
    lastUserInput: "Test user input",
    conversationHistory: [],
    apiInteractions: []
  })
}));

describe('TokenAllocation', () => {
  it('renders token breakdown title', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('Token 分配')).toBeInTheDocument();
  });

  it('displays system prompt token section', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('系统提示词')).toBeInTheDocument();
  });

  it('displays user input token section', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('用户输入')).toBeInTheDocument();
  });

  it('displays conversation history token section', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('对话历史')).toBeInTheDocument();
  });

  it('displays API interaction token section', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('工具调用')).toBeInTheDocument();
  });

  it('displays total token count', () => {
    render(<TokenAllocation />);
    expect(screen.getByText('tokens')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- TokenAllocation`
Expected: FAIL with "TokenAllocation is not a function" or similar

### Step 3: Write minimal implementation

```typescript
// src/components/TokenAllocation.tsx
import React from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatNumber, formatTokenPercentage } from '../utils/formatters';

const tokenService = new TokenService();

interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  api: number;
  total: number;
}

function TokenAllocation() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions } = useAppStore();

  const calculateBreakdown = (): TokenBreakdown => {
    const systemTokens = tokenService.calculate(systemPrompt);
    const userTokens = tokenService.calculate(lastUserInput);
    const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
    const apiTokens = apiInteractions.reduce((sum, api) => {
      const requestTokens = tokenService.calculate(api.request.body);
      const responseTokens = api.response ? tokenService.calculate(api.response.body) : 0;
      return sum + requestTokens + responseTokens;
    }, 0);

    return {
      system: systemTokens,
      user: userTokens,
      history: historyTokens,
      api: apiTokens,
      total: systemTokens + userTokens + historyTokens + apiTokens
    };
  };

  const breakdown = calculateBreakdown();

  const breakdownItems = [
    { label: '系统提示词', value: breakdown.system, color: '#10b981', labelColor: '#065f46' },
    { label: '用户输入', value: breakdown.user, color: '#f59e0b', labelColor: '#92400e' },
    { label: '对话历史', value: breakdown.history, color: '#8b5cf6', labelColor: '#5b21b6' },
    { label: '工具调用', value: breakdown.api, color: '#64748b', labelColor: '#374151' }
  ];

  const getPieChartStyles = () => {
    if (breakdown.total === 0) {
      return { background: '#e5e7eb' };
    }
    const systemDeg = (breakdown.system / breakdown.total) * 360;
    const userDeg = (breakdown.user / breakdown.total) * 360;
    const historyDeg = (breakdown.history / breakdown.total) * 360;
    
    const stops = [
      `#10b981 0deg ${systemDeg}deg`,
      `#f59e0b ${systemDeg}deg ${systemDeg + userDeg}deg`,
      `#8b5cf6 ${systemDeg + userDeg}deg ${systemDeg + userDeg + historyDeg}deg`,
      `#64748b ${systemDeg + userDeg + historyDeg}deg 360deg`
    ].join(', ');
    
    return { background: `conic-gradient(${stops})` };
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <h3 className="text-sm font-bold text-slate-800">Token 分配</h3>
      </div>
      
      <div className="flex flex-col items-center gap-4">
        {/* Pie Chart */}
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center shadow-md"
          style={getPieChartStyles()}
        >
          <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-sm">
            <span className="text-lg font-bold text-slate-800">{formatNumber(breakdown.total)}</span>
            <span className="text-xs text-slate-500 font-medium">tokens</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-2">
          {breakdownItems.map((item) => (
            <div 
              key={item.label} 
              className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-md"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  {formatNumber(item.value)} tokens
                </span>
                <span 
                  className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{ 
                    backgroundColor: `${item.color}20`,
                    color: item.labelColor
                  }}
                >
                  {formatTokenPercentage(item.value, breakdown.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TokenAllocation;
```

### Step 4: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- TokenAllocation`
Expected: All 5 tests PASS

### Step 5: Commit

```bash
git add context-lab/src/components/TokenAllocation.test.tsx context-lab/src/components/TokenAllocation.tsx
git commit -m "feat: add TokenAllocation component with pie chart visualization"
```

---

## Task 4: Create ContextStructureTree Component

**Files:**
- Create: `context-lab/src/components/ContextStructureTree.tsx`
- Test: `context-lab/src/components/ContextStructureTree.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/ContextStructureTree.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextStructureTree from './ContextStructureTree';

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    systemPrompt: "Test system prompt",
    lastUserInput: "Test user input",
    conversationHistory: [],
    apiInteractions: []
  })
}));

describe('ContextStructureTree', () => {
  it('renders structure tree title', () => {
    render(<ContextStructureTree />);
    expect(screen.getByText('上下文结构')).toBeInTheDocument();
  });

  it('displays system prompt node', () => {
    render(<ContextStructureTree />);
    expect(screen.getByText('系统提示词')).toBeInTheDocument();
  });

  it('displays user input node', () => {
    render(<ContextStructureTree />);
    expect(screen.getByText('用户输入')).toBeInTheDocument();
  });

  it('displays conversation history node', () => {
    render(<ContextStructureTree />);
    expect(screen.getByText('对话历史')).toBeInTheDocument();
  });

  it('displays API interaction node', () => {
    render(<ContextStructureTree />);
    expect(screen.getByText('工具调用')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- ContextStructureTree`
Expected: FAIL with "ContextStructureTree is not a function" or similar

### Step 3: Write minimal implementation

```typescript
// src/components/ContextStructureTree.tsx
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatNumber } from '../utils/formatters';

const tokenService = new TokenService();

interface TreeNodeProps {
  icon: string;
  title: string;
  tokens: number;
  content: string;
  bgClass: string;
  textClass: string;
  expandable?: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  icon,
  title,
  tokens,
  content,
  bgClass,
  textClass,
  expandable = true
}) => {
  const [expanded, setExpanded] = useState(false);

  const truncateContent = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="mb-3 rounded-lg overflow-hidden border border-slate-200">
      <div 
        className={`flex items-center justify-between p-3 ${bgClass} cursor-pointer`}
        onClick={() => expandable && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className={`text-sm font-bold ${textClass}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-1 rounded-full bg-white/50">
            {formatNumber(tokens)} tokens
          </span>
          {expandable && (
            <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          )}
        </div>
      </div>
      {expanded && content && (
        <div className="p-3 bg-white border-t border-slate-100">
          <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
            {truncateContent(content)}
          </pre>
        </div>
      )}
    </div>
  );
};

function ContextStructureTree() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions } = useAppStore();

  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(lastUserInput);
  const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
  const apiTokens = apiInteractions.reduce((sum, api) => {
    const requestTokens = tokenService.calculate(api.request.body);
    const responseTokens = api.response ? tokenService.calculate(api.response.body) : 0;
    return sum + requestTokens + responseTokens;
  }, 0);

  const formatHistoryContent = () => {
    if (conversationHistory.length === 0) return '暂无历史消息';
    return `包含 ${conversationHistory.length} 条历史消息\n\n` + 
      conversationHistory.map(msg => `[${msg.role}] ${msg.content.substring(0, 50)}...`).join('\n');
  };

  const formatApiContent = () => {
    if (apiInteractions.length === 0) return '暂无API调用';
    return `包含 ${apiInteractions.length} 次API调用记录\n\n` +
      apiInteractions.map(api => `[${api.timestamp.toLocaleTimeString()}] Request sent`).join('\n');
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🌳</span>
        <h3 className="text-sm font-bold text-slate-800">上下文结构</h3>
      </div>

      <div className="space-y-1">
        <TreeNode
          icon="📄"
          title="系统提示词"
          tokens={systemTokens}
          content={systemPrompt}
          bgClass="bg-gradient-to-r from-emerald-50 to-emerald-100"
          textClass="text-emerald-800"
        />

        <TreeNode
          icon="💬"
          title="用户输入"
          tokens={userTokens}
          content={lastUserInput || '暂无用户输入'}
          bgClass="bg-gradient-to-r from-amber-50 to-amber-100"
          textClass="text-amber-800"
        />

        <TreeNode
          icon="📜"
          title="对话历史"
          tokens={historyTokens}
          content={formatHistoryContent()}
          bgClass="bg-gradient-to-r from-violet-50 to-violet-100"
          textClass="text-violet-800"
        />

        <TreeNode
          icon="🔧"
          title="工具调用"
          tokens={apiTokens}
          content={formatApiContent()}
          bgClass="bg-gradient-to-r from-slate-100 to-slate-200"
          textClass="text-slate-700"
        />
      </div>
    </div>
  );
}

export default ContextStructureTree;
```

### Step 4: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- ContextStructureTree`
Expected: All 5 tests PASS

### Step 5: Commit

```bash
git add context-lab/src/components/ContextStructureTree.test.tsx context-lab/src/components/ContextStructureTree.tsx
git commit -m "feat: add ContextStructureTree component with expandable nodes"
```

---

## Task 5: Create StrategyComparator Component

**Files:**
- Create: `context-lab/src/components/StrategyComparator.tsx`
- Test: `context-lab/src/components/StrategyComparator.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/StrategyComparator.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StrategyComparator from './StrategyComparator';

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    contextStrategy: 'full',
    setStrategy: vi.fn(),
    conversationHistory: []
  })
}));

describe('StrategyComparator', () => {
  it('renders strategy comparison title', () => {
    render(<StrategyComparator />);
    expect(screen.getByText('策略对比')).toBeInTheDocument();
  });

  it('displays all four strategies', () => {
    render(<StrategyComparator />);
    expect(screen.getByText('完整记忆')).toBeInTheDocument();
    expect(screen.getByText('滑动窗口')).toBeInTheDocument();
    expect(screen.getByText('摘要策略')).toBeInTheDocument();
    expect(screen.getByText('无记忆')).toBeInTheDocument();
  });

  it('highlights current active strategy', () => {
    render(<StrategyComparator />);
    expect(screen.getByText('完整记忆').closest('[class*="active"]')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- StrategyComparator`
Expected: FAIL with "StrategyComparator is not a function" or similar

### Step 3: Write minimal implementation

```typescript
// src/components/StrategyComparator.tsx
import React from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';

const tokenService = new TokenService();

interface StrategyInfo {
  id: 'full' | 'sliding' | 'summary' | 'none';
  name: string;
  icon: string;
  description: string;
  savingsPercent: number;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const strategies: StrategyInfo[] = [
  {
    id: 'full',
    name: '完整记忆',
    icon: '✅',
    description: '保留所有对话历史',
    savingsPercent: 0,
    bgClass: 'bg-gradient-to-r from-violet-50 to-violet-100',
    textClass: 'text-violet-800',
    borderClass: 'border-violet-300'
  },
  {
    id: 'sliding',
    name: '滑动窗口',
    icon: '📦',
    description: '只保留最近10条消息',
    savingsPercent: 40,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  },
  {
    id: 'summary',
    name: '摘要策略',
    icon: '📝',
    description: '压缩历史为摘要',
    savingsPercent: 60,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  },
  {
    id: 'none',
    name: '无记忆',
    icon: '❌',
    description: '每次都是全新对话',
    savingsPercent: 80,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  }
];

function StrategyComparator() {
  const { contextStrategy, setStrategy, conversationHistory, systemPrompt } = useAppStore();

  const currentTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0) +
    tokenService.calculate(systemPrompt);

  const calculateEstimatedTokens = (strategy: string) => {
    if (strategy === 'none') return tokenService.calculate(systemPrompt);
    if (strategy === 'sliding') {
      const recentHistory = conversationHistory.slice(-10);
      return recentHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0) +
        tokenService.calculate(systemPrompt);
    }
    if (strategy === 'summary') {
      return Math.round(currentTokens * 0.4);
    }
    return currentTokens;
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🔄</span>
        <h3 className="text-sm font-bold text-slate-800">策略对比</h3>
      </div>

      <div className="space-y-2">
        {strategies.map((strategy) => {
          const isActive = contextStrategy === strategy.id;
          const estimatedTokens = calculateEstimatedTokens(strategy.id);
          const isSavings = strategy.savingsPercent > 0;

          return (
            <div
              key={strategy.id}
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                isActive 
                  ? `${strategy.bgClass} ${strategy.borderClass} shadow-sm` 
                  : 'bg-white border-slate-200 hover:border-violet-200'
              }`}
              onClick={() => setStrategy(strategy.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{strategy.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${isActive ? strategy.textClass : 'text-slate-800'}`}>
                      {strategy.name}
                    </div>
                    <div className="text-xs text-slate-500">{strategy.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  {isSavings ? (
                    <div className="text-xs font-bold text-violet-600">
                      节省 {strategy.savingsPercent}%
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-slate-600">
                      {estimatedTokens.toLocaleString()} tokens
                    </div>
                  )}
                </div>
              </div>
              {isActive && (
                <div className="mt-2 pt-2 border-t border-violet-200">
                  <div className="text-xs text-violet-600 font-medium">
                    • 当前使用此策略
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StrategyComparator;
```

### Step 4: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- StrategyComparator`
Expected: All 3 tests PASS

### Step 5: Commit

```bash
git add context-lab/src/components/StrategyComparator.test.tsx context-lab/src/components/StrategyComparator.tsx
git commit -m "feat: add StrategyComparator component with savings estimation"
```

---

## Task 6: Create TimelineReplay Component

**Files:**
- Create: `context-lab/src/components/TimelineReplay.tsx`
- Test: `context-lab/src/components/TimelineReplay.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/TimelineReplay.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimelineReplay from './TimelineReplay';

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    conversationHistory: [],
    timelineReplayIndex: 0,
    isTimelinePlaying: false,
    setTimelineReplayIndex: vi.fn(),
    toggleTimelinePlaying: vi.fn()
  })
}));

describe('TimelineReplay', () => {
  it('renders timeline replay title', () => {
    render(<TimelineReplay />);
    expect(screen.getByText('时间轴回放')).toBeInTheDocument();
  });

  it('displays timeline steps', () => {
    render(<TimelineReplay />);
    expect(screen.getByText('系统初始化')).toBeInTheDocument();
  });

  it('has playback controls', () => {
    render(<TimelineReplay />);
    expect(screen.getByText('⏮️')).toBeInTheDocument();
    expect(screen.getByText('◀️')).toBeInTheDocument();
    expect(screen.getByText('▶️')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- TimelineReplay`
Expected: FAIL with "TimelineReplay is not a function" or similar

### Step 3: Write minimal implementation

```typescript
// src/components/TimelineReplay.tsx
import React, { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

interface TimelineStep {
  id: string;
  icon: string;
  label: string;
  description: string;
}

const defaultSteps: TimelineStep[] = [
  { id: 'init', icon: '📄', label: '系统初始化', description: '加载配置和初始状态' },
  { id: 'user-greet', icon: '💬', label: '用户问候', description: '用户发送第一条消息' },
  { id: 'assistant-response', icon: '🤖', label: '助手响应', description: 'AI生成第一条回复' },
  { id: 'user-request', icon: '💬', label: '用户请求', description: '用户发送具体需求' },
  { id: 'tool-call', icon: '🔧', label: '工具调用', description: 'AI调用相关工具' },
  { id: 'final-response', icon: '🤖', label: '最终响应', description: 'AI给出完整回答' }
];

function TimelineReplay() {
  const {
    conversationHistory,
    timelineReplayIndex,
    isTimelinePlaying,
    timelineSpeed,
    setTimelineReplayIndex,
    toggleTimelinePlaying
  } = useAppStore();

  // Generate dynamic steps based on actual conversation history
  const getSteps = (): TimelineStep[] => {
    if (conversationHistory.length === 0) {
      return defaultSteps;
    }

    const steps: TimelineStep[] = [
      { id: 'init', icon: '📄', label: '系统初始化', description: '配置加载完成' }
    ];

    conversationHistory.forEach((msg, index) => {
      steps.push({
        id: `msg-${index}`,
        icon: msg.role === 'user' ? '💬' : '🤖',
        label: msg.role === 'user' ? '用户消息' : '助手响应',
        description: msg.content.substring(0, 30) + '...'
      });
    });

    return steps;
  };

  const steps = getSteps();
  const currentStep = Math.min(timelineReplayIndex, steps.length - 1);

  // Auto-play effect
  useEffect(() => {
    if (!isTimelinePlaying) return;

    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        setTimelineReplayIndex(currentStep + 1);
      } else {
        toggleTimelinePlaying();
      }
    }, timelineSpeed);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, currentStep, steps.length, setTimelineReplayIndex, toggleTimelinePlaying, timelineSpeed]);

  const handleStepClick = (index: number) => {
    setTimelineReplayIndex(index);
  };

  const goToStart = useCallback(() => {
    setTimelineReplayIndex(0);
  }, [setTimelineReplayIndex]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setTimelineReplayIndex(currentStep - 1);
    }
  }, [currentStep, setTimelineReplayIndex]);

  const goForward = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setTimelineReplayIndex(currentStep + 1);
    }
  }, [currentStep, steps.length, setTimelineReplayIndex]);

  const progressPercent = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">⏱️</span>
        <h3 className="text-sm font-bold text-slate-800">时间轴回放</h3>
      </div>

      {/* Timeline Steps */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex-shrink-0 w-24 p-2 rounded-lg border-2 cursor-pointer transition-all hover:shadow-sm ${
              index <= currentStep
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300'
                : 'bg-white border-slate-200'
            } ${index === currentStep ? 'ring-2 ring-blue-400' : ''}`}
            onClick={() => handleStepClick(index)}
          >
            <div className="text-center">
              <div className="text-xl mb-1">{step.icon}</div>
              <div className="text-xs font-bold text-slate-700 truncate">{step.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Step Description */}
      {steps[currentStep] && (
        <div className="bg-white rounded-lg p-3 mb-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{steps[currentStep].icon}</span>
            <span className="text-sm font-bold text-slate-800">{steps[currentStep].label}</span>
          </div>
          <div className="text-xs text-slate-600">{steps[currentStep].description}</div>
        </div>
      )}

      {/* Playback Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={goToStart}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="回到开始"
        >
          ⏮️
        </button>
        <button
          onClick={goBack}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="后退一步"
        >
          ◀️
        </button>
        <div className="flex-1">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          onClick={goForward}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="前进一步"
        >
          ▶️
        </button>
        <button
          onClick={toggleTimelinePlaying}
          className={`p-2 rounded-lg border transition-all ${
            isTimelinePlaying
              ? 'bg-gradient-to-r from-amber-100 to-orange-100 border-amber-400 text-amber-700'
              : 'bg-gradient-to-r from-blue-500 to-violet-500 border-blue-500 text-white'
          }`}
          title={isTimelinePlaying ? '暂停' : '自动播放'}
        >
          {isTimelinePlaying ? '⏸️' : '⏯️'}
        </button>
      </div>

      {/* Step Counter */}
      <div className="mt-3 text-center text-xs text-slate-500">
        第 {currentStep + 1} 步 / 共 {steps.length} 步
      </div>
    </div>
  );
}

export default TimelineReplay;
```

### Step 4: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- TimelineReplay`
Expected: All 3 tests PASS

### Step 5: Commit

```bash
git add context-lab/src/components/TimelineReplay.test.tsx context-lab/src/components/TimelineReplay.tsx
git commit -m "feat: add TimelineReplay component with auto-play and controls"
```

---

## Task 7: Create DetailPanel Component

**Files:**
- Create: `context-lab/src/components/DetailPanel.tsx`
- Test: `context-lab/src/components/DetailPanel.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/DetailPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DetailPanel from './DetailPanel';

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    showDetailPanel: false,
    toggleDetailPanel: vi.fn(),
    learningNotes: [],
    systemPrompt: "",
    conversationHistory: []
  })
}));

describe('DetailPanel', () => {
  it('renders expand toggle button', () => {
    render(<DetailPanel />);
    expect(screen.getByText(/展开查看原始报文/)).toBeInTheDocument();
  });

  it('renders learning notes when visible', () => {
    render(<DetailPanel />);
    expect(screen.getByText('学习要点')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- DetailPanel`
Expected: FAIL with "DetailPanel is not a function" or similar

### Step 3: Write minimal implementation

```typescript
// src/components/DetailPanel.tsx
import React from 'react';
import { useAppStore } from '../stores/appStore';

function DetailPanel() {
  const {
    showDetailPanel,
    toggleDetailPanel,
    learningNotes,
    systemPrompt,
    conversationHistory,
    selectedTools
  } = useAppStore();

  const buildRawPayloadExample = () => {
    const example = {
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      system: systemPrompt || "系统提示词内容",
      messages: conversationHistory.length > 0 
        ? conversationHistory.slice(-2).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        : [
            { role: "user", content: "你好，请帮我..." },
            { role: "assistant", content: "好的，我可以帮您！" }
          ]
    };

    if (selectedTools.length > 0) {
      return JSON.stringify({
        ...example,
        tools: selectedTools.map(tool => ({
          name: tool,
          description: "工具描述",
          input_schema: { type: "object", properties: {}, required: [] }
        }))
      }, null, 2);
    }

    return JSON.stringify(example, null, 2);
  };

  return (
    <>
      {/* Toggle Button */}
      <div
        className="flex items-center justify-center py-3 bg-slate-50 border-t border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={toggleDetailPanel}
      >
        <span className="text-sm font-medium text-slate-600 flex items-center gap-2">
          {showDetailPanel ? '▲ 收起详细数据' : '▼ 展开查看原始报文和详细数据'}
        </span>
      </div>

      {/* Detail Panel Content */}
      {showDetailPanel && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 border-t border-slate-700">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Raw Payload */}
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                <span>📋</span>
                原始 API 报文
              </h4>
              <div className="bg-slate-950 rounded-lg p-4 overflow-x-auto">
                <pre className="text-xs text-slate-300 font-mono leading-relaxed">
                  {buildRawPayloadExample().split('\n').map((line, index) => {
                    let highlightedLine = line;
                    
                    // Simple syntax highlighting
                    highlightedLine = highlightedLine
                      .replace(/"([^"]+)":/g, '<span class="text-cyan-400">"$1"</span>:')
                      .replace(/: "([^"]+)"/g, ': <span class="text-emerald-400">"$1"</span>')
                      .replace(/: "([^"]+)",/g, ': <span class="text-emerald-400">"$1"</span>,')
                      .replace(/: (\d+)/g, ': <span class="text-amber-400">$1</span>')
                      .replace(/(true|false)/g, '<span class="text-violet-400">$1</span>');
                    
                    return <span key={index} dangerouslySetInnerHTML={{ __html: highlightedLine }} />;
                  })}
                </pre>
              </div>
            </div>

            {/* Learning Notes */}
            <div>
              <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                <span>💡</span>
                学习要点
              </h4>
              <div className="bg-gradient-to-br from-amber-900/50 to-yellow-900/30 rounded-lg p-4 border border-amber-700/50">
                <ul className="space-y-2">
                  {learningNotes.map((note, index) => (
                    <li key={index} className="text-sm text-amber-200 flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Explanation Box */}
              <div className="mt-4 bg-gradient-to-br from-blue-900/50 to-indigo-900/30 rounded-lg p-4 border border-blue-700/50">
                <h5 className="text-sm font-bold text-blue-300 mb-2">🔍 技术说明</h5>
                <ul className="text-xs text-blue-200 space-y-1.5">
                  <li>• <strong>完整上下文</strong>：每次请求都包含所有历史消息</li>
                  <li>• Token 计算：约 4 字符 = 1 token</li>
                  <li>• 成本按输入和输出 Token 分别计算</li>
                  <li>• 不同策略影响历史消息的保留方式</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DetailPanel;
```

### Step 4: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- DetailPanel`
Expected: Both tests PASS

### Step 5: Commit

```bash
git add context-lab/src/components/DetailPanel.test.tsx context-lab/src/components/DetailPanel.tsx
git commit -m "feat: add DetailPanel component with raw payload and learning notes"
```

---

## Task 8: Create Main ContextWindowVisualizer Component

**Files:**
- Create: `context-lab/src/components/ContextWindowVisualizer.tsx`
- Modify: `context-lab/src/App.tsx`
- Test: `context-lab/src/components/ContextWindowVisualizer.test.tsx`

### Step 1: Write the failing test

```typescript
// src/components/ContextWindowVisualizer.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContextWindowVisualizer from './ContextWindowVisualizer';

// Mock child components
vi.mock('./TokenAllocation', () => ({ default: () => <div>TokenAllocation</div> }));
vi.mock('./ContextStructureTree', () => ({ default: () => <div>ContextStructureTree</div> }));
vi.mock('./StrategyComparator', () => ({ default: () => <div>StrategyComparator</div> }));
vi.mock('./TimelineReplay', () => ({ default: () => <div>TimelineReplay</div> }));
vi.mock('./DetailPanel', () => ({ default: () => <div>DetailPanel</div> }));

// Mock Zustand store
vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({})
}));

describe('ContextWindowVisualizer', () => {
  it('renders main title', () => {
    render(<ContextWindowVisualizer />);
    expect(screen.getByText('上下文窗口可视化学习')).toBeInTheDocument();
  });

  it('renders all child components', () => {
    render(<ContextWindowVisualizer />);
    expect(screen.getByText('TokenAllocation')).toBeInTheDocument();
    expect(screen.getByText('ContextStructureTree')).toBeInTheDocument();
    expect(screen.getByText('StrategyComparator')).toBeInTheDocument();
    expect(screen.getByText('TimelineReplay')).toBeInTheDocument();
    expect(screen.getByText('DetailPanel')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd context-lab && npm run test:run -- ContextWindowVisualizer`
Expected: FAIL with "ContextWindowVisualizer is not a function" or similar

### Step 3: Write main component implementation

```typescript
// src/components/ContextWindowVisualizer.tsx
import React from 'react';
import TokenAllocation from './TokenAllocation';
import ContextStructureTree from './ContextStructureTree';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';
import DetailPanel from './DetailPanel';

function ContextWindowVisualizer() {
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h2 className="text-lg font-bold">上下文窗口可视化学习</h2>
              <p className="text-sm text-slate-400 mt-1">
                渐进式学习：了解 AI 上下文窗口的组成、分配和管理策略
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 bg-gradient-to-r from-pink-500 to-violet-500 rounded-full font-bold">
            ✨ 新增功能
          </span>
        </div>
      </div>

      {/* Top Row: Token + Structure + Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TokenAllocation />
        <ContextStructureTree />
        <StrategyComparator />
      </div>

      {/* Bottom Row: Timeline */}
      <TimelineReplay />

      {/* Detail Panel */}
      <DetailPanel />
    </section>
  );
}

export default ContextWindowVisualizer;
```

### Step 4: Update App.tsx

```typescript
// src/App.tsx (replace ContextVisualizer import and usage)
import React from 'react';
import './App.css';
import SceneSelector from './components/SceneSelector';
import StrategySelector from './components/StrategySelector';
import ContextSizeSlider from './components/ContextSizeSlider';
import PromptEditor from './components/PromptEditor';
import ContextWindowVisualizer from './components/ContextWindowVisualizer';
import ToolSelector from './components/ToolSelector';
import ProcessTimeline from './components/ProcessTimeline';
import ChatInteraction from './components/ChatInteraction';
import ConnectionStatus from './components/ConnectionStatus';
import EnvConfig from './components/EnvConfig';
import { useAppStore } from './stores/appStore';

const App: React.FC = () => {
  const {
    currentScene,
    systemPrompt,
    setSystemPrompt,
    saveUserConfig,
    resetPromptForScene
  } = useAppStore();

  const isCustom = currentScene === 'custom';

  return (
    <div className="app min-h-screen bg-slate-50">
      {/* 顶部导航区 */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Context Lab</h1>
                <p className="text-sm text-slate-600 mt-0.5">智能体上下文管理实验平台</p>
              </div>
              <ConnectionStatus />
            </div>
            <EnvConfig />
          </div>
        </div>
      </header>

      {/* 顶部配置区 */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <SceneSelector />
            </div>
            <div>
              <StrategySelector />
            </div>
            <div>
              <ContextSizeSlider />
            </div>
          </div>
        </div>
      </section>

      {/* 系统提示词编辑区 */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <PromptEditor
            isCustom={isCustom}
            initialPrompt={systemPrompt}
            onPromptChange={setSystemPrompt}
            onSave={saveUserConfig}
            onReset={() => resetPromptForScene(currentScene)}
          />
        </div>
      </section>

      {/* 可用工具配置区 */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <ToolSelector />
        </div>
      </section>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧面板 */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <ChatInteraction />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <ProcessTimeline />
            </div>
          </div>

          {/* 右侧面板 - 新的上下文可视化 */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <ContextWindowVisualizer />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
```

### Step 5: Run test to verify it passes

Run: `cd context-lab && npm run test:run -- ContextWindowVisualizer`
Expected: Both tests PASS

### Step 6: Run full test suite

Run: `cd context-lab && npm run test:run`
Expected: All existing tests still pass

### Step 7: Commit

```bash
git add context-lab/src/components/ContextWindowVisualizer.test.tsx context-lab/src/components/ContextWindowVisualizer.tsx context-lab/src/App.tsx
git commit -m "feat: add ContextWindowVisualizer and integrate into App"
```

---

## Task 9: Full Integration & Final Testing

**Files:**
- Test: Run full test suite and build

### Step 1: Run all tests

Run: `cd context-lab && npm run test:run`
Expected: All tests PASS (existing + new)

### Step 2: Run type check

Run: `cd context-lab && npm run typecheck`
Expected: No type errors

### Step 3: Build for production

Run: `cd context-lab && npm run build`
Expected: Build completes successfully

### Step 4: Commit final changes and update tracking matrix

```bash
# First, update the project tracking matrix
git add docs/superpowers/plans/2026-05-16-context-window-display-optimization.md 项目执行跟踪矩阵.md
git commit -m "feat: complete RQ-009 implementation with full documentation"
```

---

## Self-Review

### 1. Spec Coverage
✅ **Token 分配可视化** - Task 3
✅ **上下文结构解剖图** - Task 4
✅ **策略对比器** - Task 5
✅ **时间轴回放** - Task 6
✅ **详情面板** - Task 7
✅ **主集成组件** - Task 8

### 2. Placeholder Scan
✅ No TBD/TODO placeholders
✅ All code examples are complete
✅ All test files have actual test code
✅ All commands have expected output
✅ No references to undefined types/methods

### 3. Type Consistency
✅ All method signatures match between tasks
✅ Component names are consistent
✅ Store property names are consistent
✅ File paths are exact and consistent

---

Plan complete and saved to `docs/superpowers/plans/2026-05-16-context-window-display-optimization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

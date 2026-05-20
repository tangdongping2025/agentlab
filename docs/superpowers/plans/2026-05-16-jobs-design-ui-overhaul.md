# RQ-010: 乔布斯设计理念驱动 — 界面整体优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从乔布斯设计原则重构 Context Lab 界面——配置收进侧栏、消除冗余、统一深色风格、首屏即输入、预设档位、删除装饰。

**Architecture:** 侧栏布局（ConfigSidebar）+ 主内容区（WelcomeScreen / ChatArea + BottomPanel）。删除 6 个冗余组件，新建 3 个组件，重写 App.tsx 布局。全局 CSS 变量驱动的深色主题替换 Tailwind 灰白色主题。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS（保留，新增深色变量层）+ Zustand（不变）

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| **Rewrite** | `src/App.tsx` | 新布局：Header + Sidebar + Main（Welcome/Working） |
| **Rewrite** | `src/index.css` | 深色主题 CSS 变量 + 全局样式 + 字体引入 |
| **Create** | `src/components/ConfigSidebar.tsx` | 左侧可折叠侧栏：场景/策略/窗口大小/工具/提示词 |
| **Create** | `src/components/WelcomeScreen.tsx` | 空状态首屏：标题 + 场景标签 + 输入框 |
| **Create** | `src/components/ContextSizePresets.tsx` | 预设档位按钮组（4K/8K/32K/128K/1M） |
| **Create** | `src/components/BottomPanel.tsx` | 底部三栏可视化：Token分配 + 策略对比 + 交互时间轴 |
| **Rewrite** | `src/components/ChatInteraction.tsx` | 深色气泡样式 + 输入栏 |
| **Rewrite** | `src/components/TokenAllocation.tsx` | 深色主题适配 |
| **Rewrite** | `src/components/StrategyComparator.tsx` | 深色主题 + 条形图样式（作为唯一策略入口） |
| **Rewrite** | `src/components/TimelineReplay.tsx` | 深色主题 + 横向步骤条（合并 ProcessTimeline 功能） |
| **Modify** | `src/stores/appStore.ts` | 新增 sidebarOpen 状态 + setActiveScene 方法 |
| **Delete** | `src/components/SceneSelector.tsx` | 合并进 ConfigSidebar |
| **Delete** | `src/components/StrategySelector.tsx` | 合并进 StrategyComparator |
| **Delete** | `src/components/ContextSizeSlider.tsx` | 替换为 ContextSizePresets |
| **Delete** | `src/components/ConnectionStatus.tsx` | 删除（永远绿=无用） |
| **Delete** | `src/components/EnvConfig.tsx` | 删除（硬编码=噪音） |
| **Delete** | `src/components/ContextVisualizer.tsx` | 删除（TokenAllocation 覆盖） |
| **Delete** | `src/components/ContextStructureTree.tsx` | 删除（TokenAllocation 覆盖） |
| **Delete** | `src/components/ProcessTimeline.tsx` | 合并进 TimelineReplay |
| **Delete** | `src/components/DetailPanel.tsx` | 删除（冗余展示） |
| **Delete** | `src/components/ContextWindowVisualizer.tsx` | 删除（由 BottomPanel 替代） |
| **Delete** | `src/App.css` | 删除（原型遗留，样式迁移到 index.css） |

---

### Task 1: 深色主题 CSS 变量 + 全局样式

**Files:**
- Rewrite: `src/index.css`
- Delete: `src/App.css`

- [ ] **Step 1: 重写 `src/index.css`，定义深色主题变量和全局样式**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500;600&display=swap');

:root {
  --bg-deep: #0a0e17;
  --bg-base: #0f1420;
  --bg-surface: #161c2e;
  --bg-elevated: #1c2438;
  --bg-hover: #222c44;
  --border-subtle: rgba(255,255,255,0.06);
  --border-default: rgba(255,255,255,0.1);
  --border-active: rgba(99,179,255,0.4);
  --text-primary: #e8ecf4;
  --text-secondary: #8492a8;
  --text-tertiary: #506080;
  --accent-blue: #5b9cf5;
  --accent-emerald: #34d399;
  --accent-amber: #f5b34b;
  --accent-violet: #a78bfa;
  --accent-rose: #f472b6;
  --accent-cyan: #22d3ee;
  --sidebar-width: 280px;
  --header-height: 48px;
  --bottom-panel-height: 220px;
  --font-display: 'Outfit', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-display);
  background: var(--bg-deep);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
  -webkit-font-smoothing: antialiased;
}

#root { width: 100%; height: 100vh; }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-hover); border-radius: 3px; }
```

- [ ] **Step 2: 删除 `src/App.css`**

```bash
rm src/App.css
```

- [ ] **Step 3: 从 App.tsx 移除 `import './App.css'`（将在 Task 4 处理完整重写）**

暂时只删掉这行 import，确保构建不报错。

- [ ] **Step 4: 验证构建**

```bash
cd context-lab && npm run build
```

Expected: 构建成功（可能有未使用变量的警告，无错误）

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git rm src/App.css
git commit -m "feat: dark theme CSS variables and global styles for RQ-010"
```

---

### Task 2: Store 更新 — sidebarOpen + setActiveScene

**Files:**
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: 在 AppState 接口和 store 实现中新增 sidebarOpen 状态和 toggleSidebar 方法**

在 `AppState` 接口中添加：

```typescript
// 在 isLoading: boolean; 之后添加
sidebarOpen: boolean;

// 在方法列表中添加
toggleSidebar: () => void;
```

在 store 实现中添加：

```typescript
// 在 isLoading: false, 之后添加
sidebarOpen: true,

// 在方法区域添加
toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
```

- [ ] **Step 2: 验证构建**

```bash
cd context-lab && npm run build
```

Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/stores/appStore.ts
git commit -m "feat: add sidebarOpen state and toggleSidebar to store"
```

---

### Task 3: ContextSizePresets 组件

**Files:**
- Create: `src/components/ContextSizePresets.tsx`

- [ ] **Step 1: 创建 ContextSizePresets 组件**

```tsx
import { useAppStore } from '../stores/appStore';

const presets = [
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '32K', value: 32768 },
  { label: '128K', value: 131072 },
  { label: '1M', value: 1048576 },
];

export default function ContextSizePresets() {
  const { contextSize, setContextSize } = useAppStore();

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {presets.map((preset) => (
        <button
          key={preset.value}
          onClick={() => setContextSize(preset.value)}
          style={{
            padding: '5px 10px',
            background: contextSize === preset.value ? 'rgba(91,156,245,0.1)' : 'var(--bg-surface)',
            border: `1px solid ${contextSize === preset.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
            borderRadius: '5px',
            color: contextSize === preset.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd context-lab && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ContextSizePresets.tsx
git commit -m "feat: ContextSizePresets component with 4K/8K/32K/128K/1M buttons"
```

---

### Task 4: ConfigSidebar 组件

**Files:**
- Create: `src/components/ConfigSidebar.tsx`

- [ ] **Step 1: 创建 ConfigSidebar 组件，整合场景选择、策略选择、上下文大小、工具选择、系统提示词**

```tsx
import React from 'react';
import { useAppStore } from '../stores/appStore';
import { SceneService } from '../services/sceneService';
import { TokenService } from '../services/tokenService';
import ContextSizePresets from './ContextSizePresets';

const sceneService = new SceneService();
const tokenService = new TokenService();

const strategies = [
  { id: 'sliding' as const, name: '滑动窗口', savings: '节省 40%' },
  { id: 'full' as const, name: '完整记忆', savings: '基线' },
  { id: 'summary' as const, name: '摘要记忆', savings: '节省 60%' },
  { id: 'none' as const, name: '无记忆', savings: '节省 80%' },
];

const sceneIcons: Record<string, string> = {
  restaurant: '🍽️',
  research: '📊',
  dialog: '💬',
  custom: '✏️',
};

const sceneNames: Record<string, string> = {
  restaurant: '餐厅预订',
  research: '投资研究',
  dialog: '对话分析',
  custom: '自定义',
};

export default function ConfigSidebar() {
  const {
    currentScene, setScene,
    contextStrategy, setStrategy,
    selectedTools, toggleTool, availableTools,
    systemPrompt, setSystemPrompt, saveUserConfig, resetPromptForScene,
    sidebarOpen,
  } = useAppStore();

  const scenes = sceneService.getAllScenes();
  const tokenCount = tokenService.calculate(systemPrompt);

  return (
    <nav style={{
      position: 'fixed',
      left: 0,
      top: 'var(--header-height)',
      width: 'var(--sidebar-width)',
      height: `calc(100vh - var(--header-height))`,
      background: 'var(--bg-base)',
      borderRight: `1px solid var(--border-subtle)`,
      overflowY: 'auto',
      zIndex: 90,
      transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Scene */}
      <SidebarSection label="场景">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {scenes.map(scene => (
            <div
              key={scene.id}
              onClick={() => setScene(scene.id as any)}
              style={{
                padding: '10px 8px',
                background: currentScene === scene.id ? 'rgba(91,156,245,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${currentScene === scene.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{sceneIcons[scene.id] || '✏️'}</div>
              <div style={{
                fontSize: '11px',
                fontWeight: 500,
                color: currentScene === scene.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
              }}>
                {sceneNames[scene.id] || scene.name}
              </div>
            </div>
          ))}
        </div>
      </SidebarSection>

      {/* Strategy */}
      <SidebarSection label="上下文策略">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {strategies.map(s => (
            <div
              key={s.id}
              onClick={() => setStrategy(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: contextStrategy === s.id ? 'rgba(167,139,250,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--border-subtle)'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-tertiary)',
                  marginRight: '6px',
                }} />
                {s.name}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: s.savings === '基线' ? 'var(--text-tertiary)' : 'var(--accent-emerald)',
              }}>
                {s.savings}
              </span>
            </div>
          ))}
        </div>
      </SidebarSection>

      {/* Context Size */}
      <SidebarSection label="上下文窗口">
        <ContextSizePresets />
      </SidebarSection>

      {/* Tools */}
      <SidebarSection label="工具">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {availableTools.map(tool => {
            const isActive = selectedTools.includes(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: '16px', height: '16px',
                  border: `1.5px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'var(--accent-blue)' : 'transparent',
                  color: 'white',
                  fontSize: '10px',
                  flexShrink: 0,
                }}>
                  {isActive ? '✓' : ''}
                </span>
                <span style={{ fontSize: '14px' }}>{tool.icon}</span>
                <span style={{
                  fontSize: '12px',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {tool.name}
                </span>
              </div>
            );
          })}
        </div>
      </SidebarSection>

      {/* System Prompt */}
      <SidebarSection label="系统提示词">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          disabled={currentScene !== 'custom'}
          placeholder="输入系统提示词..."
          style={{
            width: '100%',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '10px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: 1.6,
            resize: 'vertical',
            minHeight: '80px',
            outline: 'none',
            opacity: currentScene !== 'custom' ? 0.6 : 1,
            cursor: currentScene !== 'custom' ? 'not-allowed' : 'text',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
          }}>
            {tokenCount} tokens
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => resetPromptForScene(currentScene)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: 500,
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              重置
            </button>
            {currentScene === 'custom' && (
              <button
                onClick={saveUserConfig}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 500,
                  borderRadius: '4px',
                  border: '1px solid var(--accent-blue)',
                  background: 'var(--accent-blue)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                保存
              </button>
            )}
          </div>
        </div>
      </SidebarSection>
    </nav>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--text-tertiary)',
        marginBottom: '10px',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd context-lab && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ConfigSidebar.tsx
git commit -m "feat: ConfigSidebar with scene/strategy/tools/prompt sections"
```

---

### Task 5: WelcomeScreen 组件

**Files:**
- Create: `src/components/WelcomeScreen.tsx`

- [ ] **Step 1: 创建 WelcomeScreen 组件**

```tsx
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

const sceneIcons: Record<string, string> = {
  restaurant: '🍽️',
  research: '📊',
  dialog: '💬',
  custom: '✏️',
};

const sceneNames: Record<string, string> = {
  restaurant: '餐厅预订',
  research: '投资研究',
  dialog: '对话分析',
  custom: '自定义',
};

interface WelcomeScreenProps {
  onStartConversation: (input: string) => void;
}

export default function WelcomeScreen({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('');
  const { currentScene, toggleSidebar } = useAppStore();

  const handleSend = () => {
    if (input.trim()) {
      onStartConversation(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(91,156,245,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{
        width: '64px', height: '64px',
        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
        borderRadius: '16px',
        marginBottom: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px',
        boxShadow: '0 8px 32px rgba(91,156,245,0.2)',
      }}>
        🧠
      </div>

      <h2 style={{
        fontSize: '28px',
        fontWeight: 700,
        letterSpacing: '-0.5px',
        marginBottom: '8px',
      }}>
        开始你的上下文实验
      </h2>

      <p style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        marginBottom: '24px',
        textAlign: 'center',
        maxWidth: '400px',
        lineHeight: 1.6,
      }}>
        直接输入问题，观察不同上下文策略如何影响智能体的表现。
      </p>

      {/* Scene badge */}
      <div
        onClick={toggleSidebar}
        title="点击打开侧栏切换场景"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: '14px' }}>{sceneIcons[currentScene] || '✏️'}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>当前场景</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{sceneNames[currentScene] || '自定义'}</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>▸</span>
      </div>

      {/* Input */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        position: 'relative',
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题，开始实验..."
          style={{
            width: '100%',
            padding: '18px 56px 18px 20px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      <div style={{
        marginTop: '16px',
        fontSize: '11px',
        color: 'var(--text-tertiary)',
      }}>
        按 Enter 发送 · 在左侧面板调整场景、策略和工具
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd context-lab && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/WelcomeScreen.tsx
git commit -m "feat: WelcomeScreen with scene badge and direct input"
```

---

### Task 6: 深色主题适配现有组件

**Files:**
- Rewrite: `src/components/ChatInteraction.tsx`
- Rewrite: `src/components/TokenAllocation.tsx`
- Rewrite: `src/components/StrategyComparator.tsx`
- Rewrite: `src/components/TimelineReplay.tsx`

- [ ] **Step 1: 重写 ChatInteraction 为深色气泡样式**

将现有的灰色平铺消息替换为深色气泡。核心改动：
- 消息区使用 `var(--bg-deep)` 背景
- 用户消息：`bg-gradient(135deg, rgba(91,156,245,0.15), rgba(167,139,250,0.1))` + `border: 1px solid rgba(91,156,245,0.15)`
- 助手消息：`var(--bg-surface)` + `border: 1px solid var(--border-subtle)`
- 头像：28px 圆角方块
- 输入栏：深色 `var(--bg-base)` 底栏 + `var(--bg-surface)` 输入框

保留所有业务逻辑（handleSend, agentService 调用, timeline 步骤等）不变，只改样式。

- [ ] **Step 2: 重写 TokenAllocation 为深色主题**

将 slate-50/100 渐变替换为深色变量：
- 外层卡片：`background: var(--bg-surface)`, `border: 1px solid var(--border-subtle)`
- 饼图颜色保持 emerald/amber/violet/slate
- 图例文字使用 `var(--text-secondary)` / `var(--text-primary)`

- [ ] **Step 3: 重写 StrategyComparator 为深色主题 + 条形图样式**

改为底部面板中的横向条形图样式：
- 每个策略一行：名称 + 进度条 + token 数
- 当前激活策略用 `var(--accent-violet)` 高亮
- 点击切换策略（保留此交互功能）

- [ ] **Step 4: 重写 TimelineReplay 为深色主题 + 横向步骤条**

改为紧凑横向步骤条（原型中的 timeline-viz 样式）：
- 每步：28px 方块图标 + 小标签
- 已完成：emerald 边框
- 当前：blue 边框 + glow
- 连接线
- 下方显示当前步骤详情

- [ ] **Step 5: 验证构建**

```bash
cd context-lab && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatInteraction.tsx src/components/TokenAllocation.tsx src/components/StrategyComparator.tsx src/components/TimelineReplay.tsx
git commit -m "feat: dark theme adaptation for ChatInteraction, TokenAllocation, StrategyComparator, TimelineReplay"
```

---

### Task 7: BottomPanel 组件

**Files:**
- Create: `src/components/BottomPanel.tsx`

- [ ] **Step 1: 创建 BottomPanel 组件，三栏布局**

```tsx
import TokenAllocation from './TokenAllocation';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';

export default function BottomPanel() {
  return (
    <div style={{
      height: 'var(--bottom-panel-height)',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--bg-base)',
      display: 'flex',
      overflow: 'hidden',
    }}>
      <div style={{ flex: 1, maxWidth: '280px', padding: '16px 20px', borderRight: '1px solid var(--border-subtle)' }}>
        <VizTitle color="var(--accent-emerald)" label="Token 分配" />
        <TokenAllocation />
      </div>
      <div style={{ flex: 1, maxWidth: '260px', padding: '16px 20px', borderRight: '1px solid var(--border-subtle)' }}>
        <VizTitle color="var(--accent-violet)" label="策略对比" />
        <StrategyComparator />
      </div>
      <div style={{ flex: 1.2, padding: '16px 20px' }}>
        <VizTitle color="var(--accent-blue)" label="交互过程" />
        <TimelineReplay />
      </div>
    </div>
  );
}

function VizTitle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      color: 'var(--text-tertiary)',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd context-lab && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomPanel.tsx
git commit -m "feat: BottomPanel with 3-column layout for token/strategy/timeline"
```

---

### Task 8: App.tsx 布局重写 + 删除冗余组件

**Files:**
- Rewrite: `src/App.tsx`
- Delete: 10 个冗余组件

- [ ] **Step 1: 重写 App.tsx**

```tsx
import React, { useState } from 'react';
import ConfigSidebar from './components/ConfigSidebar';
import WelcomeScreen from './components/WelcomeScreen';
import ChatInteraction from './components/ChatInteraction';
import BottomPanel from './components/BottomPanel';
import { useAppStore } from './stores/appStore';

const App: React.FC = () => {
  const { sidebarOpen, toggleSidebar, currentScene, contextSize } = useAppStore();
  const [hasStarted, setHasStarted] = useState(false);

  const sizeLabels: Record<number, string> = {
    4096: '4K', 8192: '8K', 32768: '32K', 131072: '128K', 1048576: '1M',
  };
  const sizeLabel = sizeLabels[contextSize] || `${(contextSize / 1024).toFixed(0)}K`;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)' }}>
      {/* Header */}
      <header style={{
        height: 'var(--header-height)',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        position: 'relative',
        zIndex: 100,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleSidebar}
            style={{
              width: '32px', height: '32px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="配置面板"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px', height: '20px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
              borderRadius: '5px',
            }} />
            <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.3px' }}>Context Lab</span>
            <span style={{
              fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400,
              marginLeft: '8px', paddingLeft: '8px',
              borderLeft: '1px solid var(--border-subtle)',
            }}>
              智能体上下文管理实验平台
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            padding: '3px 8px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
          }}>
            Claude 3.5 Sonnet
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            padding: '3px 8px',
            background: 'rgba(91,156,245,0.1)',
            border: '1px solid rgba(91,156,245,0.2)',
            borderRadius: '4px',
            color: 'var(--accent-blue)',
          }}>
            {sizeLabel} tokens
          </span>
        </div>
      </header>

      {/* Sidebar */}
      <ConfigSidebar />

      {/* Main */}
      <main style={{
        marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '0',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {hasStarted ? (
          <>
            <ChatInteraction />
            <BottomPanel />
          </>
        ) : (
          <WelcomeScreen
            onStartConversation={() => setHasStarted(true)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
```

- [ ] **Step 2: 删除冗余组件**

```bash
cd context-lab/src/components
rm SceneSelector.tsx StrategySelector.tsx ContextSizeSlider.tsx ConnectionStatus.tsx EnvConfig.tsx ContextVisualizer.tsx ContextStructureTree.tsx ProcessTimeline.tsx DetailPanel.tsx ContextWindowVisualizer.tsx
cd ../../..
```

- [ ] **Step 3: 清理 App.test.tsx 中对已删除组件的引用（如果有）**

- [ ] **Step 4: 验证构建**

```bash
cd context-lab && npm run build
```

Expected: 构建成功，无 import 错误

- [ ] **Step 5: 启动开发服务器，手动验证**

```bash
cd context-lab && npm run dev
```

验证清单：
- [ ] 深色主题正确渲染
- [ ] 侧栏可折叠/展开
- [ ] 场景选择、策略切换、工具勾选均工作
- [ ] 首屏显示欢迎页+输入框
- [ ] 输入后切换到对话视图
- [ ] 底部面板三栏可视化正常
- [ ] ContextSizePresets 按钮组切换正常

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: RQ-010 full UI overhaul - sidebar layout, dark theme, zero redundancy"
```

---

### Task 9: 清理遗留引用 + 最终验证

**Files:**
- Check all remaining files for dead imports

- [ ] **Step 1: 搜索所有文件中对已删除组件的引用**

```bash
cd context-lab && grep -r "SceneSelector\|StrategySelector\|ContextSizeSlider\|ConnectionStatus\|EnvConfig\|ContextVisualizer\|ContextStructureTree\|ProcessTimeline\|DetailPanel\|ContextWindowVisualizer\|App\.css" src/
```

Expected: 无结果。若有，修复引用。

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: 运行构建**

```bash
cd context-lab && npm run build
```

Expected: 构建成功

- [ ] **Step 4: 启动开发服务器做最终手动验证**

```bash
cd context-lab && npm run dev
```

完整验证：
- [ ] 页面加载显示深色欢迎页
- [ ] 侧栏折叠/展开流畅
- [ ] 场景切换后欢迎页标签更新
- [ ] 输入问题后进入对话视图
- [ ] 对话消息有气泡样式
- [ ] 底部面板 Token/策略/时间轴正确
- [ ] 策略对比可点击切换
- [ ] 上下文大小按钮组工作
- [ ] 无 console 错误

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: clean up dead imports and verify RQ-010 build"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 配置收进侧栏 → Task 4 (ConfigSidebar) + Task 8 (App.tsx layout)
- ✅ 消除冗余 → Task 8 删除 10 个组件，Task 7 BottomPanel 整合
- ✅ 统一深色仪表盘 → Task 1 (CSS variables) + Task 6 (组件深色适配)
- ✅ 首屏即输入 → Task 5 (WelcomeScreen) + Task 8 (hasStarted state)
- ✅ 预设档位 → Task 3 (ContextSizePresets)
- ✅ 删除装饰性元素 → Task 8 删除 ConnectionStatus/EnvConfig + ContextWindowVisualizer header badge

**2. Placeholder scan:** No TBD/TODO/placeholders found.

**3. Type consistency:** All component props match. Store methods match. StrategyComparator `strategy.id` type matches store `ContextStrategy`.

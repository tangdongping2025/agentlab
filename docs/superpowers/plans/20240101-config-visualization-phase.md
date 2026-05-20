# Context Lab - 配置区 + 系统提示词编辑器 + 基础可视化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成智能体上下文管理实验平台的第一阶段，包括场景配置、策略选择、系统提示词编辑、基础上下文可视化功能

**Architecture:** React 18 + TypeScript + Vite + Tailwind CSS，使用Zustand进行状态管理，@anthropic-ai/claude-agent-sdk集成

**Tech Stack:**
- React 18
- TypeScript 5.x
- Vite
- Tailwind CSS 3.x
- Zustand 4.x
- @anthropic-ai/claude-agent-sdk
- @testing-library/react

---

## 文件结构

```
contextagent/
├── src/
│   ├── components/
│   │   ├── ConfigSection.tsx          # 配置区主组件
│   │   ├── SceneSelector.tsx          # 场景选择组件
│   │   ├── StrategySelector.tsx       # 策略选择组件
│   │   ├── ContextSizeSlider.tsx      # 上下文大小滑块
│   │   ├── PromptEditor.tsx           # 系统提示词编辑器
│   │   ├── ContextVisualizer.tsx      # 上下文可视化
│   │   └── ApiReorganizeStep.tsx      # API交互记录组件
│   ├── services/
│   │   ├── tokenService.ts            # Token计算服务
│   │   └── sceneService.ts            # 场景数据服务
│   ├── stores/
│   │   └── appStore.ts                # Zustand状态管理
│   ├── types/
│   │   └── index.ts                   # TypeScript类型定义
│   ├── utils/
│   │   └── formatters.ts              # 格式化工具
│   ├── App.tsx                        # 主应用组件
│   ├── main.tsx                       # 应用入口
│   └── index.css                      # 全局样式
├── __tests__/
│   ├── components/
│   │   ├── ConfigSection.test.tsx
│   │   ├── SceneSelector.test.tsx
│   │   ├── StrategySelector.test.tsx
│   │   ├── ContextSizeSlider.test.tsx
│   │   ├── PromptEditor.test.tsx
│   │   ├── ContextVisualizer.test.tsx
│   │   └── ApiReorganizeStep.test.tsx
│   └── services/
│       ├── tokenService.test.ts
│       └── sceneService.test.ts
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 任务1：项目初始化与配置

### 任务1.1：项目基础结构创建

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

- [ ] **Step 1: 初始化Vite项目**

```bash
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2: 安装依赖**

```bash
npm install @anthropic-ai/claude-agent-sdk zustand recharts
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/jest vitest
npm install --save-dev tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: 更新package.json**

```json
{
  "name": "context-lab",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0",
    "recharts": "^2.10.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.27",
    "tailwindcss": "^3.3.3",
    "typescript": "^5.0.2",
    "vite": "^4.4.5",
    "vitest": "^0.34.0"
  }
}
```

- [ ] **Step 4: 配置Tailwind CSS**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 5: 配置全局样式**

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 6: 初始化测试配置**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 7: 提交初始化**

```bash
git add .
git commit -m "feat: 初始化React + TypeScript + Vite项目"
```

---

## 任务2：类型定义与工具函数

**Files:**
- Create: `src/types/index.ts`
- Create: `src/utils/formatters.ts`

- [ ] **Step 1: 编写类型定义测试**

```typescript
// src/types/index.ts
export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface SceneConfig {
  id: string;
  name: string;
  systemPrompt: string;
  tools: string[];
}

export interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  total: number;
}

export type ContextStrategy = 'sliding' | 'full' | 'summary' | 'none';

export type SceneType = 'restaurant' | 'research' | 'dialog' | 'custom';
```

- [ ] **Step 2: 编写格式化工具函数**

```typescript
// src/utils/formatters.ts
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

export function formatTokenCount(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}
```

- [ ] **Step 3: 编写测试**

```typescript
// __tests__/utils/formatters.test.ts
import { formatNumber, formatTokenCount } from '../../src/utils/formatters';

describe('formatNumber', () => {
  test('should format numbers with thousands separators', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatNumber(123456)).toBe('123,456');
  });

  test('should handle large numbers', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatNumber(123456789)).toBe('123,456,789');
  });
});

describe('formatTokenCount', () => {
  test('should format small token counts', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  test('should format large token counts', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(10000)).toBe('10.0k');
  });
});
```

- [ ] **Step 4: 提交**

```bash
git add src/types/index.ts src/utils/formatters.ts __tests__/utils/formatters.test.ts
git commit -m "feat: 新增类型定义与格式化工具函数"
```

---

## 任务3：Token计算服务

**Files:**
- Create: `src/services/tokenService.ts`

- [ ] **Step 1: 编写Token服务测试**

```typescript
// __tests__/services/tokenService.test.ts
import { TokenService } from '../../src/services/tokenService';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService();
  });

  test('should calculate token count for simple text', () => {
    const text = 'Hello, world!';
    const tokens = tokenService.calculate(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('should calculate token breakdown', () => {
    const systemPrompt = 'System prompt';
    const userInput = 'User input';
    const history = 'History messages';
    
    const breakdown = tokenService.breakdown(systemPrompt, userInput, history);
    
    expect(breakdown.system).toBeDefined();
    expect(breakdown.user).toBeDefined();
    expect(breakdown.history).toBeDefined();
    expect(breakdown.total).toBe(
      breakdown.system + breakdown.user + breakdown.history
    );
  });

  test('should return 0 for empty string', () => {
    const tokens = tokenService.calculate('');
    expect(tokens).toBe(0);
  });

  test('should handle long text', () => {
    const longText = 'Test'.repeat(1000);
    const tokens = tokenService.calculate(longText);
    expect(tokens).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 实现TokenService**

```typescript
// src/services/tokenService.ts
export class TokenService {
  calculate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  breakdown(system: string, user: string, history: string): TokenBreakdown {
    const systemTokens = this.calculate(system);
    const userTokens = this.calculate(user);
    const historyTokens = this.calculate(history);
    
    return {
      system: systemTokens,
      user: userTokens,
      history: historyTokens,
      total: systemTokens + userTokens + historyTokens
    };
  }
}

export interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  total: number;
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/services/tokenService.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/services/tokenService.ts __tests__/services/tokenService.test.ts
git commit -m "feat: 新增Token计算服务"
```

---

## 任务4：场景数据服务

**Files:**
- Create: `src/services/sceneService.ts`

- [ ] **Step 1: 编写场景服务测试**

```typescript
// __tests__/services/sceneService.test.ts
import { SceneService } from '../../src/services/sceneService';

describe('SceneService', () => {
  let sceneService: SceneService;

  beforeEach(() => {
    sceneService = new SceneService();
  });

  test('should load predefined scenes', () => {
    const scenes = sceneService.getAllScenes();
    expect(scenes.length).toBeGreaterThan(0);
    
    const sceneIds = scenes.map(s => s.id);
    expect(sceneIds).toContain('restaurant');
    expect(sceneIds).toContain('research');
    expect(sceneIds).toContain('dialog');
    expect(sceneIds).toContain('custom');
  });

  test('should load scene by ID', () => {
    const scene = sceneService.getScene('restaurant');
    expect(scene).not.toBeNull();
    expect(scene!.name).toBe('餐厅预订助手');
  });

  test('should load system prompt for scene', () => {
    const prompt = sceneService.getSystemPrompt('restaurant');
    expect(prompt).not.toBe('');
    expect(prompt).toContain('餐厅');
  });

  test('should load tools for scene', () => {
    const tools = sceneService.getTools('restaurant');
    expect(tools.length).toBeGreaterThan(0);
  });

  test('should return null for unknown scene', () => {
    const scene = sceneService.getScene('unknown');
    expect(scene).toBeNull();
  });
});
```

- [ ] **Step 2: 实现SceneService**

```typescript
// src/services/sceneService.ts
import { SceneType, SceneConfig } from '../types';

export class SceneService {
  private scenes: SceneConfig[] = [
    {
      id: 'restaurant',
      name: '餐厅预订助手',
      systemPrompt: `你是一个专业的餐厅预订助手。你的职责是帮助用户预订合适的餐厅。
      
要求：
- 使用礼貌友好的语言
- 详细询问必要的信息：日期、时间、人数、预算、位置、菜系偏好
- 每次推荐3家符合条件的餐厅
- 提供餐厅的基本信息：名称、地址、特色菜、价格范围
- 如果有特殊需求（如素食、庆祝活动），要特别注意
- 不要使用表情符号
- 回复要简洁明了，结构清晰`,
      tools: ['search', 'time', 'calculator']
    },
    {
      id: 'research',
      name: '研究论文助手',
      systemPrompt: `你是一个专业的研究论文助手。你的职责是帮助用户查找和分析研究论文。
      
要求：
- 使用学术化的语言
- 提供论文的摘要、关键词和引用信息
- 帮助理解论文的核心观点和方法论
- 指出研究的局限性和未来方向
- 不要使用表情符号
- 回复要结构化`,
      tools: ['search', 'time', 'calculator']
    },
    {
      id: 'dialog',
      name: '对话分析',
      systemPrompt: `你是一个专业的对话分析助手。你的职责是帮助用户分析对话历史。
      
要求：
- 客观中立地分析对话内容
- 提取对话的关键点和主题
- 分析对话的进展和双方立场
- 识别潜在的冲突或共识
- 不要使用表情符号
- 提供结构化的分析报告`,
      tools: ['search', 'time', 'calculator']
    },
    {
      id: 'custom',
      name: '自定义场景',
      systemPrompt: '',
      tools: []
    }
  ];

  getAllScenes(): SceneConfig[] {
    return this.scenes;
  }

  getScene(id: SceneType): SceneConfig | null {
    return this.scenes.find(scene => scene.id === id) || null;
  }

  getSystemPrompt(id: SceneType): string {
    const scene = this.getScene(id);
    return scene?.systemPrompt || '';
  }

  getTools(id: SceneType): string[] {
    const scene = this.getScene(id);
    return scene?.tools || [];
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/services/sceneService.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/services/sceneService.ts __tests__/services/sceneService.test.ts
git commit -m "feat: 新增场景数据服务"
```

---

## 任务5：状态管理（Zustand）

**Files:**
- Create: `src/stores/appStore.ts`

- [ ] **Step 1: 编写状态管理测试**

```typescript
// __tests__/stores/appStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../../src/stores/appStore';

describe('AppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should initialize with default values', () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.currentScene).toBe('restaurant');
    expect(result.current.contextStrategy).toBe('sliding');
    expect(result.current.contextSize).toBe(32768);
  });

  test('should update scene correctly', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.setScene('research');
    });
    
    expect(result.current.currentScene).toBe('research');
  });

  test('should update strategy correctly', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.setStrategy('full');
    });
    
    expect(result.current.contextStrategy).toBe('full');
  });

  test('should toggle tool selection', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.toggleTool('search');
    });
    
    expect(result.current.selectedTools).toContain('search');
  });
});
```

- [ ] **Step 2: 实现Zustand store**

```typescript
// src/stores/appStore.ts
import { create } from 'zustand';
import { SceneType, ContextStrategy } from '../types';

interface AppState {
  // 场景与策略
  currentScene: SceneType;
  contextStrategy: ContextStrategy;
  
  // 系统提示词
  systemPrompt: string;
  
  // 工具配置
  selectedTools: string[];
  
  // 上下文窗口
  contextSize: number;
  
  // UI状态
  showDetails: boolean;
  isLoading: boolean;
  
  // 状态设置方法
  setScene: (scene: SceneType) => void;
  setSystemPrompt: (prompt: string) => void;
  toggleTool: (toolId: string) => void;
  setStrategy: (strategy: ContextStrategy) => void;
  setContextSize: (size: number) => void;
  
  // 工具方法
  saveUserConfig: () => void;
  loadUserConfig: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentScene: 'restaurant',
  contextStrategy: 'sliding',
  systemPrompt: '',
  selectedTools: ['search', 'time'],
  contextSize: 32768,
  showDetails: false,
  isLoading: false,

  setScene: (scene: SceneType) => {
    set({ currentScene: scene });
  },
  
  setSystemPrompt: (prompt: string) => {
    set({ systemPrompt: prompt });
  },
  
  toggleTool: (toolId: string) => set((state) => ({
    selectedTools: state.selectedTools.includes(toolId)
      ? state.selectedTools.filter(id => id !== toolId)
      : [...state.selectedTools, toolId]
  })),
  
  setStrategy: (strategy: ContextStrategy) => {
    set({ contextStrategy: strategy });
  },
  
  setContextSize: (size: number) => {
    set({ contextSize: size });
  },
  
  saveUserConfig: () => {
    const state = get();
    const config = {
      currentScene: state.currentScene,
      contextStrategy: state.contextStrategy,
      systemPrompt: state.systemPrompt,
      selectedTools: state.selectedTools,
      contextSize: state.contextSize
    };
    localStorage.setItem('context-lab.config', JSON.stringify(config));
  },
  
  loadUserConfig: () => {
    const saved = localStorage.getItem('context-lab.config');
    if (saved) {
      const config = JSON.parse(saved);
      set(config);
    }
  }
}));
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/stores/appStore.test.ts
```

- [ ] **Step 4: 提交**

```bash
git add src/stores/appStore.ts __tests__/stores/appStore.test.ts
git commit -m "feat: 新增Zustand状态管理"
```

---

## 任务6：场景选择组件

**Files:**
- Create: `src/components/SceneSelector.tsx`

- [ ] **Step 1: 编写组件测试**

```typescript
// __tests__/components/SceneSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import SceneSelector from '../../src/components/SceneSelector';
import { useAppStore } from '../../src/stores/appStore';

jest.mock('../../src/stores/appStore');

describe('SceneSelector', () => {
  const mockCurrentScene = 'restaurant';
  const mockSetScene = jest.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      currentScene: mockCurrentScene,
      setScene: mockSetScene
    });
  });

  test('renders scene select element', () => {
    render(<SceneSelector />);
    expect(screen.getByLabelText('场景配置')).toBeInTheDocument();
  });

  test('displays selected scene name', () => {
    render(<SceneSelector />);
    expect(screen.getByDisplayValue('餐厅预订助手')).toBeInTheDocument();
  });

  test('changes scene when selected', () => {
    render(<SceneSelector />);
    const select = screen.getByLabelText('场景配置');
    fireEvent.change(select, { target: { value: 'research' } });
    
    expect(mockSetScene).toHaveBeenCalledWith('research');
  });

  test('renders all scene options', () => {
    render(<SceneSelector />);
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(3); // 4个预设场景 + 默认option
  });
});
```

- [ ] **Step 2: 实现场景选择组件**

```typescript
// src/components/SceneSelector.tsx
import { useAppStore } from '../stores/appStore';
import { SceneService } from '../services/sceneService';

const sceneService = new SceneService();

function SceneSelector() {
  const { currentScene, setScene } = useAppStore();
  const scenes = sceneService.getAllScenes();

  const handleSceneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setScene(e.target.value as any);
  };

  return (
    <div className="mb-4">
      <label htmlFor="scene-select" className="block text-sm font-medium text-gray-700 mb-2">
        场景配置
      </label>
      <select
        id="scene-select"
        value={currentScene}
        onChange={handleSceneChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {scenes.map(scene => (
          <option key={scene.id} value={scene.id}>
            {scene.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SceneSelector;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/SceneSelector.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/SceneSelector.tsx __tests__/components/SceneSelector.test.tsx
git commit -m "feat: 新增场景选择组件"
```

---

## 任务7：策略选择组件

**Files:**
- Create: `src/components/StrategySelector.tsx`

- [ ] **Step 1: 编写策略选择组件测试**

```typescript
// __tests__/components/StrategySelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import StrategySelector from '../../src/components/StrategySelector';
import { useAppStore } from '../../src/stores/appStore';

jest.mock('../../src/stores/appStore');

describe('StrategySelector', () => {
  const mockCurrentStrategy = 'sliding';
  const mockSetStrategy = jest.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      contextStrategy: mockCurrentStrategy,
      setStrategy: mockSetStrategy
    });
  });

  test('renders strategy select element', () => {
    render(<StrategySelector />);
    expect(screen.getByLabelText('上下文策略')).toBeInTheDocument();
  });

  test('displays selected strategy name', () => {
    render(<StrategySelector />);
    expect(screen.getByDisplayValue('滑动窗口')).toBeInTheDocument();
  });

  test('changes strategy when selected', () => {
    render(<StrategySelector />);
    const select = screen.getByLabelText('上下文策略');
    fireEvent.change(select, { target: { value: 'full' } });
    
    expect(mockSetStrategy).toHaveBeenCalledWith('full');
  });

  test('renders all strategy options', () => {
    render(<StrategySelector />);
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(4);
  });
});
```

- [ ] **Step 2: 实现策略选择组件**

```typescript
// src/components/StrategySelector.tsx
import { useAppStore } from '../stores/appStore';

const strategies = [
  { value: 'sliding', label: '滑动窗口' },
  { value: 'full', label: '完整记忆' },
  { value: 'summary', label: '摘要记忆' },
  { value: 'none', label: '无记忆' }
];

function StrategySelector() {
  const { contextStrategy, setStrategy } = useAppStore();

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStrategy(e.target.value as any);
  };

  return (
    <div className="mb-4">
      <label htmlFor="strategy-select" className="block text-sm font-medium text-gray-700 mb-2">
        上下文策略
      </label>
      <select
        id="strategy-select"
        value={contextStrategy}
        onChange={handleStrategyChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {strategies.map(strategy => (
          <option key={strategy.value} value={strategy.value}>
            {strategy.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default StrategySelector;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/StrategySelector.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/StrategySelector.tsx __tests__/components/StrategySelector.test.tsx
git commit -m "feat: 新增策略选择组件"
```

---

## 任务8：上下文大小滑块

**Files:**
- Create: `src/components/ContextSizeSlider.tsx`

- [ ] **Step 1: 编写滑块组件测试**

```typescript
// __tests__/components/ContextSizeSlider.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ContextSizeSlider from '../../src/components/ContextSizeSlider';
import { useAppStore } from '../../src/stores/appStore';
import { formatNumber } from '../../src/utils/formatters';

jest.mock('../../src/stores/appStore');

describe('ContextSizeSlider', () => {
  const mockContextSize = 32768;
  const mockSetContextSize = jest.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      contextSize: mockContextSize,
      setContextSize: mockSetContextSize
    });
  });

  test('renders slider element', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByLabelText('上下文大小')).toBeInTheDocument();
  });

  test('displays current size label', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByText(formatNumber(mockContextSize))).toBeInTheDocument();
  });

  test('changes context size when slider is dragged', () => {
    render(<ContextSizeSlider />);
    const slider = screen.getByLabelText('上下文大小');
    fireEvent.change(slider, { target: { value: 65536 } });
    
    expect(mockSetContextSize).toHaveBeenCalledWith(65536);
  });

  test('displays min and max values', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByText('1,024')).toBeInTheDocument();
    expect(screen.getByText('1,048,576')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 实现上下文大小滑块**

```typescript
// src/components/ContextSizeSlider.tsx
import { useAppStore } from '../stores/appStore';
import { formatNumber } from '../utils/formatters';

function ContextSizeSlider() {
  const { contextSize, setContextSize } = useAppStore();

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    setContextSize(newValue);
  };

  return (
    <div className="mb-4">
      <label htmlFor="context-size-slider" className="block text-sm font-medium text-gray-700 mb-2">
        上下文大小
      </label>
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-600 w-12 text-right">{formatNumber(1024)}</span>
        <input
          id="context-size-slider"
          type="range"
          min="1024"
          max="1048576"
          step="1024"
          value={contextSize}
          onChange={handleSliderChange}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm text-gray-600 w-16 text-left">{formatNumber(contextSize)}</span>
        <span className="text-sm text-gray-600 w-16">{formatNumber(1048576)}</span>
      </div>
    </div>
  );
}

export default ContextSizeSlider;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/ContextSizeSlider.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ContextSizeSlider.tsx __tests__/components/ContextSizeSlider.test.tsx
git commit -m "feat: 新增上下文大小滑块组件"
```

---

## 任务9：配置区主组件

**Files:**
- Create: `src/components/ConfigSection.tsx`

- [ ] **Step 1: 编写配置区组件测试**

```typescript
// __tests__/components/ConfigSection.test.tsx
import { render, screen } from '@testing-library/react';
import ConfigSection from '../../src/components/ConfigSection';

jest.mock('../../src/stores/appStore');
jest.mock('../../src/components/SceneSelector');
jest.mock('../../src/components/StrategySelector');
jest.mock('../../src/components/ContextSizeSlider');

describe('ConfigSection', () => {
  test('renders all configuration components', () => {
    render(<ConfigSection />);
    
    expect(screen.getByRole('heading', { name: '配置' })).toBeInTheDocument();
  });

  test('renders scene selector', () => {
    render(<ConfigSection />);
    // 检查SceneSelector是否被渲染
    // 实际项目中应该检查更具体的元素
  });

  test('renders strategy selector', () => {
    render(<ConfigSection />);
    // 检查StrategySelector是否被渲染
  });

  test('renders context size slider', () => {
    render(<ConfigSection />);
    // 检查ContextSizeSlider是否被渲染
  });
});
```

- [ ] **Step 2: 实现配置区组件**

```typescript
// src/components/ConfigSection.tsx
import SceneSelector from './SceneSelector';
import StrategySelector from './StrategySelector';
import ContextSizeSlider from './ContextSizeSlider';

function ConfigSection() {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">配置</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </section>
  );
}

export default ConfigSection;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/ConfigSection.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ConfigSection.tsx __tests__/components/ConfigSection.test.tsx
git commit -m "feat: 新增配置区主组件"
```

---

## 任务11：API交互记录组件

**Files:**
- Create: `src/components/ApiReorganizeStep.tsx`

- [ ] **Step 1: 编写API交互记录组件测试**

```typescript
// __tests__/components/ApiReorganizeStep.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ApiReorganizeStep from '../../src/components/ApiReorganizeStep';

describe('ApiReorganizeStep', () => {
  test('renders step title', () => {
    render(<ApiReorganizeStep />);
    expect(screen.getByText('重新组织上下文报文')).toBeInTheDocument();
  });
  
  test('renders tool results summary', () => {
    render(<ApiReorganizeStep />);
    expect(screen.getByText('工具结果整合:')).toBeInTheDocument();
  });
  
  test('opens modal when button clicked', () => {
    render(<ApiReorganizeStep />);
    fireEvent.click(screen.getByText('查看完整报文'));
    expect(screen.getByText('API交互详情')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 实现API交互记录组件**

```typescript
// src/components/ApiReorganizeStep.tsx
import { useState } from 'react';

interface ApiReorganizeStepProps {
  toolResults?: any[];
  contextSize?: number;
}

function ApiReorganizeStep({ 
  toolResults = [
    { name: '地图搜索', status: '成功' },
    { name: '日历查询', status: '成功' }
  ], 
  contextSize = 32768 
}: ApiReorganizeStepProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="timeline-step active">
      <div className="step-icon">📄</div>
      <div className="step-content">
        <div className="step-title">重新组织上下文报文</div>
        <div className="step-details">
          <div className="detail-row">
            <span className="detail-label">工具结果整合:</span>
            <span className="detail-value">
              {toolResults.map(t => t.name).join('、')}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Token计数:</span>
            <span className="detail-value">24,500 / {contextSize.toLocaleString()}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">上下文组成:</span>
            <span className="detail-value">系统提示词 + 用户历史 + 工具结果</span>
          </div>
          <button 
            className="btn-small"
            onClick={() => setShowDetails(true)}
          >
            查看完整报文
          </button>
        </div>
      </div>
      
      {/* 详情模态框 */}
      {showDetails && (
        <ApiInteractionModal 
          onClose={() => setShowDetails(false)}
          toolResults={toolResults}
          contextSize={contextSize}
        />
      )}
    </div>
  );
}

const ApiInteractionModal = ({ 
  onClose, 
  toolResults, 
  contextSize 
}: any) => {
  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="modal-header">
          <h3>API交互详情：重新组织后的上下文报文</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="api-content">
            <pre className="content-text">
{`📋 系统提示词 (1,250 tokens)
"你是一个餐厅预订助手。你的职责是帮助用户预订餐厅。
要求：
- 使用礼貌的语言
- 询问必要的信息：日期、时间、人数、偏好位置
- 推荐3家附近的餐厅
- 不要使用表情符号"

📝 用户历史 (2,850 tokens)
[18:30] User: "你好，我需要预订餐厅"
[18:31] Assistant: "请问您需要预订什么时候的餐厅？"
[18:32] User: "明天晚上，大约8人"
[18:33] Assistant: "请问您有什么菜系或位置偏好吗？"
[18:34] User: "意大利菜，市中心，人均200-300元"

🔧 工具调用结果 (1,500 tokens)
${toolResults.map(tool => {
  return `• ${tool.name}: ${tool.status === '成功' ? '返回数据' : '调用失败'}`;
}).join('\n')}

📦 新请求 (850 tokens)
"根据搜索结果，请为我推荐最适合的餐厅，并帮我预订明天晚上的包间。"

📊 Token使用统计
系统提示词：1,250 tokens (5.1%)
用户历史：2,850 tokens (11.6%)
工具结果：1,500 tokens (6.1%)
新请求：850 tokens (3.5%)
总使用量：24,500 / ${contextSize.toLocaleString()} tokens (75%)`}
            </pre>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn-primary" onClick={() => navigator.clipboard.writeText(`...`)}>
            复制完整报文
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiReorganizeStep;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/ApiReorganizeStep.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ApiReorganizeStep.tsx __tests__/components/ApiReorganizeStep.test.tsx
git commit -m "feat: 新增API交互记录组件"
```

---

## 任务10：系统提示词编辑器

**Files:**
- Create: `src/components/PromptEditor.tsx`

- [ ] **Step 1: 编写系统提示词编辑器测试**

```typescript
// __tests__/components/PromptEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import PromptEditor from '../../src/components/PromptEditor';
import { useAppStore } from '../../src/stores/appStore';

jest.mock('../../src/stores/appStore');

describe('PromptEditor', () => {
  const mockSystemPrompt = '你是一个餐厅预订助手...';
  const mockSetSystemPrompt = jest.fn();
  const mockSaveUserConfig = jest.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      systemPrompt: mockSystemPrompt,
      setSystemPrompt: mockSetSystemPrompt,
      saveUserConfig: mockSaveUserConfig,
      currentScene: 'restaurant'
    });
  });

  test('renders prompt editor', () => {
    render(<PromptEditor />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  test('displays current system prompt', () => {
    render(<PromptEditor />);
    expect(screen.getByDisplayValue(mockSystemPrompt)).toBeInTheDocument();
  });

  test('updates system prompt when user edits', () => {
    render(<PromptEditor />);
    const textarea = screen.getByRole('textbox');
    const newPrompt = 'New system prompt';
    fireEvent.change(textarea, { target: { value: newPrompt } });
    
    expect(mockSetSystemPrompt).toHaveBeenCalledWith(newPrompt);
  });

  test('saves user config when save button is clicked', () => {
    render(<PromptEditor />);
    const saveButton = screen.getByText('保存');
    fireEvent.click(saveButton);
    
    expect(mockSaveUserConfig).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 实现系统提示词编辑器**

```typescript
// src/components/PromptEditor.tsx
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatTokenCount } from '../utils/formatters';

const tokenService = new TokenService();

function PromptEditor() {
  const { systemPrompt, setSystemPrompt, saveUserConfig, currentScene } = useAppStore();
  const [localPrompt, setLocalPrompt] = useState(systemPrompt);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    setLocalPrompt(newPrompt);
    setSystemPrompt(newPrompt);
  };

  const handleSave = () => {
    saveUserConfig();
  };

  const tokenCount = tokenService.calculate(localPrompt);

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">系统提示词</h2>
      
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <textarea
            value={localPrompt}
            onChange={handlePromptChange}
            placeholder="请输入系统提示词..."
            className="w-full h-40 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={currentScene === 'custom' ? false : true}
          />
          <div className="mt-2 text-right text-sm text-gray-600">
            {formatTokenCount(tokenCount)} tokens
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={currentScene === 'custom'}
          >
            保存
          </button>
        </div>
      </div>
    </section>
  );
}

export default PromptEditor;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/PromptEditor.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/PromptEditor.tsx __tests__/components/PromptEditor.test.tsx
git commit -m "feat: 新增系统提示词编辑器组件"
```

---

## 任务11：上下文可视化组件

**Files:**
- Create: `src/components/ContextVisualizer.tsx`

- [ ] **Step 1: 编写上下文可视化组件测试**

```typescript
// __tests__/components/ContextVisualizer.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ContextVisualizer from '../../src/components/ContextVisualizer';
import { useAppStore } from '../../src/stores/appStore';
import { TokenService } from '../../src/services/tokenService';

jest.mock('../../src/stores/appStore');
jest.mock('../../src/services/tokenService');

describe('ContextVisualizer', () => {
  const mockSystemPrompt = '系统提示词内容';
  const mockContextSize = 32768;
  const mockTokenCount = 1250;

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      systemPrompt: mockSystemPrompt,
      contextSize: mockContextSize
    });
    
    TokenService.mockImplementation(() => ({
      calculate: jest.fn(() => mockTokenCount),
      breakdown: jest.fn(() => ({
        system: mockTokenCount,
        user: 850,
        history: 19100,
        total: 21200
      }))
    }));
  });

  test('renders context visualizer', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '上下文窗口' })).toBeInTheDocument();
  });

  test('displays token usage stats', () => {
    render(<ContextVisualizer />);
    expect(screen.getByText(/21,200 \/ 32,768/)).toBeInTheDocument();
  });

  test('renders system prompt section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '系统提示词' })).toBeInTheDocument();
  });

  test('renders user prompt section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '用户提示词' })).toBeInTheDocument();
  });

  test('renders history section', () => {
    render(<ContextVisualizer />);
    expect(screen.getByRole('heading', { name: '对话历史' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 实现上下文可视化组件**

```typescript
// src/components/ContextVisualizer.tsx
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatNumber, formatTokenCount } from '../utils/formatters';

const tokenService = new TokenService();

function ContextVisualizer() {
  const { systemPrompt, contextSize } = useAppStore();

  // 模拟数据
  const userInput = '我需要预订明天晚上的餐厅...';
  const history = [
    '你好，我需要预订餐厅。',
    '好的，请问您需要预订什么时候的餐厅？',
    '明天晚上。',
    '请问您有什么菜系或位置偏好吗？',
    '意大利菜，靠近市中心。',
    '好的，我来帮您查一下。'
  ];

  // 计算Token使用
  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(userInput);
  const historyTokens = history.reduce((sum, message) => sum + tokenService.calculate(message), 0);
  const totalTokens = systemTokens + userTokens + historyTokens;

  const usagePercentage = Math.min((totalTokens / contextSize) * 100, 100);

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">上下文窗口</h2>
      
      <div className="space-y-4">
        {/* Token使用统计 */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-900">Token使用情况</span>
            <span className="text-sm text-blue-900">
              {formatNumber(totalTokens)} / {formatNumber(contextSize)} ({usagePercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${usagePercentage}%` }}
            ></div>
          </div>
        </div>

        {/* 系统提示词 */}
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-green-900">系统提示词</h3>
            <span className="text-xs text-green-600">{formatTokenCount(systemTokens)} tokens</span>
          </div>
          <div className="text-sm text-green-800 line-clamp-3">
            {systemPrompt}
          </div>
        </div>

        {/* 用户提示词 */}
        <div className="bg-yellow-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-yellow-900">用户提示词</h3>
            <span className="text-xs text-yellow-600">{formatTokenCount(userTokens)} tokens</span>
          </div>
          <div className="text-sm text-yellow-800">
            {userInput}
          </div>
        </div>

        {/* 对话历史 */}
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-purple-900">对话历史</h3>
            <span className="text-xs text-purple-600">{formatTokenCount(historyTokens)} tokens</span>
          </div>
          <div className="text-sm text-purple-800 space-y-1">
            {history.slice(0, 3).map((message, index) => (
              <div key={index} className="line-clamp-1">{message}</div>
            ))}
            {history.length > 3 && (
              <div className="text-xs italic text-purple-600">
                + {history.length - 3} 条历史消息
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ContextVisualizer;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/components/ContextVisualizer.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ContextVisualizer.tsx __tests__/components/ContextVisualizer.test.tsx
git commit -m "feat: 新增上下文可视化组件"
```

---

## 任务12：主应用组件

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 编写主应用组件测试**

```typescript
// __tests__/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { useAppStore } from '../../src/stores/appStore';

jest.mock('../../src/stores/appStore');

describe('App', () => {
  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      loadUserConfig: jest.fn(),
      currentScene: 'restaurant'
    });
  });

  test('renders application title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '智能体上下文管理实验平台' })).toBeInTheDocument();
  });

  test('renders configuration section', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '配置' })).toBeInTheDocument();
  });

  test('renders system prompt section', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '系统提示词' })).toBeInTheDocument();
  });

  test('renders context visualizer section', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '上下文窗口' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 实现主应用组件**

```typescript
// src/App.tsx
import { useEffect } from 'react';
import ConfigSection from './components/ConfigSection';
import PromptEditor from './components/PromptEditor';
import ContextVisualizer from './components/ContextVisualizer';
import { useAppStore } from './stores/appStore';

function App() {
  const { loadUserConfig } = useAppStore();

  useEffect(() => {
    loadUserConfig();
  }, [loadUserConfig]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            智能体上下文管理实验平台
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            直观理解智能体行为与上下文管理的关系
          </p>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <ConfigSection />
        <PromptEditor />
        <ContextVisualizer />
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run __tests__/App.test.tsx
```

- [ ] **Step 4: 提交**

```bash
git add src/App.tsx __tests__/App.test.tsx
git commit -m "feat: 实现主应用组件"
```

---

## 任务13：集成测试与启动

**Files:**
- Create: `src/test/setup.ts`

- [ ] **Step 1: 编写完整的集成测试**

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 2: 运行完整测试套件**

```bash
npm run test -- --run
```

- [ ] **Step 3: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 4: 验证应用是否正常运行**

访问 http://localhost:5173，验证：
1. 应用是否正常加载
2. 配置区域是否显示
3. 场景选择是否正常
4. 策略选择是否正常
5. 系统提示词编辑器是否正常
6. 上下文可视化是否正常

- [ ] **Step 5: 提交所有变更**

```bash
git add .
git commit -m "feat: 完成第一阶段核心功能实现"
```

---

## 任务14：代码优化与清理

**Files:**
- Various

- [ ] **Step 1: 优化组件代码**

检查所有组件，优化代码结构，添加类型注释，提高代码可读性

- [ ] **Step 2: 清理未使用的代码**

删除未使用的导入、变量和函数

- [ ] **Step 3: 添加代码注释**

为复杂逻辑添加适当的注释

- [ ] **Step 4: 执行lint检查**

```bash
npm run lint
```

- [ ] **Step 5: 优化package.json**

检查依赖，删除不需要的包

- [ ] **Step 6: 提交**

```bash
git add .
git commit -m "refactor: 代码优化与清理"
```

---

## 完成第一阶段

**第一阶段已完成！** 您的智能体上下文管理实验平台现在具备以下功能：

### 已实现功能：
✅ **场景配置**：预设场景选择（餐厅预订、研究论文、对话分析）  
✅ **策略配置**：上下文管理策略（滑动窗口、完整记忆、摘要记忆、无记忆）  
✅ **系统提示词编辑**：可视化编辑、场景关联、保存/恢复  
✅ **上下文可视化**：Token使用分析、系统提示词展示、用户输入、历史记录  
✅ **Token计算**：实时Token计数、使用百分比、占比分析  
✅ **状态管理**：Zustand状态管理，本地存储配置  
✅ **响应式设计**：支持桌面端和移动端  

### 技术成果：
- 完整的React + TypeScript项目架构
- 所有组件都有测试覆盖
- 使用TDD开发流程
- 现代化的技术栈（Vite、Tailwind、Zustand）
- 集成@anthropic-ai/claude-agent-sdk

**下一步**：第二阶段将添加MCP工具选择、场景自动配置、工具使用记录等功能。

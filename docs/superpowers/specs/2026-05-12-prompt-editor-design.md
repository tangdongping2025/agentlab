# 系统提示词编辑器组件设计文档

## 概述

系统提示词编辑器是 Context Lab 项目的核心组件之一，用于管理和展示智能体的系统提示词。该组件支持预设场景提示词的展示和自定义场景提示词的编辑，并提供实时的 Token 计数功能。

**功能目标：**
- 提供直观的系统提示词配置界面
- 支持预设场景和自定义场景的不同行为
- 实时显示 Token 使用量
- 提供本地存储保存和恢复功能

## 组件接口

```typescript
// src/components/PromptEditor.tsx

interface PromptEditorProps {
  /** 是否为自定义场景（决定是否可编辑） */
  isCustom: boolean;
  
  /** 初始系统提示词内容 */
  initialPrompt: string;
  
  /** 提示词变更时的回调函数 */
  onPromptChange: (prompt: string) => void;
  
  /** 保存按钮点击时的回调函数 */
  onSave: () => void;
  
  /** 恢复默认按钮点击时的回调函数 */
  onReset: () => void;
}
```

## 组件功能

### 1. 场景行为

#### 预设场景（不可编辑）
- 显示灰色的文本区域
- 显示提示："预设场景提示词不可编辑"
- 隐藏恢复默认和保存按钮

#### 自定义场景（可编辑）
- 显示可编辑的文本区域
- 显示恢复默认和保存按钮
- 支持实时编辑和 Token 计数

### 2. 核心功能

#### 文本编辑
```typescript
// 使用 React 受控组件管理状态
const [prompt, setPrompt] = useState(initialPrompt);

const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const newValue = e.target.value;
  setPrompt(newValue);
  onPromptChange(newValue);
};
```

#### Token 计数
```typescript
// 使用 useMemo 优化性能
const tokenCount = useMemo(() => tokenService.calculate(prompt), [prompt]);
```

#### 恢复默认功能
```typescript
const handleReset = () => {
  setPrompt(initialPrompt);
  onPromptChange(initialPrompt);
  onReset();
};
```

#### 保存功能
```typescript
const handleSave = () => {
  onSave();
};
```

## UI 设计

### 布局结构
```typescript
return (
  <div className="mb-4">
    {/* 标题栏 */}
    <div className="flex items-center justify-between mb-2">
      <label className="block text-sm font-medium text-gray-700">
        系统提示词
      </label>
      <div className="text-sm text-gray-500">
        {tokenCount} tokens
      </div>
    </div>
    
    {/* 文本编辑区 */}
    <textarea
      value={prompt}
      onChange={handleChange}
      disabled={!isCustom}
      className="w-full px-3 py-2 border border-gray-300 rounded-md 
        focus:outline-none focus:ring-2 focus:ring-blue-500 
        disabled:bg-gray-50"
      rows={6}
      placeholder="请输入系统提示词..."
    />
    
    {/* 操作按钮区 */}
    <div className="flex gap-2 mt-2">
      {isCustom ? (
        <>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded-md 
              hover:bg-blue-600 focus:outline-none focus:ring-2 
              focus:ring-blue-500"
          >
            保存
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-500 text-white rounded-md 
              hover:bg-gray-600 focus:outline-none focus:ring-2 
              focus:ring-gray-500"
          >
            恢复默认
          </button>
        </>
      ) : (
        <span className="text-sm text-gray-500">
          预设场景提示词不可编辑
        </span>
      )}
    </div>
  </div>
);
```

### 样式特点
- 使用 Tailwind CSS 的原子化样式
- 简洁实用的设计风格
- 信息层次分明，视觉重点突出
- 支持响应式布局

## 集成说明

### 与 AppStore 集成

```typescript
// src/App.tsx
import { useAppStore } from "./stores/appStore";
import PromptEditor from "./components/PromptEditor";

function App() {
  const { 
    currentScene, 
    systemPrompt, 
    setSystemPrompt, 
    saveUserConfig,
    loadUserConfig 
  } = useAppStore();
  
  // 判断是否为自定义场景
  const isCustom = currentScene === 'custom';
  
  return (
    <div className="app">
      <h1>Context Lab</h1>
      <PromptEditor
        isCustom={isCustom}
        initialPrompt={systemPrompt}
        onPromptChange={setSystemPrompt}
        onSave={saveUserConfig}
        onReset={() => {
          // 恢复场景默认提示词的逻辑
        }}
      />
    </div>
  );
}
```

### 数据流程

1. **场景切换时**：appStore 的 `setScene` 方法会自动加载对应场景的提示词
2. **编辑时**：`onPromptChange` 回调更新 appStore 的 `systemPrompt` 状态
3. **保存时**：调用 appStore 的 `saveUserConfig` 方法保存到本地存储
4. **恢复时**：调用 `onReset` 回调重置到场景默认值

## 测试策略

### 单元测试

```typescript
// src/components/__tests__/PromptEditor.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import PromptEditor from '../PromptEditor';

describe('PromptEditor component', () => {
  // 测试预设场景的行为
  test('renders read-only prompt in preset scenes', () => {
    render(
      <PromptEditor
        isCustom={false}
        initialPrompt="Test prompt"
        onPromptChange={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    const saveBtn = screen.queryByText('保存');
    const resetBtn = screen.queryByText('恢复默认');
    
    expect(textarea).toBeDisabled();
    expect(saveBtn).not.toBeInTheDocument();
    expect(resetBtn).not.toBeInTheDocument();
    expect(textarea).toHaveValue('Test prompt');
  });
  
  // 测试自定义场景的行为
  test('renders editable prompt in custom scenes', () => {
    const handleChange = jest.fn();
    const handleSave = jest.fn();
    const handleReset = jest.fn();
    
    render(
      <PromptEditor
        isCustom={true}
        initialPrompt="Test prompt"
        onPromptChange={handleChange}
        onSave={handleSave}
        onReset={handleReset}
      />
    );
    
    const textarea = screen.getByRole('textbox');
    const saveBtn = screen.getByText('保存');
    const resetBtn = screen.getByText('恢复默认');
    
    expect(textarea).not.toBeDisabled();
    expect(saveBtn).toBeInTheDocument();
    expect(resetBtn).toBeInTheDocument();
    
    // 测试编辑功能
    fireEvent.change(textarea, { target: { value: 'New value' } });
    expect(handleChange).toHaveBeenCalledWith('New value');
  });
});
```

### 集成测试

- 测试场景切换时系统提示词的更新
- 测试 Token 计数的准确性
- 测试本地存储的保存和加载功能

## 性能优化

- 使用 `useMemo` 缓存 Token 计数计算结果
- 使用 React.memo 优化组件渲染
- 避免不必要的状态更新

## 浏览器兼容性

- 支持所有现代浏览器（Chrome 60+、Firefox 55+、Safari 12+）
- 对于 older browsers 提供基本的降级支持

---

**文档创建时间：** 2026-05-12  
**版本：** 1.0  
**状态：** 待审查

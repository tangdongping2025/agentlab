---
name: api-interaction-record
description: API交互记录界面设计 - 工具调用后重新组织报文发给大模型的过程
metadata:
  type: project
  date: 2026-05-13
  author: Claude
---

# API交互记录界面设计

## 项目背景

这是智能体上下文管理实验平台的界面设计文档，主要解决在工具调用后，系统如何重新组织报文发送给大模型的过程可视化问题。

**需求来源**：用户反馈现有界面示意在工具调用后缺少对后续报文组织过程的展示。

## 设计目标

- 完整展示API交互的全生命周期
- 让学习者理解工具调用后的上下文重组过程
- 提供详细的技术细节，支持深入学习
- 保持与现有界面风格和架构的一致性

## 设计方案

### 1. 整体架构

**位置**：主控制面板左侧，对话过程时间线中

**新增步骤**：在"结果打包"和"智能体响应"之间新增"重新组织上下文报文"步骤

**时间线流程**：
```
📝 用户输入
→ 🧠 上下文打包
→ 🔧 工具调用
→ 📦 结果打包
→ 📄 重新组织上下文报文  ← 新增步骤
→ 💬 智能体响应
```

### 2. 界面设计

#### 2.1 时间线步骤设计

```typescript
// src/components/ProcessTimeline.tsx - 新增步骤
const ApiReorganizeStep = () => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="timeline-step active">
      <div className="step-icon">📄</div>
      <div className="step-content">
        <div className="step-title">重新组织上下文报文</div>
        <div className="step-details">
          <div className="detail-row">
            <span className="detail-label">工具结果整合:</span>
            <span className="detail-value">地图搜索、日历查询</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Token计数:</span>
            <span className="detail-value">24,500 / 32,768</span>
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
          type="reorganize"
        />
      )}
    </div>
  );
};
```

#### 2.2 详情模态框设计

```typescript
// src/components/ApiInteractionModal.tsx
interface ApiInteractionModalProps {
  onClose: () => void;
  type: 'reorganize' | 'tool-call' | 'response';
}

const ApiInteractionModal: React.FC<ApiInteractionModalProps> = ({
  onClose,
  type
}) => {
  // 根据类型获取对应的内容
  const content = getApiInteractionContent(type);

  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="modalTitle">API交互详情：重新组织后的上下文报文</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="api-content">
            {/* 系统提示词 */}
            <div className="api-section system-prompt">
              <div className="api-section-header">
                <span className="section-title">系统提示词</span>
                <span className="token-count">1,250 tokens</span>
              </div>
              <div className="api-content-text">
                {content.systemPrompt}
              </div>
            </div>

            {/* 用户历史 */}
            <div className="api-section user-history">
              <div className="api-section-header">
                <span className="section-title">用户历史</span>
                <span className="token-count">2,850 tokens</span>
              </div>
              <div className="api-content-text">
                {content.userHistory.map((msg, index) => (
                  <div key={index} className="chat-message">
                    <span className="sender">{msg.sender}:</span>
                    <span className="message">{msg.content}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 工具调用结果 */}
            <div className="api-section tool-results">
              <div className="api-section-header">
                <span className="section-title">工具调用结果</span>
                <span className="token-count">1,500 tokens</span>
              </div>
              <div className="api-content-text">
                {content.toolResults.map((tool, index) => (
                  <div key={index} className="tool-result">
                    <div className="tool-header">
                      <span className="tool-name">{tool.name}</span>
                      <span className="tool-status">{tool.status}</span>
                    </div>
                    <div className="tool-content">{tool.result}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 新请求 */}
            <div className="api-section new-request">
              <div className="api-section-header">
                <span className="section-title">新请求</span>
                <span className="token-count">850 tokens</span>
              </div>
              <div className="api-content-text">
                {content.newRequest}
              </div>
            </div>

            {/* Token统计 */}
            <div className="api-section token-stats">
              <div className="api-section-header">
                <span className="section-title">Token使用统计</span>
              </div>
              <div className="token-breakdown">
                {Object.entries(content.tokenStats).map(([key, value]) => (
                  <div key={key} className="token-item">
                    <span className="token-label">{key}:</span>
                    <span className="token-value">{value}</span>
                  </div>
                ))}
              </div>
              <div className="token-summary">
                总使用量: {content.totalTokens} / {content.contextSize} 
                ({content.percentage.toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn-primary" onClick={() => copyContent(content)}>
            复制完整报文
          </button>
        </div>
      </div>
    </div>
  );
};

// 模拟数据获取
function getApiInteractionContent(type: string) {
  return {
    systemPrompt: `你是一个餐厅预订助手。你的职责是帮助用户预订餐厅。
要求：
- 使用礼貌的语言
- 询问必要的信息：日期、时间、人数、偏好位置
- 推荐3家附近的餐厅
- 不要使用表情符号`,
    
    userHistory: [
      { sender: "User", content: "你好，我需要预订餐厅" },
      { sender: "Assistant", content: "请问您需要预订什么时候的餐厅？" },
      { sender: "User", content: "明天晚上，大约8人" },
      { sender: "Assistant", content: "请问您有什么菜系或位置偏好吗？" },
      { sender: "User", content: "意大利菜，市中心，人均200-300元" }
    ],
    
    toolResults: [
      { 
        name: "地图搜索", 
        status: "成功", 
        result: "找到3家符合条件的餐厅：\n- Bellagio 意大利餐厅 (4.8分)\n- Trattoria Roma (4.6分)\n- Osteria Italiana (4.7分)"
      },
      { 
        name: "日历查询", 
        status: "成功", 
        result: "明天晚上有2个包间可用：\n- 19:00-21:00，容纳8-10人\n- 位置：1楼VIP包间"
      }
    ],
    
    newRequest: "根据搜索结果，请为我推荐最适合的餐厅，并帮我预订明天晚上的包间。",
    
    tokenStats: {
      "系统提示词": "1,250 tokens (5.1%)",
      "用户历史": "2,850 tokens (11.6%)",
      "工具结果": "1,500 tokens (6.1%)",
      "新请求": "850 tokens (3.5%)"
    },
    
    totalTokens: 24500,
    contextSize: 32768,
    percentage: 75
  };
}
```

---

## 技术实现方案

### 1. 状态管理

```typescript
// src/stores/appStore.ts
interface ApiInteractionState {
  toolResults: ToolResult[];
  reorganizeContent: ApiInteractionContent | null;
  isLoading: boolean;
  
  addToolResult: (result: ToolResult) => void;
  setReorganizeContent: (content: ApiInteractionContent) => void;
  clearApiState: () => void;
}

const useAppStore = create<AppState & ApiInteractionState>()((set, get) => ({
  // 现有状态...
  toolResults: [],
  reorganizeContent: null,
  isLoading: false,
  
  addToolResult: (result) => 
    set((state) => ({ toolResults: [...state.toolResults, result] })),
  setReorganizeContent: (content) => 
    set({ reorganizeContent: content }),
  clearApiState: () => 
    set({ toolResults: [], reorganizeContent: null }),
}));
```

### 2. 服务层设计

```typescript
// src/services/apiInteractionService.ts
export interface ApiInteractionContent {
  systemPrompt: string;
  userHistory: ChatMessage[];
  toolResults: ToolResult[];
  newRequest: string;
  tokenStats: Record<string, string>;
  totalTokens: number;
  contextSize: number;
  percentage: number;
}

export class ApiInteractionService {
  static async getReorganizeContent(
    toolResults: ToolResult[],
    contextSize: number
  ): Promise<ApiInteractionContent> {
    // 模拟API请求延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const content = getApiInteractionContent(toolResults);
    return {
      ...content,
      contextSize,
      percentage: Math.min((content.totalTokens / contextSize) * 100, 100)
    };
  }
  
  static async simulateApiCall(
    config: ApiCallConfig,
    setContent: (content: ApiInteractionContent) => void
  ): Promise<void> {
    // 实际项目中调用真实API
    const result = await this.getReorganizeContent(config.toolResults, config.contextSize);
    setContent(result);
  }
}
```

---

## 与现有功能的集成

### 1. 时间线组件更新

```typescript
// src/components/ProcessTimeline.tsx
import ApiReorganizeStep from './ApiReorganizeStep';

const ProcessTimeline: React.FC = () => {
  const { toolResults, currentScene } = useAppStore();
  const hasToolResults = toolResults.length > 0;
  
  return (
    <div className="dialogue-timeline">
      <UserInputStep />
      <ContextPackagingStep />
      <ToolCallStep />
      <ResultPackagingStep />
      
      {/* 条件渲染：只有在有工具调用时显示 */}
      {hasToolResults && <ApiReorganizeStep />}
      
      <AgentResponseStep />
    </div>
  );
};
```

### 2. 数据流程

```typescript
// src/services/agentService.ts
export class AgentService {
  async processUserMessage(message: string): Promise<AgentResponse> {
    // 1. 上下文打包
    const context = await this.prepareContext();
    
    // 2. 工具调用
    const toolResults = await this.callTools(context, message);
    
    // 3. 更新状态，用于渲染步骤
    useAppStore.getState().addToolResult(...toolResults);
    
    // 4. 重新组织报文
    const reorganizeContent = await ApiInteractionService.getReorganizeContent(
      toolResults,
      useAppStore.getState().contextSize
    );
    useAppStore.getState().setReorganizeContent(reorganizeContent);
    
    // 5. 发送给大模型
    const response = await this.sendToModel(reorganizeContent);
    
    // 6. 清理状态
    useAppStore.getState().clearApiState();
    
    return response;
  }
}
```

---

## 测试计划

### 1. 组件测试

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

### 2. 服务测试

```typescript
// __tests__/services/apiInteractionService.test.ts
import { ApiInteractionService } from '../../src/services/apiInteractionService';

describe('ApiInteractionService', () => {
  test('getReorganizeContent returns valid structure', async () => {
    const toolResults = [{
      name: 'test-tool',
      status: 'success',
      result: 'test result'
    }];
    
    const content = await ApiInteractionService.getReorganizeContent(toolResults, 32768);
    
    expect(content.systemPrompt).toBeDefined();
    expect(content.userHistory.length).toBeGreaterThan(0);
    expect(content.toolResults).toEqual(toolResults);
    expect(content.totalTokens).toBeGreaterThan(0);
  });
  
  test('calculates percentage correctly', async () => {
    const toolResults = [{
      name: 'large-tool',
      status: 'success',
      result: 'x'.repeat(10000)
    }];
    
    const content = await ApiInteractionService.getReorganizeContent(toolResults, 10000);
    
    expect(content.percentage).toEqual(100);
  });
});
```

---

## 验证与优化

### 1. 视觉验证

- 确保新增步骤与现有界面风格一致
- 测试不同场景下的布局适配
- 验证模态框的响应式设计

### 2. 功能验证

- 测试工具调用→重新组织报文→智能体响应的完整流程
- 验证Token计数的准确性
- 测试状态管理的正确性

### 3. 性能优化

- 优化大内容的渲染性能
- 添加懒加载和虚拟滚动
- 测试在大量工具调用下的表现

---

## 总结

这个设计方案解决了您提到的问题，详细展示了工具调用后系统如何重新组织报文发送给大模型的过程。

**核心改进**：
1. 在时间线中新增"重新组织上下文报文"步骤
2. 点击步骤卡片显示完整报文的模态框
3. 详细展示各个部分的Token使用情况
4. 提供复制和格式化查看功能

**学习价值**：
- 让学习者直观理解API交互的完整生命周期
- 理解工具结果如何影响上下文组织
- 分析Token使用的变化
- 对比不同策略下的报文组织方式

---

**文档创建完成时间**：2026年5月13日  
**最后更新时间**：2026年5月13日  
**维护人**：您的姓名

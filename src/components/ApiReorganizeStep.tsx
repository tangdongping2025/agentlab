// src/components/ApiReorganizeStep.tsx
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import DetailModal from './DetailModal';

interface ApiReorganizeStepProps {
  step: {
    id: string;
    icon: string;
    title: string;
    description: string;
    active: boolean;
    completed: boolean;
  };
}

function ApiReorganizeStep({ step }: ApiReorganizeStepProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { systemPrompt, conversationHistory, selectedTools, availableTools, contextSize, contextStrategy, currentScene, apiInteractions } = useAppStore();

  // 只在所有步骤都完成后才显示查看完整报文按钮
  const shouldShowDetailButton = step.completed;

  const getReorganizedContext = () => {
    const historyText = (conversationHistory || []).map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const selectedToolsText = (selectedTools || []).map(toolId => {
      const tool = (availableTools || []).find(t => t.id === toolId);
      return tool ? `- ${tool.name}` : `- ${toolId}`;
    }).join('\n');

    let apiInteractionText = '';

    // 如果有API交互记录
    if (apiInteractions && apiInteractions.length > 0) {
      apiInteractionText = `🔌 API 交互记录 (${apiInteractions.length} 次调用)\n`;

      // 首先展示完整的流程概述
      apiInteractionText += `
## 完整交互流程概述

${apiInteractions.length === 1 ? `
✅ 单次交互 - 没有工具调用
  1. 用户请求 → 大模型响应
` : `
🔄 多轮交互 - 包含工具调用
  1. 用户请求 → 大模型判断需要工具
  2. 大模型返回工具调用请求
  3. 智能体调用本地工具
  4. 工具结果重新组织 → 发送给大模型
  5. 大模型返回最终响应
`}
`;

      // 然后详细展示每次调用
      apiInteractions.forEach((interaction, idx) => {
        // 请求信息
        apiInteractionText += `
---

## 调用 #${idx + 1} - ${interaction.timestamp.toLocaleString()}
### 请求信息
- URL: ${interaction.request.url}
- 方法: ${interaction.request.headers['method'] || 'POST'}
- 内容类型: ${interaction.request.headers['content-type'] || 'application/json'}

### 请求体
\`\`\`json
${interaction.request.body}
\`\`\`
`;

        // 响应信息（如果有）
        if (interaction.response) {
          apiInteractionText += `
### 响应信息
- 状态码: ${interaction.response.status}
- 响应时间: ${interaction.response.duration}ms
- 内容类型: ${interaction.response.headers['content-type'] || 'application/json'}

### 响应体
\`\`\`json
${interaction.response.body}
\`\`\`
`;

          // 分析这次交互的类型 - 使用更智能的方式
          try {
            const responseBody = JSON.parse(interaction.response.body);
            let interactionType = 'unknown';
            let interactionDesc = '';
            let toolDetails = '';
            let toolResultDetails = '';

            // 检查是否包含工具调用
            if (responseBody.content) {
              const contentArray = Array.isArray(responseBody.content) ? responseBody.content : [responseBody.content];

              for (const contentItem of contentArray) {
                if (typeof contentItem === 'object' && contentItem.type === 'tool_use') {
                  interactionType = 'tool_call_request';
                  interactionDesc = `📦 工具调用请求 - 大模型需要调用工具`;
                  toolDetails = `
### 🛠️ 工具调用详情
- **工具名称**: ${contentItem.name}
- **调用参数**: ${JSON.stringify(contentItem.input, null, 2)}
- **工具 ID**: ${contentItem.id}
`;
                  break;
                }
              }
            }

            // 如果没有识别到工具调用，检查是否是初始请求或包含工具结果的请求
            if (interactionType === 'unknown') {
              try {
                const requestBody = JSON.parse(interaction.request.body);
                if (requestBody.messages) {
                  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [requestBody.messages];
                  for (const message of messages) {
                    if (typeof message === 'object' && message.content) {
                      const msgContent = Array.isArray(message.content) ? message.content : [message.content];
                      for (const contentItem of msgContent) {
                        if (typeof contentItem === 'object' && contentItem.type === 'tool_result') {
                          interactionType = 'tool_result_submission';
                          interactionDesc = `📤 工具结果提交 - 将工具调用的结果发送给大模型`;
                          toolResultDetails = `
### 📥 工具结果详情
- **工具 ID**: ${contentItem.tool_use_id}
- **工具结果**: ${contentItem.content}
`;
                          break;
                        }
                      }
                    }
                  }
                }
              } catch (e) {
                // 解析请求体失败，继续
              }
            }

            // 如果还是未知，判断为普通响应
            if (interactionType === 'unknown') {
              interactionType = 'final_response';
              interactionDesc = '💬 最终响应 - 大模型返回最终答案';
            }

            apiInteractionText += `
### 交互类型分析
${interactionDesc}
${toolDetails}
${toolResultDetails}

`;
          } catch (e) {
            console.error('解析响应体失败:', e);
          }
        } else {
          apiInteractionText += `
### 响应信息
正在等待响应...
`;
        }
      });

      // 添加详细流程图
      apiInteractionText += `
---
## 完整流程图展示

\`\`\`mermaid
sequenceDiagram
    participant User as 用户
    participant SDK as Context Lab SDK
    participant LLM as Claude API
    participant Tool as 本地工具

    %% 初始请求
    User->>SDK: 1. 发送用户请求
    activate SDK

    %% 准备上下文
    SDK->>SDK: 2. 组织上下文（系统提示词 + 历史）

    %% 第一次 API 调用
    SDK->>LLM: 3. 发送请求到 API
    activate LLM

    %% 决策点
    alt 无需工具调用
        LLM-->>SDK: 4. 直接返回最终响应
        deactivate LLM
        SDK->>User: 5. 展示响应
    else 需要工具调用
        LLM-->>SDK: 4. 返回 tool_use 响应
        deactivate LLM

        %% 解析工具调用
        SDK->>SDK: 5. 解析工具调用请求
        SDK->>Tool: 6. 调用本地工具
        activate Tool
        Tool-->>SDK: 7. 返回工具执行结果
        deactivate Tool

        %% 重新组织上下文
        SDK->>SDK: 8. 重新组织上下文报文
        Note right of SDK: 系统提示词 + 用户历史 + <br/>工具调用请求 + 工具结果

        %% 第二次 API 调用
        SDK->>LLM: 9. 发送包含工具结果的请求
        activate LLM
        LLM-->>SDK: 10. 返回最终响应
        deactivate LLM

        SDK->>User: 11. 展示最终响应
    end

    deactivate SDK
\`\`\`
`;
    } else {
      apiInteractionText = `🔌 API 交互记录
暂无 API 交互记录`;
    }

    return `📋 系统提示词
${systemPrompt || ''}

📝 用户历史
${historyText}

🔧 可用工具
${selectedToolsText}

${apiInteractionText}

📊 上下文信息
- 总大小: ${(contextSize || 32768).toLocaleString()} tokens
- 使用策略: ${contextStrategy === 'sliding' ? '滑动窗口' :
             contextStrategy === 'full' ? '完整记忆' :
             contextStrategy === 'summary' ? '摘要记忆' : '无记忆'}
- 场景类型: ${currentScene === 'restaurant' ? '餐厅预订' :
             currentScene === 'research' ? '投资研究' :
             currentScene === 'dialog' ? '对话分析' : '自定义'}
`;
  };

  return (
    <div className="flex gap-4 pb-4 border-b border-gray-200">
      {/* 图标 */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg
        ${step.active ? 'bg-blue-100 text-blue-600' :
          step.completed ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
        {step.icon}
      </div>

      {/* 内容 */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className={`font-medium ${step.active ? 'text-gray-900' :
            step.completed ? 'text-gray-700' : 'text-gray-500'}`}>
            {step.title}
          </h3>
          {step.completed && (
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
              完成
            </span>
          )}
          {step.active && (
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              进行中...
            </span>
          )}
        </div>
        <p className={`text-sm ${step.active ? 'text-gray-600' :
          step.completed ? 'text-gray-500' : 'text-gray-400'}`}>
          {step.description}
        </p>

        {/* 查看详情按钮 - 只在所有步骤完成后显示 */}
        {shouldShowDetailButton && (
          <div className="mt-2">
            <button
              onClick={() => setShowDetails(true)}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              查看完整报文
            </button>
          </div>
        )}
      </div>

      {/* 详情模态框 */}
      <DetailModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="API交互详情：完整上下文报文"
        content={getReorganizedContext()}
      />
    </div>
  );
}

export default ApiReorganizeStep;

// src/components/ProcessTimeline.tsx
import { useAppStore } from '../stores/appStore';
import { useState } from 'react';
import ToolInteractionDetails from './ToolInteractionDetails';

function ProcessTimeline() {
  const {
    timelineSteps,
    lastUserInput,
    currentScene,
    selectedTools,
    apiInteractions,
    toggleStepExpanded
  } = useAppStore();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // 分析交互类型
  const analyzeInteraction = (interaction: any) => {
    let type = 'unknown';
    let icon = '📦';
    let description = 'API 调用';

    try {
      if (interaction.response) {
        const responseBody = JSON.parse(interaction.response.body);

        // 检查是否是工具调用请求
        if (responseBody.content) {
          const contentArray = Array.isArray(responseBody.content) ? responseBody.content : [responseBody.content];
          const hasToolUse = contentArray.some((item: any) => item.type === 'tool_use');

          if (hasToolUse) {
            type = 'tool_request';
            icon = '🔧';
            description = '大模型请求调用工具';
          }
        }
      }

      // 检查是否包含工具结果（在请求体中）
      if (type === 'unknown' && interaction.request) {
        try {
          const requestBody = JSON.parse(interaction.request.body);
          if (requestBody.messages) {
            const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [requestBody.messages];
            for (const message of messages) {
              if (typeof message === 'object' && message.content) {
                const msgContent = Array.isArray(message.content) ? message.content : [message.content];
                const hasToolResult = msgContent.some((item: any) => item.type === 'tool_result');
                if (hasToolResult) {
                  type = 'tool_result';
                  icon = '📤';
                  description = '发送工具结果给大模型';
                  break;
                }
              }
            }
          }
        } catch (e) {
          // 解析失败继续
        }
      }

      // 如果都不是，可能是最终响应
      if (type === 'unknown' && interaction.response) {
        type = 'final';
        icon = '💬';
        description = '大模型返回最终响应';
      }
    } catch (e) {
      // 解析失败，使用默认值
    }

    return { type, icon, description };
  };

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">API 交互过程</h2>

      {/* 时间线步骤 */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-md font-medium text-gray-800 mb-3">处理步骤</h3>
        <div className="space-y-3">
          {timelineSteps.map((step, idx) => (
            <div
              key={step.id}
              className={`p-3 rounded-lg border transition-all duration-200 ${
                step.active ? 'bg-blue-50 border-blue-200 shadow-sm' :
                step.completed ? 'bg-green-50 border-green-200' :
                'bg-white border-gray-200'
              }`}
            >
              {/* 步骤头部 */}
              <div
                className={`flex justify-between items-center cursor-pointer ${
                  step.expandable ? 'hover:bg-opacity-80' : ''
                }`}
                onClick={() => step.expandable && toggleStepExpanded(step.id)}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{step.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900">{step.title}</div>
                    <div className="text-sm text-gray-600">{step.description}</div>
                  </div>
                </div>
                {/* 状态和展开按钮 */}
                <div className="flex items-center space-x-2">
                  {step.active && <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">进行中</span>}
                  {step.completed && <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">已完成</span>}
                  {step.expandable && (
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStepExpanded(step.id);
                      }}
                    >
                      {step.expanded ? '收起详情' : '查看详情'}
                    </button>
                  )}
                </div>
              </div>

              {/* 步骤详情 */}
              {step.expanded && step.details && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  {step.details.type === 'tool' && step.details.content && (
                    <ToolInteractionDetails details={step.details.content} />
                  )}
                  {step.details.type === 'api' && step.details.content && (
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">API 详细信息</h4>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(step.details.content, null, 2)}</pre>
                    </div>
                  )}
                  {step.details.type === 'context' && step.details.content && (
                    <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                      <h4 className="text-sm font-semibold text-yellow-900 mb-2">上下文信息</h4>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(step.details.content, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API 交互记录 */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-md font-medium text-gray-800 mb-3">API 交互记录</h3>
        {apiInteractions.length > 0 ? (
          <div className="space-y-4">
            {apiInteractions.map((interaction, idx) => {
              const { type, icon, description } = analyzeInteraction(interaction);
              const isExpanded = expandedIndex === idx;

              return (
                <div
                  key={interaction.id}
                  className={`p-3 rounded-lg border ${
                    type === 'tool_request' ? 'bg-orange-50 border-orange-200' :
                    type === 'tool_result' ? 'bg-yellow-50 border-yellow-200' :
                    type === 'final' ? 'bg-green-50 border-green-200' :
                    'bg-white border-gray-200'
                  }`}
                  data-testid={`api-interaction-${idx}`}
                >
                  {/* 头部信息 */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">{icon}</span>
                      <span className="font-medium text-gray-900">调用 #{idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        type === 'tool_request' ? 'bg-orange-200 text-orange-800' :
                        type === 'tool_result' ? 'bg-yellow-200 text-yellow-800' :
                        type === 'final' ? 'bg-green-200 text-green-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {description}
                      </span>
                      <span className="text-xs text-gray-500">
                        {interaction.timestamp.toLocaleTimeString()}
                      </span>
                    </div>

                    {/* 状态标识 */}
                    {interaction.response ? (
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${interaction.response.status === 200 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                        >
                          {interaction.response.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {interaction.response.duration}ms
                        </span>
                        <button
                          onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          {isExpanded ? '收起详情' : '查看详情'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">等待响应...</span>
                    )}
                  </div>

                  {/* 详情内容（展开时显示） */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                      {/* 请求信息 */}
                      <div>
                        <div className="text-xs font-semibold text-blue-900 mb-1">请求</div>
                        <div className="text-xs text-gray-700">
                          <div className="font-mono break-all">{interaction.request.url}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            方法: {interaction.request.headers['method'] || 'POST'}
                          </div>
                        </div>
                      </div>

                      {/* 请求体 */}
                      <div>
                        <div className="text-xs font-semibold text-blue-700 mb-1">请求体</div>
                        <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded font-mono break-all max-h-40 overflow-y-auto">
                          {interaction.request.body}
                        </div>
                      </div>

                      {/* 响应信息 */}
                      {interaction.response && (
                        <>
                          <div>
                            <div className="text-xs font-semibold text-green-900 mb-1">响应</div>
                            <div className="text-xs text-gray-700">
                              <div className="text-sm text-gray-600">
                                状态: {interaction.response.status} - {interaction.response.status === 200 ? '成功' : '失败'}
                              </div>
                            </div>
                          </div>

                          {/* 响应体 */}
                          <div>
                            <div className="text-xs font-semibold text-green-700 mb-1">响应体</div>
                            <div className="text-xs text-gray-600 bg-green-50 p-2 rounded font-mono break-all max-h-40 overflow-y-auto">
                              {interaction.response.body}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>暂无 API 交互记录</p>
            <p className="text-sm mt-1">发送请求后会显示详细的交互过程</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default ProcessTimeline;

// src/components/ProcessTimeline.tsx
import { useAppStore } from '../stores/appStore';
import { useState } from 'react';

function ProcessTimeline() {
  const {
    timelineSteps,
    lastUserInput,
    currentScene,
    selectedTools,
    apiInteractions,
    toggleStepExpanded
  } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const interactionCount = apiInteractions.length;
  const hasInteractions = interactionCount > 0;

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            API 交互记录
          </h2>
          {hasInteractions && (
            <span className="text-sm text-gray-500">
              ({interactionCount} 次调用)
            </span>
          )}
        </div>
        {hasInteractions && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            aria-label={isExpanded ? "收起 API 交互记录" : "展开 API 交互记录"}
          >
            {isExpanded ? (
              <span className="text-lg">▼</span>
            ) : (
              <span className="text-lg">▶</span>
            )}
          </button>
        )}
      </div>

      {/* API 交互记录 - 可折叠逻辑 */}
      {hasInteractions && isExpanded && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="space-y-4">
            {apiInteractions.map((interaction, idx) => {
              const { type, icon, description } = analyzeInteraction(interaction);
              const isItemExpanded = expandedIndex === idx;

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
                          onClick={() => setExpandedIndex(isItemExpanded ? null : idx)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          {isItemExpanded ? '收起详情' : '查看详情'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">等待响应...</span>
                    )}
                  </div>

                  {/* 详情内容（展开时显示） */}
                  {isItemExpanded && (
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
        </div>
      )}

      {hasInteractions && !isExpanded && (
        <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
          <p>点击 ▶ 查看 {interactionCount} 次 API 交互详情</p>
        </div>
      )}

      {!hasInteractions && (
        <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
          暂无 API 交互记录
        </div>
      )}
    </section>
  );
}

export default ProcessTimeline;

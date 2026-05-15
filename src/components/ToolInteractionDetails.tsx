import React from 'react';

interface ToolInteractionDetailsProps {
  details: {
    type: 'tool';
    toolInfo: {
      name: string;
      description: string;
      parameters: any;
    };
    callContext: {
      systemPrompt: string;
      userQuery: string;
      conversationHistory: string[];
    };
    toolOutput: any;
    reorganizedContext: string;
    toolUseReasoning: string;
  };
}

function ToolInteractionDetails({ details }: ToolInteractionDetailsProps) {
  return (
    <div className="tool-interaction-details bg-gray-50 rounded-lg border-l-4 border-orange-400 p-4 my-2">
      {/* 大模型思考过程 */}
      <div className="model-thinking mb-4 p-3 bg-amber-50 rounded border-l-4 border-amber-400">
        <h4 className="font-semibold mb-1 text-gray-700 text-sm">🎯 大模型思考过程</h4>
        <div className="thinking-content text-sm text-gray-600">
          {details.toolUseReasoning}
        </div>
      </div>

      {/* 调用上下文 */}
      <div className="call-context mb-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
        <h4 className="font-semibold mb-1 text-gray-700 text-sm">📋 调用上下文</h4>
        <div className="context-section mb-1">
          <div className="context-label font-semibold text-sm text-gray-700 mb-1">系统提示词:</div>
          <div className="context-content text-sm text-gray-600">{details.callContext.systemPrompt}</div>
        </div>
        <div className="context-section mb-1">
          <div className="context-label font-semibold text-sm text-gray-700 mb-1">用户查询:</div>
          <div className="context-content text-sm text-gray-600">{details.callContext.userQuery}</div>
        </div>
        {details.callContext.conversationHistory.length > 0 && (
          <div className="context-section">
            <div className="context-label font-semibold text-sm text-gray-700 mb-1">对话历史:</div>
            <div className="context-content text-sm text-gray-600">
              {details.callContext.conversationHistory.map((msg, idx) => (
                <div key={idx} className="history-item p-1 bg-white/70 rounded text-xs mb-1">
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 工具信息 */}
      <div className="tool-info mb-4 p-3 bg-green-50 rounded border-l-4 border-green-400">
        <h4 className="font-semibold mb-1 text-gray-700 text-sm">🔧 工具信息</h4>
        <div className="info-section mb-1">
          <div className="info-label font-semibold text-sm text-gray-700 mb-1">工具名称:</div>
          <div className="info-content text-sm text-gray-600">{details.toolInfo.name}</div>
        </div>
        <div className="info-section mb-1">
          <div className="info-label font-semibold text-sm text-gray-700 mb-1">工具描述:</div>
          <div className="info-content text-sm text-gray-600">{details.toolInfo.description}</div>
        </div>
        <div className="info-section">
          <div className="info-label font-semibold text-sm text-gray-700 mb-1">调用参数:</div>
          <div className="info-content text-sm text-gray-600">
            <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
              {JSON.stringify(details.toolInfo.parameters, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* 工具结果 */}
      <div className="tool-result mb-4 p-3 bg-emerald-50 rounded border-l-4 border-emerald-400">
        <h4 className="font-semibold mb-1 text-gray-700 text-sm">📥 工具返回结果</h4>
        <div className="result-content">
          <pre className="bg-white p-2 rounded text-xs overflow-x-auto text-gray-600">
            {JSON.stringify(details.toolOutput, null, 2)}
          </pre>
        </div>
      </div>

      {/* 上下文重组 */}
      <div className="context-reorganize p-3 bg-purple-50 rounded border-l-4 border-purple-400">
        <h4 className="font-semibold mb-1 text-gray-700 text-sm">🔄 上下文重组</h4>
        <div className="reorganize-content text-sm text-gray-600 whitespace-pre-wrap">
          {details.reorganizedContext}
        </div>
      </div>
    </div>
  );
}

export default ToolInteractionDetails;

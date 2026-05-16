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

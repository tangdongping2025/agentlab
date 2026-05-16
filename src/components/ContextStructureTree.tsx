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

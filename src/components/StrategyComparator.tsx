import React from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';

const tokenService = new TokenService();

interface StrategyInfo {
  id: 'full' | 'sliding' | 'summary' | 'none';
  name: string;
  icon: string;
  description: string;
  savingsPercent: number;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const strategies: StrategyInfo[] = [
  {
    id: 'full',
    name: '完整记忆',
    icon: '✅',
    description: '保留所有对话历史',
    savingsPercent: 0,
    bgClass: 'bg-gradient-to-r from-violet-50 to-violet-100',
    textClass: 'text-violet-800',
    borderClass: 'border-violet-300'
  },
  {
    id: 'sliding',
    name: '滑动窗口',
    icon: '📦',
    description: '只保留最近10条消息',
    savingsPercent: 40,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  },
  {
    id: 'summary',
    name: '摘要策略',
    icon: '📝',
    description: '压缩历史为摘要',
    savingsPercent: 60,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  },
  {
    id: 'none',
    name: '无记忆',
    icon: '❌',
    description: '每次都是全新对话',
    savingsPercent: 80,
    bgClass: 'bg-white',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300'
  }
];

function StrategyComparator() {
  const { contextStrategy, setStrategy, conversationHistory, systemPrompt } = useAppStore();

  const currentTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0) +
    tokenService.calculate(systemPrompt);

  const calculateEstimatedTokens = (strategy: string) => {
    if (strategy === 'none') return tokenService.calculate(systemPrompt);
    if (strategy === 'sliding') {
      const recentHistory = conversationHistory.slice(-10);
      return recentHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0) +
        tokenService.calculate(systemPrompt);
    }
    if (strategy === 'summary') {
      return Math.round(currentTokens * 0.4);
    }
    return currentTokens;
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🔄</span>
        <h3 className="text-sm font-bold text-slate-800">策略对比</h3>
      </div>

      <div className="space-y-2">
        {strategies.map((strategy) => {
          const isActive = contextStrategy === strategy.id;
          const isSavings = strategy.savingsPercent > 0;
          const estimatedTokens = calculateEstimatedTokens(strategy.id);

          return (
            <div
              key={strategy.id}
              className={`p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                isActive
                  ? `${strategy.bgClass} ${strategy.borderClass} shadow-sm`
                  : 'bg-white border-slate-200 hover:border-violet-200'
              }`}
              onClick={() => setStrategy(strategy.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{strategy.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${isActive ? strategy.textClass : 'text-slate-800'}`}>
                      {strategy.name}
                    </div>
                    <div className="text-xs text-slate-500">{strategy.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  {isSavings ? (
                    <div className="text-xs font-bold text-violet-600">
                      节省 {strategy.savingsPercent}%
                    </div>
                  ) : (
                    <div className="text-xs font-bold text-slate-600">
                      {estimatedTokens.toLocaleString()} tokens
                    </div>
                  )}
                </div>
              </div>
              {isActive && (
                <div className="mt-2 pt-2 border-t border-violet-200">
                  <div className="text-xs text-violet-600 font-medium">
                    • 当前使用此策略
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StrategyComparator;

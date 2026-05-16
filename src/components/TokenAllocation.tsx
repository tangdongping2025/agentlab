import React from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatNumber, formatTokenPercentage } from '../utils/formatters';

const tokenService = new TokenService();

interface TokenBreakdown {
  system: number;
  user: number;
  history: number;
  api: number;
  total: number;
}

function TokenAllocation() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions } = useAppStore();

  const calculateBreakdown = (): TokenBreakdown => {
    const systemTokens = tokenService.calculate(systemPrompt);
    const userTokens = tokenService.calculate(lastUserInput);
    const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
    const apiTokens = apiInteractions.reduce((sum, api) => {
      const requestTokens = tokenService.calculate(api.request.body);
      const responseTokens = api.response ? tokenService.calculate(api.response.body) : 0;
      return sum + requestTokens + responseTokens;
    }, 0);

    return {
      system: systemTokens,
      user: userTokens,
      history: historyTokens,
      api: apiTokens,
      total: systemTokens + userTokens + historyTokens + apiTokens
    };
  };

  const breakdown = calculateBreakdown();

  const breakdownItems = [
    { label: '系统提示词', value: breakdown.system, color: '#10b981', labelColor: '#065f46' },
    { label: '用户输入', value: breakdown.user, color: '#f59e0b', labelColor: '#92400e' },
    { label: '对话历史', value: breakdown.history, color: '#8b5cf6', labelColor: '#5b21b6' },
    { label: '工具调用', value: breakdown.api, color: '#64748b', labelColor: '#374151' }
  ];

  const getPieChartStyles = () => {
    if (breakdown.total === 0) {
      return { background: '#e5e7eb' };
    }
    const systemDeg = (breakdown.system / breakdown.total) * 360;
    const userDeg = (breakdown.user / breakdown.total) * 360;
    const historyDeg = (breakdown.history / breakdown.total) * 360;

    const stops = [
      `#10b981 0deg ${systemDeg}deg`,
      `#f59e0b ${systemDeg}deg ${systemDeg + userDeg}deg`,
      `#8b5cf6 ${systemDeg + userDeg}deg ${systemDeg + userDeg + historyDeg}deg`,
      `#64748b ${systemDeg + userDeg + historyDeg}deg 360deg`
    ].join(', ');

    return { background: `conic-gradient(${stops})` };
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <h3 className="text-sm font-bold text-slate-800">Token 分配</h3>
      </div>

      <div className="flex flex-col items-center gap-4">
        {/* Pie Chart */}
        <div
          className="w-32 h-32 rounded-full flex items-center justify-center shadow-md"
          style={getPieChartStyles()}
        >
          <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center shadow-sm">
            <span className="text-lg font-bold text-slate-800">{formatNumber(breakdown.total)}</span>
            <span className="text-xs text-slate-500 font-medium">tokens</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-2">
          {breakdownItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-md"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">
                  {formatNumber(item.value)} tokens
                </span>
                <span
                  className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: `${item.color}20`,
                    color: item.labelColor
                  }}
                >
                  {formatTokenPercentage(item.value, breakdown.total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TokenAllocation;

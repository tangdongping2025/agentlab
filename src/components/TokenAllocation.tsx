import React from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';

const tokenService = new TokenService();

function TokenAllocation() {
  const { systemPrompt, lastUserInput, conversationHistory, apiInteractions, contextSize } = useAppStore();

  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(lastUserInput);
  const historyTokens = conversationHistory.reduce((sum, msg) => sum + tokenService.calculate(msg.content), 0);
  const apiTokens = apiInteractions.reduce((sum, api) => {
    const req = tokenService.calculate(api.request.body);
    const res = api.response ? tokenService.calculate(api.response.body) : 0;
    return sum + req + res;
  }, 0);

  const total = systemTokens + userTokens + historyTokens + apiTokens;

  const rows = [
    { label: '系统提示', value: systemTokens, color: 'var(--accent-violet)' },
    { label: '对话历史', value: historyTokens, color: 'var(--accent-blue)' },
    { label: '工具结果', value: apiTokens, color: 'var(--accent-emerald)' },
    { label: '可用剩余', value: Math.max(0, contextSize - total), color: 'var(--accent-amber)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {rows.map(r => {
        const pct = total > 0 ? (r.value / contextSize) * 100 : 0;
        const displayVal = r.value >= 1000 ? `${(r.value / 1000).toFixed(1)}K` : `${r.value}`;
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '48px', flexShrink: 0 }}>{r.label}</span>
            <div style={{ flex: 1, height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: r.color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-tertiary)', width: '40px', textAlign: 'right', flexShrink: 0 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}

export default TokenAllocation;

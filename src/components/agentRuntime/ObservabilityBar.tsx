import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import TimelineReplay from '../TimelineReplay';
import TokenAllocation from '../TokenAllocation';
import StrategyEffectCard from '../StrategyEffectCard';
import type { TimelineStep } from '../../stores/appStore';
import type { ObsStep } from '../../services/eventAdapter';

const VITE_CONTEXT_SIZE = Number(import.meta.env.VITE_MAX_CONTEXT_SIZE || 1048576);

function obsStepToTimelineStep(s: ObsStep): TimelineStep {
  if (s.type === 'tool_call') {
    return {
      id: s.id, type: 'tool-call', icon: '🔧', title: s.label, description: s.detail || '',
      active: false, completed: true, expandable: true, expanded: false,
      details: {
        type: 'tool-call', toolName: s.toolName || '', toolDescription: '',
        parameters: s.toolParams || {}, reasoning: '',
        result: s.toolResult,
        resultSummary: s.toolResult != null ? String(s.toolResult).slice(0, 100) : undefined,
      } as any,
    };
  }
  return {
    id: s.id, type: 'agent-response', icon: '💬', title: s.label, description: (s.text || '').slice(0, 100),
    active: false, completed: true, expandable: !!s.text, expanded: false,
    details: { type: 'agent-response', text: s.text || '', tokenUsage: { input: 0, output: 0 }, toolsUsed: [], apiCallCount: 0 } as any,
  };
}

const ObservabilityBar: React.FC<{ expandedHeight?: number }> = ({ expandedHeight = 240 }) => {
  const {
    currentAgentId,
    agents,
    workspaceMessages,
    workspaceObservability,
    workspaceRunning,
    workspaceCwd,
    assistantMessages,
    assistantObservability,
    assistantRunning,
  } = useAgentRuntimeStore();
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<'workspace' | 'assistant'>('workspace');
  const agent = agents.find(a => a.id === currentAgentId);

  const obs = target === 'workspace' ? workspaceObservability : assistantObservability;
  const running = target === 'workspace' ? workspaceRunning : assistantRunning;
  const targetLabel = target === 'workspace' ? (agent?.name || '工作台') : '项目助手';
  const messageCount = target === 'workspace' ? workspaceMessages.length : assistantMessages.length;
  const capabilityText = target === 'workspace'
    ? (agent?.capabilities?.length ? agent.capabilities.slice(0, 4).join(' · ') : '无工具')
    : '项目问答';
  const cwdText = target === 'workspace' && workspaceCwd
    ? workspaceCwd.split(/[\\/]/).filter(Boolean).slice(-2).join('/')
    : '默认沙箱';
  const hasTokenUsage = obs.tokenUsage.input > 0 || obs.tokenUsage.output > 0;

  const stepsForReplay = obs.steps.map(obsStepToTimelineStep);
  const eff = obs.strategyEffect;
  const savingPct = eff && eff.beforeTokenCount > 0
    ? Math.round((1 - eff.afterTokenCount / eff.beforeTokenCount) * 100) : 0;

  const baseStyle: React.CSSProperties = {
    borderTop: '1px solid #D6CFC4', background: '#EDE8DF',
    flexShrink: 0, display: 'flex', flexDirection: 'column',
  };
  const summaryStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 14px', cursor: 'pointer',
    fontSize: 14, color: 'var(--text-secondary)',
  };
  const metricStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' };

  return (
    <div style={baseStyle}>
      <div style={summaryStyle} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <span style={{ color: running ? 'var(--accent-emerald)' : 'var(--text-tertiary)' }}>●</span>
            <select
              value={target}
              onChange={e => setTarget(e.target.value as 'workspace' | 'assistant')}
              style={{ background: '#FFFFFF', color: '#1A1A1A', border: '1px solid #D6CFC4', borderRadius: 4, fontSize: 13, padding: '2px 6px', cursor: 'pointer' }}
            >
              <option value="workspace">{agent?.name || '工作台'} · 工作台</option>
              <option value="assistant">项目助手 · 助手</option>
            </select>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{running ? '运行中' : '空闲'}</span>
          </span>
          <button style={{ background: 'none', border: '1px solid #D6CFC4', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, padding: '2px 8px' }}>{expanded ? '收起 ⩘' : '展开 ⩘'}</button>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 13, flexWrap: 'wrap' }}>
          <span>消息 {messageCount}</span>
          <span>能力 <span style={metricStyle}>{capabilityText}</span></span>
          <span>目录 <span style={metricStyle}>{cwdText}</span></span>
          <span>Token <span style={metricStyle}>{hasTokenUsage ? `${obs.tokenUsage.input}/${obs.tokenUsage.output}` : '等待首次运行'}</span></span>
          {eff && <span>策略 {eff.strategy} · 省<span style={{ color: 'var(--accent-emerald)' }}>{savingPct}%</span></span>}
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #D6CFC4', height: expandedHeight, overflow: 'auto' }}>
          <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #D6CFC4', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>{targetLabel} · 运行步骤</div>
            <TimelineReplay steps={stepsForReplay} autoExpandPayload={true} />
          </div>
          <div style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid #D6CFC4', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>Token 消耗</div>
            <TokenAllocation data={{ input: obs.tokenUsage.input, output: obs.tokenUsage.output, contextSize: VITE_CONTEXT_SIZE }} />
          </div>
          <div style={{ flex: 1.2, padding: '12px 16px', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8 }}>策略效果</div>
            <StrategyEffectCard effect={eff as any} strategy={eff?.strategy || 'sliding'} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ObservabilityBar;

import React from 'react';
import type { TimelineStep, UserInputDetails, ApiRequestDetails, ApiResponseDetails, ToolCallDetails, AgentResponseDetails } from '../stores/appStore';

interface StepDetailPanelProps {
  step: TimelineStep;
  onViewFullPayload: (title: string, content: string) => void;
}

const CONTEXT_COLORS = ['var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-violet)', 'var(--accent-amber)'];

function StepDetailPanel({ step, onViewFullPayload }: StepDetailPanelProps) {
  if (!step.details) {
    return (
      <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        {step.description}
      </div>
    );
  }

  return (
    <div style={{
      padding: '10px 12px',
      fontSize: '11px',
      lineHeight: 1.6,
      color: 'var(--text-secondary)',
      borderTop: '1px solid var(--border-subtle)',
      background: 'rgba(0,0,0,0.15)',
    }}>
      {step.details.type === 'user-input' && <UserInputSection details={step.details} />}
      {step.details.type === 'api-request' && <ApiRequestSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'api-response' && <ApiResponseSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'tool-call' && <ToolCallSection details={step.details} onViewFullPayload={onViewFullPayload} />}
      {step.details.type === 'agent-response' && <AgentResponseSection details={step.details} />}

      {step.duration != null && (
        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
          耗时: {step.duration}ms
        </div>
      )}
    </div>
  );
}

function UserInputSection({ details }: { details: UserInputDetails }) {
  return (
    <>
      <div style={{ marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>输入内容: </span>
        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {details.text.length > 100 ? details.text.slice(0, 100) + '...' : details.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', color: 'var(--text-tertiary)' }}>
        <span>{details.tokenCount} tokens</span>
        <span>第 {details.conversationTurns} 轮</span>
      </div>
    </>
  );
}

function ApiRequestSection({ details, onViewFullPayload }: { details: ApiRequestDetails; onViewFullPayload: (title: string, content: string) => void }) {
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <span><span style={{ color: 'var(--text-tertiary)' }}>模型: </span>{details.model}</span>
        <span><span style={{ color: 'var(--text-tertiary)' }}>端点: </span>{details.url}</span>
      </div>
      {details.contextBreakdown.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: '4px' }}>上下文结构:</div>
          {details.contextBreakdown.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: CONTEXT_COLORS[i % CONTEXT_COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.section}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {item.tokenCount} tokens ({item.percentage}%)
              </span>
            </div>
          ))}
        </div>
      )}
      {details.requestBody && (
        <button
          onClick={() => onViewFullPayload('API 请求报文', details.requestBody!)}
          style={{
            background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
            color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
          }}
        >
          📄 查看完整报文
        </button>
      )}
    </>
  );
}

function ApiResponseSection({ details, onViewFullPayload }: { details: ApiResponseDetails; onViewFullPayload: (title: string, content: string) => void }) {
  const statusColor = details.statusCode === 200 ? 'var(--accent-emerald)' : details.statusCode < 500 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const typeLabel = details.responseType === 'tool_call' ? '含工具调用' : details.responseType === 'error' ? '错误' : '最终响应';

  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>状态: </span>
          <span style={{ color: statusColor }}>{details.statusCode}</span>
        </span>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>类型: </span>
          {typeLabel}
        </span>
        <span>
          <span style={{ color: 'var(--text-tertiary)' }}>耗时: </span>
          {details.duration}ms
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
        <span>input: {details.tokenUsage.input}</span>
        <span>output: {details.tokenUsage.output}</span>
      </div>
      {details.responseBody && (
        <button
          onClick={() => onViewFullPayload('API 响应报文', details.responseBody!)}
          style={{
            background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
            color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
          }}
        >
          📄 查看完整报文
        </button>
      )}
    </>
  );
}

function ToolCallSection({ details, onViewFullPayload }: { details: ToolCallDetails; onViewFullPayload: (title: string, content: string) => void }) {
  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--accent-violet)', fontWeight: 600 }}>🔧 {details.toolName}</span>
        {details.toolDescription && (
          <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>{details.toolDescription}</span>
        )}
      </div>
      {details.reasoning && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>调用原因: </span>{details.reasoning}
        </div>
      )}
      {details.parameters && Object.keys(details.parameters).length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>参数: </span>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: '3px' }}>
            {JSON.stringify(details.parameters)}
          </code>
        </div>
      )}
      {details.resultSummary && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>结果: </span>{details.resultSummary}
        </div>
      )}
      <button
        onClick={() => onViewFullPayload(
          `工具调用: ${details.toolName}`,
          JSON.stringify({
            toolName: details.toolName,
            parameters: details.parameters,
            result: details.result,
            reorganizedContext: details.reorganizedContext,
          }, null, 2)
        )}
        style={{
          background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
          color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
        }}
      >
        📄 查看完整报文
      </button>
    </>
  );
}

function AgentResponseSection({ details }: { details: AgentResponseDetails }) {
  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>回复预览: </span>
        <span style={{ wordBreak: 'break-all' }}>
          {details.text.length > 150 ? details.text.slice(0, 150) + '...' : details.text}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>input: {details.tokenUsage.input}</span>
        <span>output: {details.tokenUsage.output}</span>
        {details.apiCallCount > 0 && <span>API 调用: {details.apiCallCount}次</span>}
        {details.toolsUsed.length > 0 && <span>工具: {details.toolsUsed.join(', ')}</span>}
      </div>
    </>
  );
}

export default StepDetailPanel;

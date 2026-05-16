import React from 'react';
import type { TimelineStep, UserInputDetails, ApiRequestDetails, ApiResponseDetails, ToolCallDetails, AgentResponseDetails } from '../stores/appStore';

interface StepDetailPanelProps {
  step: TimelineStep;
  onViewFullPayload?: (title: string, content: string) => void;
  autoExpandPayload?: boolean;
}

const CONTEXT_COLORS = ['var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-violet)', 'var(--accent-amber)'];

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const payloadPreStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  fontFamily: 'var(--font-mono)', fontSize: '10px', lineHeight: 1.5,
  color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)',
  padding: '8px', borderRadius: '4px', margin: '6px 0 0',
  maxHeight: '300px', overflowY: 'auto',
};

function StepDetailPanel({ step, onViewFullPayload, autoExpandPayload }: StepDetailPanelProps) {
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
      {step.details.type === 'user-input' && <UserInputSection details={step.details} autoExpandPayload={autoExpandPayload} />}
      {step.details.type === 'api-request' && <ApiRequestSection details={step.details} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} />}
      {step.details.type === 'api-response' && <ApiResponseSection details={step.details} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} />}
      {step.details.type === 'tool-call' && <ToolCallSection details={step.details} onViewFullPayload={onViewFullPayload} autoExpandPayload={autoExpandPayload} />}
      {step.details.type === 'agent-response' && <AgentResponseSection details={step.details} autoExpandPayload={autoExpandPayload} />}

      {step.duration != null && (
        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
          耗时: {step.duration}ms
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '6px' }}>{label}:</div>
      <pre style={payloadPreStyle}>{formatJson(content)}</pre>
    </div>
  );
}

function ViewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: '1px solid var(--border-default)', borderRadius: '4px',
        color: 'var(--accent-blue)', fontSize: '10px', padding: '3px 8px', cursor: 'pointer',
      }}
    >
      📄 {label}
    </button>
  );
}

function UserInputSection({ details, autoExpandPayload }: { details: UserInputDetails; autoExpandPayload?: boolean }) {
  return (
    <>
      <div style={{ marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>输入内容: </span>
        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {autoExpandPayload ? details.text : (details.text.length > 100 ? details.text.slice(0, 100) + '...' : details.text)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '12px', color: 'var(--text-tertiary)' }}>
        <span>{details.tokenCount} tokens</span>
        <span>第 {details.conversationTurns} 轮</span>
      </div>
    </>
  );
}

function ApiRequestSection({ details, onViewFullPayload, autoExpandPayload }: { details: ApiRequestDetails; onViewFullPayload?: (title: string, content: string) => void; autoExpandPayload?: boolean }) {
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
        autoExpandPayload
          ? <PayloadBlock label="请求报文" content={details.requestBody} />
          : <ViewButton label="查看完整报文" onClick={() => onViewFullPayload?.('API 请求报文', details.requestBody!)} />
      )}
    </>
  );
}

function ApiResponseSection({ details, onViewFullPayload, autoExpandPayload }: { details: ApiResponseDetails; onViewFullPayload?: (title: string, content: string) => void; autoExpandPayload?: boolean }) {
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
        autoExpandPayload
          ? <PayloadBlock label="响应报文" content={details.responseBody} />
          : <ViewButton label="查看完整报文" onClick={() => onViewFullPayload?.('API 响应报文', details.responseBody!)} />
      )}
    </>
  );
}

function ToolCallSection({ details, onViewFullPayload, autoExpandPayload }: { details: ToolCallDetails; onViewFullPayload?: (title: string, content: string) => void; autoExpandPayload?: boolean }) {
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
            {autoExpandPayload ? JSON.stringify(details.parameters, null, 2) : JSON.stringify(details.parameters)}
          </code>
        </div>
      )}
      {details.resultSummary && !autoExpandPayload && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>结果: </span>{details.resultSummary}
        </div>
      )}
      {details.result && autoExpandPayload && (
        <PayloadBlock label="工具返回结果" content={typeof details.result === 'string' ? details.result : JSON.stringify(details.result, null, 2)} />
      )}
      {details.reorganizedContext && autoExpandPayload && (
        <PayloadBlock label="上下文重组" content={details.reorganizedContext} />
      )}
      {!autoExpandPayload && (
        <ViewButton
          label="查看完整报文"
          onClick={() => onViewFullPayload?.(
            `工具调用: ${details.toolName}`,
            JSON.stringify({
              toolName: details.toolName,
              parameters: details.parameters,
              result: details.result,
              reorganizedContext: details.reorganizedContext,
            }, null, 2)
          )}
        />
      )}
    </>
  );
}

function AgentResponseSection({ details, autoExpandPayload }: { details: AgentResponseDetails; autoExpandPayload?: boolean }) {
  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>回复: </span>
        <span style={{ wordBreak: 'break-all' }}>
          {autoExpandPayload ? details.text : (details.text.length > 150 ? details.text.slice(0, 150) + '...' : details.text)}
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

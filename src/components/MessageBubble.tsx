import React from 'react';
import type { Message } from '../stores/appStore';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageBubbleProps {
  message: Message;
  index: number;
  isExpanded: boolean;
  onToggleDetail: () => void;
}

function MessageBubble({ message, index, isExpanded, onToggleDetail }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start', gap: '8px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 600, flexShrink: 0,
        ...(isUser
          ? { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))', color: '#fff' }
          : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' })
      }}>
        {isUser ? 'U' : 'A'}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '75%', position: 'relative' }}>
        <div style={{
          padding: '10px 14px', fontSize: '15px', lineHeight: 1.5,
          ...(isUser
            ? {
                background: 'linear-gradient(135deg, rgba(91,156,245,0.15), rgba(167,139,250,0.1))',
                border: '1px solid rgba(91,156,245,0.15)',
                color: 'var(--text-primary)',
                borderRadius: '12px 4px 12px 12px'
              }
            : {
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: '4px 12px 12px 12px'
              })
        }}>
          {isUser ? message.content : <MarkdownRenderer content={message.content} />}
          {/* File attachments */}
          {message.files && message.files.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {message.files.map((file, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 8px', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)', borderRadius: '6px',
                  fontSize: '13px', color: 'var(--text-secondary)',
                }}>
                  {file.type.startsWith('image/') ? (
                    <>
                      <span>🖼️</span>
                      <span>{file.name}</span>
                      {file.url && (
                        <img src={file.url} alt={file.name} style={{
                          maxWidth: '100%', maxHeight: '150px',
                          borderRadius: '4px', marginTop: '4px',
                          border: '1px solid var(--border-subtle)'
                        }} />
                      )}
                    </>
                  ) : (
                    <>
                      <span>📎</span>
                      <span>{file.name}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Auxiliary detail button */}
        <button
          onClick={onToggleDetail}
          style={{
            position: 'absolute', bottom: '-2px', right: isUser ? undefined : '-4px',
            left: isUser ? '-4px' : undefined,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '4px', color: 'var(--text-tertiary)', fontSize: '11px',
            padding: '1px 4px', cursor: 'pointer', lineHeight: 1,
          }}
        >
          ···
        </button>
        {/* Auxiliary detail panel */}
        {isExpanded && (
          <div style={{
            marginTop: '8px', padding: '8px 10px', fontSize: '12px', lineHeight: 1.5,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '6px', color: 'var(--text-tertiary)',
          }}>
            {isUser ? (
              <>
                <div>Token 数: {Math.ceil(message.content.length / 4)}</div>
                <div>对话轮次: {Math.floor(index / 2) + 1}</div>
              </>
            ) : (
              <>
                {message.tokenUsage && (
                  <div>Token: input {message.tokenUsage.input} / output {message.tokenUsage.output}</div>
                )}
                {message.apiCallCount != null && <div>API 调用: {message.apiCallCount}次</div>}
                {message.toolsUsed && message.toolsUsed.length > 0 && <div>使用工具: {message.toolsUsed.join(', ')}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;

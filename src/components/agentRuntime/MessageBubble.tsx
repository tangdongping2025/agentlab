import React, { useState, memo } from 'react';
import Markdown from './Markdown';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
  showActions?: boolean;
}

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%', width: 'fit-content' }}>
        <div style={AI_AVATAR}>AI</div>
        <div
          data-testid="assistant-card"
          style={{
            flex: 1,
            minWidth: 0,
            background: '#FFFFFF',
            color: '#1A1A1A',
            border: '1px solid #D6CFC4',
            borderRadius: 12,
            padding: '16px 20px 12px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Markdown content={content} />
          {showActions && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
              {onRegenerate && (
                <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid="user-message-bubble"
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        padding: '12px 18px',
        borderRadius: '18px 18px 4px',
        background: '#E8E2D9',
        color: '#1A1A1A',
        fontSize: 15,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </div>
  );
};

export default memo(MessageBubble);

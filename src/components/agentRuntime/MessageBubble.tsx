import React, { useState, memo } from 'react';
import Markdown from './Markdown';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
}

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate }) => {
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
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%' }}>
        <div style={AI_AVATAR}>AI</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Markdown content={content} />
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
            {onRegenerate && (
              <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: 'var(--accent-blue)', color: '#fff', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {content}
    </div>
  );
};

export default memo(MessageBubble);

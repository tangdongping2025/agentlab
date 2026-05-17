import React, { useState } from 'react';

interface CodeBlockProps {
  language?: string;
  children: string;
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing if clipboard API unavailable
    }
  };

  return (
    <div style={{
      background: '#1e1e2e',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '10px 0',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        background: '#2d2d3f',
        fontSize: '11px',
        color: '#999',
      }}>
        <span style={{ textTransform: 'lowercase' }}>{language || ''}</span>
        <span
          onClick={handleCopy}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            cursor: 'pointer',
            color: copied ? '#27ae60' : (hovered ? '#27ae60' : '#7ec8e3'),
            fontSize: '12px',
            transition: 'color 0.2s',
          }}
        >
          {copied ? '✓ 已复制' : '复制'}
        </span>
      </div>
      <pre style={{
        margin: 0,
        padding: '12px',
        color: '#cdd6f4',
        fontFamily: "var(--font-mono)",
        fontSize: '13px',
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default CodeBlock;

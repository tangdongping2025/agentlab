import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard 不可用时静默 */ }
  };
  return (
    <div style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2A2A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: '#1E1E1E', color: '#D4D4D4', fontSize: 11 }}>
        <span>{language || 'text'}</span>
        <button onClick={copy} style={{ background: 'transparent', border: 'none', color: '#D4D4D4', cursor: 'pointer', fontSize: 11, padding: 0 }}>{copied ? '已复制' : '复制'}</button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, fontSize: 13, background: '#1E1E1E' }}
        codeTagProps={{ style: { fontFamily: '"SF Mono", "Fira Code", Consolas, monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;

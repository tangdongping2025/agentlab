import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
    <div style={{ margin: '8px 0', maxWidth: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #D6CFC4', background: '#FFFFFF' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: '#EDE8DF', color: '#555555', fontSize: 11 }}>
        <span>{language || 'text'}</span>
        <button onClick={copy} style={{ background: 'transparent', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 11, padding: 0 }}>{copied ? '已复制' : '复制'}</button>
      </div>
      <div data-testid="codeblock-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <SyntaxHighlighter
          language={language || 'text'}
          style={oneLight}
          customStyle={{ margin: 0, fontSize: 13, background: '#FFFFFF', maxWidth: '100%' }}
          codeTagProps={{ style: { fontFamily: '"SF Mono", "Fira Code", Consolas, monospace' } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default CodeBlock;

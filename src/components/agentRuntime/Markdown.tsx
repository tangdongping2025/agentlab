import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import CodeBlock from './CodeBlock';

const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)' }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children ?? '').replace(/\n$/, '');
          if (match) return <CodeBlock language={match[1]} code={codeStr} />;
          if (codeStr.includes('\n')) return <CodeBlock language="text" code={codeStr} />;
          return <code className={className} style={{ background: 'var(--bg-deep)', padding: '1px 4px', borderRadius: 3, fontSize: 13 }} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default Markdown;

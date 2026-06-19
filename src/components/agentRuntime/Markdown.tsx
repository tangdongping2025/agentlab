import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import CodeBlock from './CodeBlock';

const markdownStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.75,
  color: 'var(--text-primary)',
};

const headingStyle = (fontSize: number, marginTop: number): React.CSSProperties => ({
  fontSize,
  lineHeight: 1.35,
  fontWeight: 700,
  color: 'var(--text-primary)',
  margin: `${marginTop}px 0 8px`,
});

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 10px',
};

const listStyle: React.CSSProperties = {
  margin: '6px 0 10px',
  paddingLeft: 22,
};

const listItemStyle: React.CSSProperties = {
  margin: '4px 0',
};

const tableCellStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  padding: '8px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
};

const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <div data-testid="markdown-content" className="markdown-body" style={markdownStyle}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => <h2 style={headingStyle(18, 0)}>{children}</h2>,
        h2: ({ children }) => <h2 style={headingStyle(18, 0)}>{children}</h2>,
        h3: ({ children }) => <h3 style={headingStyle(16, 12)}>{children}</h3>,
        h4: ({ children }) => <h4 style={headingStyle(15, 10)}>{children}</h4>,
        p: ({ children }) => <p style={paragraphStyle}>{children}</p>,
        ul: ({ children }) => <ul style={listStyle}>{children}</ul>,
        ol: ({ children }) => <ol style={listStyle}>{children}</ol>,
        li: ({ children }) => <li style={listItemStyle}>{children}</li>,
        blockquote: ({ children }) => (
          <blockquote style={{
            margin: '10px 0',
            padding: '8px 12px',
            borderLeft: '3px solid var(--accent-blue)',
            background: 'var(--bg-deep)',
            borderRadius: 8,
            color: 'var(--text-secondary)',
          }}>
            {children}
          </blockquote>
        ),
        hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '16px 0' }} />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div data-testid="markdown-table-scroll" style={{ overflowX: 'auto', margin: '10px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ ...tableCellStyle, background: 'var(--bg-deep)', fontWeight: 650 }}>{children}</th>
        ),
        td: ({ children }) => <td style={tableCellStyle}>{children}</td>,
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

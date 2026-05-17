import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body" style={{
      fontSize: '15px',
      lineHeight: 1.7,
      color: 'var(--text-secondary)',
      wordBreak: 'break-word',
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h2: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h3: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h4: ({ children }) => <h4 style={{ margin: '10px 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h4>,
          p: ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            if (match) {
              return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
            }
            return (
              <code style={{
                background: 'var(--bg-elevated)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9em',
              }} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '6px 0', listStyleType: 'disc' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '3px solid var(--accent-blue)',
              paddingLeft: '12px',
              margin: '10px 0',
              color: 'var(--text-tertiary)',
              background: 'var(--bg-elevated)',
              borderRadius: '0 4px 4px 0',
              padding: '8px 12px',
            }}>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
              {children}
            </a>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '16px 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;

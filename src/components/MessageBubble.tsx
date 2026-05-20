import React from 'react';
import type { Message } from '../stores/appStore';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageBubbleProps {
  message: Message;
  index: number;
  isExpanded: boolean;
  onToggleDetail: () => void;
  onFullscreen?: (content: string) => void;
}

function MessageBubble({ message, index, isExpanded, onToggleDetail, onFullscreen }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [thinkingExpanded, setThinkingExpanded] = React.useState(false);
  const [showFileContent, setShowFileContent] = React.useState<number | null>(null);

  const getFileContent = (file: any) => {
    if (!file.content) return null;
    try {
      // 从 data URL 中提取 base64 编码的内容
      const parts = file.content.split(',');
      if (parts.length !== 2) return null;
      const decoded = atob(parts[1]);
      return decoded;
    } catch {
      return null;
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start', gap: '8px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', flexShrink: 0,
        ...(isUser
          ? { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))', color: '#fff' }
          : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' })
      }}>
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '75%', position: 'relative' }}>
        {/* Action buttons — AI only */}
        {!isUser && message.content.trim() && (
          <div style={{
            position: 'absolute', top: '6px', right: '6px',
            display: 'flex', gap: '2px', zIndex: 1,
          }}
          >
            {onFullscreen && (
              <button
                onClick={() => onFullscreen(message.content)}
                title="全屏查看"
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: '4px', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px',
                  padding: '2px 4px', lineHeight: 1, transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
              >
                🔍
              </button>
            )}
            <button
              onClick={() => {
                const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ai-reply-${new Date(message.timestamp).toISOString().slice(0,16).replace(/[T:]/g,'-')}.md`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              title="保存为 Markdown"
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '4px', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px',
                padding: '2px 4px', lineHeight: 1, transition: 'color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              💾
            </button>
          </div>
        )}
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
          {/* Thinking content */}
          {'thinkingContent' in message && (message as any).thinkingContent && !isUser && (
            <div style={{ marginBottom: '8px' }}>
              <div
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 8px', cursor: 'pointer',
                  background: 'rgba(250,204,21,0.06)',
                  border: '1px solid rgba(250,204,21,0.15)',
                  borderRadius: '6px', fontSize: '12px', color: '#facc15',
                  transition: 'all 0.15s',
                }}
              >
                <span>💭</span>
                <span>深度思考</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                  · {(message as any).thinkingContent.length} 字
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '10px' }}>
                  {thinkingExpanded ? '▲ 收起' : '▼ 展开'}
                </span>
              </div>
              {thinkingExpanded && (
                <div style={{
                  marginTop: '6px', padding: '10px',
                  background: 'var(--bg-base)', borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  maxHeight: '300px', overflowY: 'auto',
                  fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)',
                }}>
                  <MarkdownRenderer content={(message as any).thinkingContent} />
                </div>
              )}
            </div>
          )}
          {isUser ? message.content : <MarkdownRenderer content={message.content} />}
          {/* File attachments */}
          {message.files && message.files.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {message.files.map((file, idx) => {
                const isMD = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.markdown');
                const isText = file.type.startsWith('text/') || isMD;
                const fileContent = getFileContent(file);

                return (
                  <div key={idx} style={{
                    padding: '6px 8px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', borderRadius: '6px',
                    fontSize: '13px', color: 'var(--text-secondary)',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {file.type.startsWith('image/') ? (
                        <span>🖼️</span>
                      ) : isMD ? (
                        <span>📝</span>
                      ) : (
                        <span>📎</span>
                      )}
                      <span style={{ flex: 1 }}>{file.name}</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                      {(isMD || isText) && fileContent && (
                        <button
                          onClick={() => setShowFileContent(showFileContent === idx ? null : idx)}
                          style={{
                            background: 'none', border: '1px solid var(--border-subtle)',
                            borderRadius: '4px', padding: '2px 6px', fontSize: '11px',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                          }}
                        >
                          {showFileContent === idx ? '收起' : '查看内容'}
                        </button>
                      )}
                    </div>

                    {/* 图片预览 */}
                    {file.type.startsWith('image/') && file.url && (
                      <img src={file.url} alt={file.name} style={{
                        maxWidth: '100%', maxHeight: '150px',
                        borderRadius: '4px', marginTop: '4px',
                        border: '1px solid var(--border-subtle)'
                      }} />
                    )}

                    {/* MD/文本文件内容 */}
                    {showFileContent === idx && fileContent && (
                      <div style={{
                        marginTop: '8px', padding: '8px',
                        background: 'var(--bg-base)', borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                        maxHeight: '300px', overflowY: 'auto',
                      }}>
                        {isMD ? (
                          <MarkdownRenderer content={fileContent} />
                        ) : (
                          <pre style={{
                            margin: 0, whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word', fontSize: '12px',
                          }}>{fileContent}</pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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

import React, { useRef, useState, memo } from 'react';
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
  const [screenshotStatus, setScreenshotStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const assistantCardRef = useRef<HTMLDivElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const copyScreenshot = async () => {
    const card = assistantCardRef.current;
    if (!card) return;

    try {
      const { width, height } = card.getBoundingClientRect();
      const safeWidth = Math.max(1, Math.ceil(width));
      const safeHeight = Math.max(1, Math.ceil(height));
      const clonedCard = card.cloneNode(true) as HTMLElement;
      clonedCard.style.width = `${safeWidth}px`;
      clonedCard.style.boxSizing = 'border-box';
      clonedCard.querySelector('[data-testid="assistant-card-actions"]')?.remove();

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${clonedCard.outerHTML}</div></foreignObject></svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = safeWidth;
          canvas.height = safeHeight;
          const context = canvas.getContext('2d');
          if (!context) {
            URL.revokeObjectURL(url);
            reject(new Error('canvas context unavailable'));
            return;
          }

          context.drawImage(image, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('png blob unavailable'));
              return;
            }
            resolve(blob);
          }, 'image/png');
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('image render failed'));
        };
        image.src = url;
      });

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setScreenshotStatus('copied');
      setTimeout(() => setScreenshotStatus('idle'), 1500);
    } catch {
      setScreenshotStatus('failed');
      setTimeout(() => setScreenshotStatus('idle'), 1500);
    }
  };

  if (role === 'assistant') {
    return (
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%', width: 'fit-content' }}>
        <div style={AI_AVATAR}>AI</div>
        <div
          ref={assistantCardRef}
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
            <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制'}</button>
              <button onClick={copyScreenshot} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{screenshotStatus === 'copied' ? '截图已复制' : screenshotStatus === 'failed' ? '截图失败' : '截图复制'}</button>
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

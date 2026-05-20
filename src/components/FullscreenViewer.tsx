import React, { useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface FullscreenViewerProps {
  content: string;
  onClose: () => void;
}

function FullscreenViewer({ content, onClose }: FullscreenViewerProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--bg-base)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 1,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '6px', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '18px', color: 'var(--text-tertiary)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          ✕
        </button>
      </div>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          flex: 1, overflowY: 'auto',
          padding: '32px 48px',
          maxWidth: '960px', width: '100%', margin: '0 auto',
        }}
      >
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}

export default FullscreenViewer;

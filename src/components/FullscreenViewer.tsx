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
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: '900px',
          maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'sticky', top: '0', float: 'right',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '6px', width: '28px', height: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '16px', color: 'var(--text-tertiary)',
            zIndex: 1, marginBottom: '12px',
          }}
        >
          ✕
        </button>
        <div style={{ clear: 'both' }}>
          <MarkdownRenderer content={content} />
        </div>
      </div>
    </div>
  );
}

export default FullscreenViewer;

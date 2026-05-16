import { useEffect } from 'react';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

function DetailModal({ isOpen, onClose, title, content }: DetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  // Try to parse and pretty-print JSON
  let displayContent = content;
  try {
    const parsed = JSON.parse(content);
    displayContent = JSON.stringify(parsed, null, 2);
  } catch {
    // Not JSON, display as-is
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: '16px',
      }}
      onClick={handleBackdropClick}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '8px',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        maxWidth: '800px', width: '100%', maxHeight: '80vh',
        overflow: 'hidden', border: '1px solid var(--border-default)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: '60vh' }}>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.6,
            color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)',
            padding: '12px', borderRadius: '6px', overflowX: 'auto',
            margin: 0,
          }}>
            {displayContent}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '8px', padding: '12px 18px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '6px 14px', background: 'var(--accent-blue)', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            }}
          >
            复制
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default DetailModal;

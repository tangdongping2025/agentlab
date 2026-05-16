import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

export default function ToolSelectorBar() {
  const { selectedTools, availableTools, toggleTool } = useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '8px 10px', background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)', borderRadius: '8px',
          fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        🔧 工具{' '}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '12px',
          background: 'rgba(91,156,245,0.15)', color: 'var(--accent-blue)',
          padding: '1px 6px', borderRadius: '8px',
        }}>
          {selectedTools.length}
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
          width: '200px', background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)', borderRadius: '8px',
          padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {availableTools.map(tool => {
            const isSelected = selectedTools.includes(tool.id);
            return (
              <div
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
                  transition: 'background 0.1s', fontSize: '14px',
                  color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{
                  width: '14px', height: '14px', borderRadius: '3px',
                  border: `1.5px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', flexShrink: 0,
                  background: isSelected ? 'var(--accent-blue)' : 'transparent',
                  color: isSelected ? '#fff' : 'transparent',
                  transition: 'all 0.12s',
                }}>
                  {isSelected ? '✓' : ''}
                </span>
                <span style={{ fontSize: '16px' }}>{tool.icon}</span>
                <span>{tool.name.replace(tool.icon + ' ', '')}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

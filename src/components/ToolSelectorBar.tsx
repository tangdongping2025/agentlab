import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

const BUDGET_OPTIONS = [
  { label: '低', value: 5000, desc: '5K tokens' },
  { label: '中', value: 10000, desc: '10K tokens' },
  { label: '高', value: 20000, desc: '20K tokens' },
];

export default function ToolSelectorBar() {
  const { selectedTools, availableTools, toggleTool, thinkingEnabled, thinkingBudget, toggleThinking, setThinkingBudget } = useAppStore();
  const [open, setOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setBudgetOpen(false);
      }
    };
    if (open || budgetOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, budgetOpen]);

  return (
    <div ref={ref} style={{ display: 'flex', gap: '6px' }}>
      {/* 深度思考开关 */}
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => { toggleThinking(); setBudgetOpen(false); }}
          onContextMenu={(e) => { e.preventDefault(); setBudgetOpen(!budgetOpen); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 10px',
            background: thinkingEnabled ? 'rgba(250,204,21,0.12)' : 'var(--bg-surface)',
            border: `1px solid ${thinkingEnabled ? 'rgba(250,204,21,0.3)' : 'var(--border-default)'}`,
            borderRadius: '8px',
            fontSize: '14px', color: thinkingEnabled ? '#facc15' : 'var(--text-secondary)',
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          💡 深度思考
          {thinkingEnabled && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              background: 'rgba(250,204,21,0.15)', color: '#facc15',
              padding: '1px 5px', borderRadius: '8px',
            }}>
              {BUDGET_OPTIONS.find(b => b.value === thinkingBudget)?.label || '中'}
            </span>
          )}
        </div>
        {budgetOpen && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
            width: '140px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)', borderRadius: '8px',
            padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '4px 8px 6px' }}>
              思考预算
            </div>
            {BUDGET_OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => { setThinkingBudget(opt.value); setBudgetOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 8px', borderRadius: '5px', cursor: 'pointer',
                  transition: 'background 0.1s', fontSize: '13px',
                  color: thinkingBudget === opt.value ? '#facc15' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  border: `1.5px solid ${thinkingBudget === opt.value ? '#facc15' : 'var(--border-default)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', flexShrink: 0,
                  background: thinkingBudget === opt.value ? '#facc15' : 'transparent',
                  color: thinkingBudget === opt.value ? '#000' : 'transparent',
                }}>
                  ●
                </span>
                <span>{opt.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-tertiary)' }}>{opt.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 工具选择 */}
      <div style={{ position: 'relative' }}>
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
    </div>
  );
}

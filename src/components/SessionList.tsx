import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SessionListProps {
  onNewChat: () => void;
}

const VISIBLE_COUNT = 10;

function formatSmartTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const YYYY = d.getFullYear();

  if (isToday) return `${hh}:${mm}`;
  if (isThisYear) return `${MM}-${DD} ${hh}:${mm}`;
  return `${YYYY}-${MM}-${DD}`;
}

function getFirstMessagePreview(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return '新对话';
  const text = messages[0].content.trim();
  return text.length > 20 ? text.slice(0, 20) + '...' : text;
}

export default function SessionList({ onNewChat }: SessionListProps) {
  const { sessions, currentSessionId, switchSession, deleteSession, scenes } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleSessions = showAll ? sessions : sessions.slice(0, VISIBLE_COUNT);
  const hasMore = sessions.length > VISIBLE_COUNT;

  return (
    <div style={{
      borderBottom: '1px solid var(--border-subtle)',
      flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.9px', color: 'var(--text-tertiary)',
          padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>会话</span>
        <span
          onClick={e => { e.stopPropagation(); onNewChat(); }}
          style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--accent-blue)', cursor: 'pointer' }}
        >
          + 新建
        </span>
      </div>
      {!collapsed && (
        <div style={{ padding: '0 16px 0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {visibleSessions.map(session => {
              const isActive = currentSessionId === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => switchSession(session.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px', fontSize: '12px', cursor: 'pointer',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    transition: 'all 0.1s', borderRadius: '5px',
                    borderLeft: `2px solid ${isActive ? 'var(--accent-blue)' : 'transparent'}`,
                    background: isActive ? 'rgba(91,156,245,0.05)' : 'transparent',
                  }}
                >
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    fontFamily: 'var(--font-mono)', fontSize: '11px',
                  }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {formatSmartTime(session.createdAt)}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)', margin: '0 6px' }}>·</span>
                    <span style={{ color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)' }}>
                      {getFirstMessagePreview(session.messages)}
                    </span>
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                    style={{
                      opacity: 0, background: 'transparent', border: 'none',
                      color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px',
                      padding: '2px 4px', transition: 'opacity 0.12s', flexShrink: 0, marginLeft: '4px',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-rose)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {hasMore && !showAll && (
              <div
                onClick={() => setShowAll(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '7px', fontSize: '11px', color: 'var(--text-tertiary)',
                  cursor: 'pointer', borderRadius: '5px',
                }}
              >
                ··· 更多
              </div>
            )}
          </div>
          <button
            onClick={onNewChat}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              width: '100%', padding: '7px 10px', margin: '6px 0 14px',
              fontSize: '12px', fontWeight: 500, color: 'var(--accent-blue)',
              background: 'transparent', border: '1px dashed rgba(91,156,245,0.3)',
              borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            + 新建对话
          </button>
        </div>
      )}
    </div>
  );
}

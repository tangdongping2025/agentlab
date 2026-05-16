import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SessionListProps {
  onNewChat: () => void;
}

const VISIBLE_COUNT = 10;

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const diffWeek = Math.floor(diffMs / 604800000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return `${diffWeek}w`;
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
                  }}>
                    {session.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '9px',
                    color: 'var(--text-tertiary)', marginLeft: '8px', flexShrink: 0,
                  }}>
                    {formatRelativeTime(session.updatedAt)}
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

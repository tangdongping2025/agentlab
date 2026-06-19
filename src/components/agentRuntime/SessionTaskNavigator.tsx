import React, { useMemo, useState } from 'react';
import { deriveSessionTasks, type ChatMessageLike } from './sessionTasks';

interface Props {
  messages: ChatMessageLike[];
  activeMessageIndex: number | null;
  onJumpToMessage: (messageIndex: number) => void;
}

const SessionTaskNavigator: React.FC<Props> = ({ messages, activeMessageIndex, onJumpToMessage }) => {
  const [expanded, setExpanded] = useState(false);
  const tasks = useMemo(() => deriveSessionTasks(messages), [messages]);

  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="session-task-panel"
        onClick={() => setExpanded(value => !value)}
        style={{
          border: '1px solid #D6CFC4',
          borderRadius: 999,
          background: '#FFFFFF',
          color: '#1A1A1A',
          cursor: 'pointer',
          fontSize: 12,
          padding: '5px 10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}
      >
        任务 {tasks.length}
      </button>

      {expanded && (
        <div
          id="session-task-panel"
          data-testid="session-task-panel"
          style={{
            width: 208,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#EDE8DF',
            border: '1px solid #D6CFC4',
            borderRadius: 12,
            padding: 10,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>本会话任务</div>
          {tasks.length === 0 && (
            <div style={{ fontSize: 12, color: '#555555', lineHeight: 1.5 }}>本会话暂无明确任务</div>
          )}
          {tasks.map(task => {
            const active = task.messageIndex === activeMessageIndex;
            return (
              <button
                key={task.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onJumpToMessage(task.messageIndex)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  display: 'block',
                  border: `1px solid ${active ? '#2563EB' : '#D6CFC4'}`,
                  borderRadius: 8,
                  background: '#FFFFFF',
                  color: '#1A1A1A',
                  cursor: 'pointer',
                  padding: '8px 9px',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 650, lineHeight: 1.4 }}>
                  <span>{task.taskNumber}. </span>
                  <span>{task.title}</span>
                </div>
                <div style={{ fontSize: 11, color: '#555555', marginTop: 3 }}>第 {task.taskNumber} 条用户任务</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SessionTaskNavigator;

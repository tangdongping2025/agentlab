import React, { useMemo, useState } from 'react';
import type { MessageIndexItem } from '../../services/dbApi';
import { deriveSessionTasks, type ChatMessageLike } from './sessionTasks';

interface Props {
  messages: ChatMessageLike[];
  taskIndex?: MessageIndexItem[];
  activeMessageIndex: number | null;
  onJumpToMessage: (messageIndex: number) => void;
  onJumpToMessageSeq?: (messageSeq: number) => void;
}

const SessionTaskNavigator: React.FC<Props> = ({ messages, taskIndex = [], activeMessageIndex, onJumpToMessage, onJumpToMessageSeq }) => {
  const [expanded, setExpanded] = useState(false);
  const tasks = useMemo(() => {
    const indexedTasks = taskIndex.map((item, index) => ({
      id: `task-seq-${item.messageSeq}`,
      messageSeq: item.messageSeq,
      messageIndex: null,
      taskNumber: index + 1,
      title: item.title,
    }));
    const indexedSeqs = new Set(taskIndex.map(item => item.messageSeq));
    const localTasks = deriveSessionTasks(messages)
      .filter(task => {
        const seq = messages[task.messageIndex]?.seq;
        return seq === undefined || !indexedSeqs.has(seq);
      })
      .map(task => ({ ...task, messageSeq: messages[task.messageIndex]?.seq ?? null }));

    return [...indexedTasks, ...localTasks].map((task, index) => ({ ...task, taskNumber: index + 1 }));
  }, [messages, taskIndex]);

  return (
    <div data-testid="session-task-navigator" className="mobile-compact-task-navigator" style={{ position: 'sticky', top: 10, zIndex: 5, display: 'flex', alignItems: 'flex-start', alignSelf: 'flex-end', gap: 8, marginBottom: -30 }}>
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
            <div style={{ fontSize: 12, color: '#555555', lineHeight: 1.5 }}>本会话暂无用户任务</div>
          )}
          {tasks.map(task => {
            const active = task.messageIndex !== null && task.messageIndex === activeMessageIndex;
            return (
              <button
                key={task.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  if (task.messageSeq !== null && onJumpToMessageSeq) onJumpToMessageSeq(task.messageSeq);
                  else if (task.messageIndex !== null) onJumpToMessage(task.messageIndex);
                  setExpanded(false);
                }}
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

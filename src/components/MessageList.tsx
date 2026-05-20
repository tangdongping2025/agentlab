import React, { useRef, useEffect } from 'react';
import type { Message } from '../stores/appStore';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  expandedBubble: number | null;
  onToggleDetail: (index: number) => void;
}

function MessageList({ messages, expandedBubble, onToggleDetail }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: '16px' }}>
        开始对话来体验上下文管理！
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px',
    }}>
      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {messages.map((msg, index) => (
        <div key={`${msg.role}-${index}`} style={{ animation: 'msgIn 0.3s ease-out' }}>
          <MessageBubble
            message={msg}
            index={index}
            isExpanded={expandedBubble === index}
            onToggleDetail={() => onToggleDetail(index)}
          />
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList;

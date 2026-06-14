import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AssistantSidebar: React.FC = () => {
  const { assistantMessages, assistantStreaming, assistantRunning, runAssistant } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistantMessages, assistantStreaming]);

  const send = () => {
    if (!input.trim() || assistantRunning) return;
    runAssistant(input.trim());
    setInput('');
  };

  return (
    <div style={{ width: 280, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <strong style={{ fontSize: 13 }}>项目助手</strong>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>关于本平台的疑问</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {assistantMessages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: 8 }}>你好!我是项目助手,可以问我怎么用 Context Lab、各 agent 是什么。</div>
        )}
        {assistantMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: m.role === 'user' ? 'var(--accent-violet)' : 'var(--bg-base)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {m.content}
          </div>
        ))}
        {assistantStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-base)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{assistantStreaming}</div>
        )}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="问助手..."
          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}
        />
        <button onClick={send} disabled={assistantRunning} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--accent-violet)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, opacity: assistantRunning ? 0.5 : 1 }}>
          {assistantRunning ? '...' : '➤'}
        </button>
      </div>
    </div>
  );
};

export default AssistantSidebar;

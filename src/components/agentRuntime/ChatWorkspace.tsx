import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-default)',
  background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer', fontSize: 12,
};

const ChatWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceMessages, workspaceStreaming, workspaceEvents, workspaceRunning, runWorkspace, resetWorkspace } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const agent = agents.find(a => a.id === currentAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [workspaceMessages, workspaceStreaming]);

  const send = () => {
    if (!input.trim() || workspaceRunning) return;
    runWorkspace(input.trim());
    setInput('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><strong>{agent?.name || '未选'}</strong> <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{agent?.description}</span></div>
        <button onClick={resetWorkspace} style={btnStyle}>新对话</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {workspaceMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: m.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-surface)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {m.content}
          </div>
        ))}
        {workspaceStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: 'var(--bg-surface)', whiteSpace: 'pre-wrap' }}>{workspaceStreaming}</div>
        )}
        {workspaceEvents.length > 0 && (
          <div style={{ alignSelf: 'stretch', background: 'var(--bg-deep)', borderRadius: 8, padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {workspaceEvents.map((e, i) => <div key={i}>• {e.label}</div>)}
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
        />
        <button onClick={send} disabled={workspaceRunning || !currentAgentId} style={{ ...btnStyle, opacity: (workspaceRunning || !currentAgentId) ? 0.5 : 1 }}>
          {workspaceRunning ? '运行中...' : '发送'}
        </button>
      </div>
    </div>
  );
};

export default ChatWorkspace;

import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const AssistantSidebar: React.FC<{ width?: number }> = ({ width = 280 }) => {
  const { assistantMessages, assistantStreaming, assistantRunning, runAssistant, cancelAssistant } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistantMessages, assistantStreaming]);

  const send = () => {
    if (!input.trim() || assistantRunning) return;
    runAssistant(input.trim());
    setInput('');
  };

  if (collapsed) {
    return (
      <div style={{ width: 32, background: '#EDE8DF', borderLeft: '1px solid #D6CFC4', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 8 }}>
        <button onClick={() => setCollapsed(false)} title="展开助手" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16 }}>›</button>
        <span style={{ writingMode: 'vertical-rl', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>项目助手</span>
      </div>
    );
  }

  return (
    <div style={{ width, background: '#EDE8DF', borderLeft: '1px solid #D6CFC4', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #D6CFC4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: 13 }}>项目助手</strong>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>关于本平台的疑问</div>
        </div>
        <button onClick={() => setCollapsed(true)} title="收起助手" style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}>‹</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#F5F1EB' }}>
        {assistantMessages.length === 0 && (
          <div style={{ fontSize: 12, color: '#555555', padding: 8 }}>你好!我是项目助手,可以问我怎么用 Context Lab、各 agent 是什么。</div>
        )}
        {assistantMessages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: m.role === 'user' ? '#E8E2D9' : '#FFFFFF', color: m.role === 'user' ? '#1A1A1A' : 'var(--text-primary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{m.content}</div>
        ))}
        {assistantStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '90%', padding: '6px 10px', borderRadius: 8, background: '#FFFFFF', fontSize: 12, whiteSpace: 'pre-wrap' }}>{assistantStreaming}</div>
        )}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid #D6CFC4', display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="问助手..." style={{ flex: 1, padding: '6px 10px', borderRadius: 24, border: '1px solid #D6CFC4', background: '#FFFFFF', color: 'var(--text-primary)', fontSize: 12 }} />
        <button
          onClick={assistantRunning ? cancelAssistant : send}
          disabled={!assistantRunning && !input.trim()}
          title={assistantRunning ? '停止' : '发送'}
          style={{
            padding: '6px 10px', borderRadius: 8,
            background: assistantRunning ? 'var(--accent-red, #d9534f)' : 'var(--accent-violet)',
            color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12,
            opacity: !assistantRunning && !input.trim() ? 0.5 : 1,
          }}
        >{assistantRunning ? '■' : '➤'}</button>
      </div>
    </div>
  );
};

export default AssistantSidebar;

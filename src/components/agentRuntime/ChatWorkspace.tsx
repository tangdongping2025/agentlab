import React, { useState, useRef, useEffect } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';
import MessageBubble from './MessageBubble';
import SessionTaskNavigator from './SessionTaskNavigator';

const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 999, border: '1px solid #2563EB',
  background: '#2563EB', color: '#fff', cursor: 'pointer', fontSize: 12,
};

const lobsterExamples = [
  '帮我查看当前目录里有哪些文件',
  '帮我读一个文件并总结重点',
  '帮我运行命令检查项目状态',
];

const agentNameStyle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 14,
  background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const agentDescriptionStyle: React.CSSProperties = {
  color: '#4A4A4A',
  fontSize: 12,
  fontWeight: 500,
};

function getWorkspaceStatus(events: Array<{ type: string; label: string }>): string {
  const latest = [...events].reverse().find(event => event.type === 'thinking' || event.type === 'tool_call' || event.type === 'tool_result');
  if (!latest) return '正在思考…';
  if (latest.type === 'thinking') return '正在思考…';
  if (latest.type === 'tool_result') return '正在分析工具结果…';
  const toolName = latest.label.replace('调用工具:', '').trim();
  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') return '正在查看文件…';
  if (toolName === 'Edit' || toolName === 'Write') return '正在修改文件…';
  if (toolName === 'Bash') return '正在执行命令…';
  return '正在使用工具…';
}

const ChatWorkspace: React.FC = () => {
  const { agents, currentAgentId, workspaceMessages, workspaceStreaming, workspaceEvents, workspaceRunning, runWorkspace, cancelWorkspace, resetWorkspace, regenerateLast } = useAgentRuntimeStore();
  const [input, setInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const normalMessageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const fullscreenMessageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const [activeMessageIndex, setActiveMessageIndex] = useState<number | null>(null);
  const agent = agents.find(a => a.id === currentAgentId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [workspaceMessages, workspaceStreaming]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const send = () => {
    if (!input.trim() || workspaceRunning) return;
    runWorkspace(input.trim());
    setInput('');
  };

  const sendExample = (example: string) => {
    if (workspaceRunning) return;
    runWorkspace(example);
  };

  const jumpToMessage = (messageIndex: number, fullscreen: boolean) => {
    const refs = fullscreen ? fullscreenMessageRefs : normalMessageRefs;
    const target = refs.current[messageIndex];
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    setActiveMessageIndex(messageIndex);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setActiveMessageIndex(current => current === messageIndex ? null : current);
      highlightTimeoutRef.current = null;
    }, 1400);
  };

  const lastIdx = workspaceMessages.length - 1;

  const renderPanel = (fullscreen: boolean) => {
    const messageRefs = fullscreen ? fullscreenMessageRefs : normalMessageRefs;
    const isEmpty = workspaceMessages.length === 0 && !workspaceStreaming;
    const isLobsterAgent = agent?.id === 'claude-sdk';

    return (
    <div data-testid="chat-workspace-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
      <div data-testid="chat-workspace-header" style={{ padding: '10px 16px', borderBottom: '1px solid #D6CFC4', background: '#F5F1EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <strong style={agentNameStyle}>{agent?.name || '未选'}</strong>
          <span style={agentDescriptionStyle}>{agent?.description}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setIsFullscreen(!fullscreen)} style={btnStyle}>{fullscreen ? '退出全屏' : '全屏'}</button>
          <button onClick={resetWorkspace} style={btnStyle}>新对话</button>
        </div>
      </div>
      <div data-testid="chat-message-viewport" ref={fullscreen ? undefined : scrollRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#F5F1EB' }}>
        <SessionTaskNavigator messages={workspaceMessages} activeMessageIndex={activeMessageIndex} onJumpToMessage={messageIndex => jumpToMessage(messageIndex, fullscreen)} />
        {isEmpty && isLobsterAgent && (
          <div style={{ alignSelf: 'center', width: 'min(560px, 100%)', marginTop: 44, padding: 22, borderRadius: 18, border: '1px solid #D6CFC4', background: '#FFFDF9', boxShadow: '0 10px 30px rgba(80, 70, 55, 0.08)' }}>
            <div style={{ ...agentNameStyle, display: 'inline-block', fontSize: 20, marginBottom: 8 }}>我是龙虾 Agent</div>
            <div style={{ color: '#4A4A4A', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>我可以使用工具查看文件、读写内容、执行命令，并根据结果继续推进任务。</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {lobsterExamples.map(example => (
                <button key={example} type="button" onClick={() => sendExample(example)} style={{ border: '1px solid #C9B9FF', background: '#F7F2FF', color: '#4C1D95', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {workspaceRunning && isLobsterAgent && !isEmpty && (
          <div style={{ alignSelf: 'flex-start', border: '1px solid #C9B9FF', background: '#F7F2FF', color: '#4C1D95', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
            {getWorkspaceStatus(workspaceEvents)}
          </div>
        )}
        {workspaceMessages.map((m, i) => {
          const active = activeMessageIndex === i;
          return (
            <div
              key={i}
              data-message-index={i}
              ref={element => { messageRefs.current[i] = element; }}
              style={{
                border: active ? '1px solid #2563EB' : '1px solid transparent',
                background: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                borderRadius: 14,
                padding: 2,
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 160ms ease, background 160ms ease',
              }}
            >
              <MessageBubble
                role={m.role}
                content={m.content}
                onRegenerate={m.role === 'assistant' && i === lastIdx && !workspaceRunning ? regenerateLast : undefined}
              />
            </div>
          );
        })}
        {workspaceStreaming && (
          <MessageBubble role="assistant" content={workspaceStreaming} showActions={false} />
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #D6CFC4', background: '#F5F1EB', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '10px 18px', borderRadius: 24, border: '1px solid #D6CFC4', background: '#FFFFFF', color: '#1A1A1A', fontSize: 14 }}
        />
        <button
          onClick={workspaceRunning ? cancelWorkspace : send}
          disabled={!workspaceRunning && (!currentAgentId || !input.trim())}
          style={{
            ...btnStyle,
            background: workspaceRunning ? 'var(--accent-red, #d9534f)' : btnStyle.background,
            opacity: !workspaceRunning && (!currentAgentId || !input.trim()) ? 0.5 : 1,
          }}
        >
          {workspaceRunning ? '停止' : '发送'}
        </button>
      </div>
    </div>
  );
  };

  return (
    <>
      {renderPanel(false)}
      {isFullscreen && (
        <div
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) setIsFullscreen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 120, display: 'flex' }}
        >
          <div style={{ margin: 24, flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 18px 48px rgba(0,0,0,0.35)' }}>
            {renderPanel(true)}
          </div>
        </div>
      )}
    </>
  );
};

export default ChatWorkspace;

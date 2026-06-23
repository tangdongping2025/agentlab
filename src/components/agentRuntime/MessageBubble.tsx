import React, { useState, memo, useEffect, useLayoutEffect, useRef } from 'react';
import Markdown from './Markdown';
import ErrorBubble from './ErrorBubble';
import type { DisplayEvent } from '../../services/eventAdapter';
import type { AgentError } from '../../services/agentRuntimeApi';

interface ExportDocxResult {
  docxPath: string;
  downloadUrl: string;
}

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
  showActions?: boolean;
  workspaceCwd?: string;
  runtimeStatus?: string;
  runtimeEvents?: DisplayEvent[];
  onExportDocx?: (markdown: string) => Promise<ExportDocxResult>;
  error?: AgentError;
}

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

let stopActiveSpeech: (() => void) | null = null;

function toPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map(line => line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '- ')
      .replace(/^\s*\d+\.\s+/, match => `${match.trim()} `)
      .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1（$2）')
      .replace(/(```|~~~)\w*/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/^\|(.+)\|\s*$/, (_, cells) => cells.split('|').map((cell: string) => cell.trim()).join('\t')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy failed');
}

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true, workspaceCwd, runtimeStatus, runtimeEvents = [], onExportDocx, error }) => {
  const toolEvents = runtimeEvents.filter(event => event.type === 'tool_call' || event.type === 'tool_result');
  const [copied, setCopied] = useState(false);
  const [plainCopied, setPlainCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportedWord, setExportedWord] = useState<ExportDocxResult | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const exportRequestRef = useRef(0);
  const exportContextVersionRef = useRef(0);
  const activeExportVersionRef = useRef<number | null>(null);
  const committedExportContextRef = useRef({ content, workspaceCwd });
  const renderContextMatchesCommitted = committedExportContextRef.current.content === content && committedExportContextRef.current.workspaceCwd === workspaceCwd;
  const exportStateIsCurrent = renderContextMatchesCommitted && activeExportVersionRef.current === exportContextVersionRef.current;
  const currentExportedWord = exportStateIsCurrent ? exportedWord : null;
  const currentExportMessage = exportStateIsCurrent ? exportMessage : '';
  const currentExportingWord = exportStateIsCurrent && exportingWord;
  const speakingRef = useRef(false);
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const copy = async () => {
    try {
      await copyText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  const copyPlainText = async () => {
    try {
      await copyText(toPlainText(content));
      setPlainCopied(true);
      setTimeout(() => setPlainCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const clearSpeech = () => {
    speakingRef.current = false;
    setSpeaking(false);
    if (stopActiveSpeech === stopSpeechRef.current) stopActiveSpeech = null;
  };

  const exportWord = async () => {
    if (!onExportDocx) return;
    if (!workspaceCwd) {
      activeExportVersionRef.current = exportContextVersionRef.current;
      setExportMessage('请先选择工作目录');
      return;
    }
    if (currentExportingWord) return;

    const requestId = exportRequestRef.current + 1;
    const requestVersion = exportContextVersionRef.current;
    const requestContent = content;
    const requestWorkspaceCwd = workspaceCwd;
    exportRequestRef.current = requestId;
    activeExportVersionRef.current = requestVersion;
    const isCurrentExport = () => (
      exportRequestRef.current === requestId &&
      exportContextVersionRef.current === requestVersion &&
      activeExportVersionRef.current === requestVersion &&
      committedExportContextRef.current.content === requestContent &&
      committedExportContextRef.current.workspaceCwd === requestWorkspaceCwd
    );

    setExportingWord(true);
    setExportMessage('');
    try {
      const result = await onExportDocx(content);
      if (isCurrentExport()) setExportedWord(result);
    } catch {
      if (isCurrentExport()) setExportMessage('Word 导出失败');
    } finally {
      if (isCurrentExport()) setExportingWord(false);
    }
  };

  const downloadWord = () => {
    if (!currentExportedWord) return;
    const a = document.createElement('a');
    a.href = currentExportedWord.downloadUrl;
    a.download = currentExportedWord.docxPath.split(/[\\/]/).pop() || 'assistant-card.docx';
    a.click();
  };

  const stopSpeechRef = useRef(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    clearSpeech();
  });

  const toggleSpeech = () => {
    if (!supportsSpeech) return;
    if (speaking) {
      stopSpeechRef.current();
      return;
    }

    const text = toPlainText(content);
    if (!text) return;
    stopActiveSpeech?.();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onend = clearSpeech;
    utterance.onerror = clearSpeech;
    speakingRef.current = true;
    setSpeaking(true);
    stopActiveSpeech = stopSpeechRef.current;
    window.speechSynthesis.speak(utterance);
  };

  useLayoutEffect(() => {
    if (committedExportContextRef.current.content !== content || committedExportContextRef.current.workspaceCwd !== workspaceCwd) {
      committedExportContextRef.current = { content, workspaceCwd };
      exportContextVersionRef.current += 1;
      exportRequestRef.current += 1;
      activeExportVersionRef.current = null;
      setExportedWord(null);
      setExportMessage('');
      setExportingWord(false);
    }
  }, [content, workspaceCwd]);

  useEffect(() => {
    if (stopActiveSpeech === stopSpeechRef.current) stopSpeechRef.current();
  }, [content, role]);

  useEffect(() => {
    return () => {
      if (stopActiveSpeech === stopSpeechRef.current) stopSpeechRef.current();
    };
  }, []);

  if (role === 'assistant') {
    return (
      <div className="mobile-compact-message-row" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <div className="mobile-compact-avatar" style={AI_AVATAR}>AI</div>
        <div
          data-testid="assistant-card"
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowWrap: 'anywhere',
            background: '#FFFFFF',
            color: '#1A1A1A',
            border: '1px solid #D6CFC4',
            borderRadius: 12,
            padding: '16px 20px 12px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          {runtimeStatus && (
            <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 10, background: '#F7F2FF', color: '#4C1D95', fontSize: 12, fontWeight: 700 }}>
              {runtimeStatus}
            </div>
          )}
          {error ? (
            <ErrorBubble error={error} />
          ) : (
            <>
              <Markdown content={content} />
              {toolEvents.length > 0 && (
                <details data-testid="assistant-tool-timeline" style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#6B625A', fontSize: 12, fontWeight: 700 }}>工具时间线</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {toolEvents.map((event, index) => (
                      <div key={`${event.type}-${event.ts}-${index}`} style={{ border: '1px solid #E6DED2', borderRadius: 10, padding: 8, background: '#FFFDF9' }}>
                        <div style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 700 }}>{event.label}</div>
                        {event.detail && <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#6B625A', fontSize: 11 }}>{event.detail}</pre>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {showActions && (
                <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                  <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制内容'}</button>
                  <button onClick={copyPlainText} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{plainCopied ? '已复制纯文本' : '复制纯文本'}</button>
                  {supportsSpeech && (
                    <button onClick={toggleSpeech} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{speaking ? '停止' : '朗读'}</button>
                  )}
                  {onExportDocx && (
                    currentExportedWord ? (
                      <button onClick={downloadWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>下载 Word</button>
                    ) : (
                      <button onClick={exportWord} disabled={currentExportingWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: currentExportingWord ? 'default' : 'pointer', padding: 0 }}>{currentExportingWord ? '导出中…' : '导出 Word'}</button>
                    )
                  )}
                  {currentExportMessage && <span style={{ fontSize: 11, color: '#B42318' }}>{currentExportMessage}</span>}
                  {onRegenerate && (
                    <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      data-testid="user-message-bubble"
      style={{
        alignSelf: 'flex-end',
        maxWidth: '80%',
        padding: '12px 18px',
        borderRadius: '18px 18px 4px',
        background: '#E8E2D9',
        color: '#1A1A1A',
        fontSize: 15,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </div>
  );
};

export default memo(MessageBubble);

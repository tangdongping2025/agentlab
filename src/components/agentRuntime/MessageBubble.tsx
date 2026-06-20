import React, { useState, memo, useEffect, useRef } from 'react';
import Markdown from './Markdown';

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
  onExportDocx?: (markdown: string) => Promise<ExportDocxResult>;
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

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true, workspaceCwd, onExportDocx }) => {
  const [copied, setCopied] = useState(false);
  const [plainCopied, setPlainCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportedWord, setExportedWord] = useState<ExportDocxResult | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const exportRequestRef = useRef(0);
  const latestExportContextRef = useRef({ content, workspaceCwd });
  const speakingRef = useRef(false);
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  const copyPlainText = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(content));
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
      setExportMessage('请先选择工作目录');
      return;
    }
    if (exportingWord) return;

    const requestId = exportRequestRef.current + 1;
    exportRequestRef.current = requestId;
    const requestContent = content;
    const requestWorkspaceCwd = workspaceCwd;
    const isCurrentExport = () => (
      exportRequestRef.current === requestId &&
      latestExportContextRef.current.content === requestContent &&
      latestExportContextRef.current.workspaceCwd === requestWorkspaceCwd
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
    if (!exportedWord) return;
    const a = document.createElement('a');
    a.href = exportedWord.downloadUrl;
    a.download = exportedWord.docxPath.split(/[\\/]/).pop() || 'assistant-card.docx';
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

  useEffect(() => {
    latestExportContextRef.current = { content, workspaceCwd };
    exportRequestRef.current += 1;
    setExportedWord(null);
    setExportMessage('');
    setExportingWord(false);
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
      <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start', maxWidth: '88%', width: 'fit-content' }}>
        <div style={AI_AVATAR}>AI</div>
        <div
          data-testid="assistant-card"
          style={{
            flex: 1,
            minWidth: 0,
            background: '#FFFFFF',
            color: '#1A1A1A',
            border: '1px solid #D6CFC4',
            borderRadius: 12,
            padding: '16px 20px 12px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Markdown content={content} />
          {showActions && (
            <div data-testid="assistant-card-actions" style={{ display: 'flex', gap: 12, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={copy} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{copied ? '已复制' : '复制内容'}</button>
              <button onClick={copyPlainText} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{plainCopied ? '已复制纯文本' : '复制纯文本'}</button>
              {supportsSpeech && (
                <button onClick={toggleSpeech} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>{speaking ? '停止' : '朗读'}</button>
              )}
              {onExportDocx && (
                exportedWord ? (
                  <button onClick={downloadWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>下载 Word</button>
                ) : (
                  <button onClick={exportWord} disabled={exportingWord} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: exportingWord ? 'default' : 'pointer', padding: 0 }}>{exportingWord ? '导出中…' : '导出 Word'}</button>
                )
              )}
              {exportMessage && <span style={{ fontSize: 11, color: '#B42318' }}>{exportMessage}</span>}
              {onRegenerate && (
                <button onClick={onRegenerate} style={{ fontSize: 11, background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0 }}>重新生成</button>
              )}
            </div>
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

import React, { useState, memo, useEffect, useRef } from 'react';
import Markdown from './Markdown';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  onRegenerate?: () => void;
  showActions?: boolean;
}

const AI_AVATAR: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
};

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

const MessageBubble: React.FC<Props> = ({ role, content, onRegenerate, showActions = true }) => {
  const [copied, setCopied] = useState(false);
  const [plainCopied, setPlainCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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

  const toggleSpeech = () => {
    if (!supportsSpeech) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }

    const text = toPlainText(content);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onend = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      setSpeaking(false);
    };
    speakingRef.current = true;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (speakingRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
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

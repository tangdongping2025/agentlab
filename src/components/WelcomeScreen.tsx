import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

const sceneIcons: Record<string, string> = {
  restaurant: '🍽️',
  research: '📊',
  dialog: '💬',
  custom: '✏️',
};

const sceneNames: Record<string, string> = {
  restaurant: '餐厅预订',
  research: '投资研究',
  dialog: '对话分析',
  custom: '自定义',
};

interface WelcomeScreenProps {
  onStartConversation: (input: string) => void;
}

export default function WelcomeScreen({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('');
  const { currentScene, toggleSidebar } = useAppStore();

  const handleSend = () => {
    if (input.trim()) {
      onStartConversation(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow effect */}
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(91,156,245,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{
        width: '64px', height: '64px',
        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
        borderRadius: '16px',
        marginBottom: '24px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px',
        boxShadow: '0 8px 32px rgba(91,156,245,0.2)',
      }}>
        🧠
      </div>

      <h2 style={{
        fontSize: '28px',
        fontWeight: 700,
        letterSpacing: '-0.5px',
        marginBottom: '8px',
      }}>
        开始你的上下文实验
      </h2>

      <p style={{
        fontSize: '14px',
        color: 'var(--text-secondary)',
        marginBottom: '24px',
        textAlign: 'center',
        maxWidth: '400px',
        lineHeight: 1.6,
      }}>
        直接输入问题，观察不同上下文策略如何影响智能体的表现。
      </p>

      {/* Scene badge */}
      <div
        onClick={toggleSidebar}
        title="点击打开侧栏切换场景"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '24px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ fontSize: '14px' }}>{sceneIcons[currentScene] || '✏️'}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>当前场景</span>
        <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{sceneNames[currentScene] || '自定义'}</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>▸</span>
      </div>

      {/* Input */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        position: 'relative',
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题，开始实验..."
          style={{
            width: '100%',
            padding: '18px 56px 18px 20px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      <div style={{
        marginTop: '16px',
        fontSize: '11px',
        color: 'var(--text-tertiary)',
      }}>
        按 Enter 发送 · 在左侧切换场景 · 点击 ⚙ 调整策略
      </div>
    </div>
  );
}

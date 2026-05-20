# 优化对话窗口体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standard Markdown rendering to assistant messages in the chat window, with code block copy functionality.

**Architecture:** Install react-markdown + remark-gfm. Create 4 new components (CodeBlock, MarkdownRenderer, MessageBubble, MessageList). Refactor ChatInteraction.tsx to use these components. User messages remain plain text; assistant messages render through MarkdownRenderer which delegates code blocks to CodeBlock.

**Tech Stack:** React 18, TypeScript, react-markdown, remark-gfm, Zustand

---

### Task 1: Install dependencies

**Files:**
- Modify: `context-lab/package.json`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd context-lab && npm install react-markdown remark-gfm
```

- [ ] **Step 2: Verify installation**

```bash
cd context-lab && npm ls react-markdown remark-gfm
```

Expected: both packages listed with versions

- [ ] **Step 3: Commit**

```bash
git add context-lab/package.json context-lab/package-lock.json && git commit -m "feat(RQ-021/T1): add react-markdown and remark-gfm dependencies"
```

---

### Task 2: Create CodeBlock component

**Files:**
- Create: `context-lab/src/components/CodeBlock.tsx`

- [ ] **Step 1: Write CodeBlock component**

```tsx
import React, { useState } from 'react';

interface CodeBlockProps {
  language?: string;
  children: string;
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing if clipboard API unavailable
    }
  };

  return (
    <div style={{
      background: '#1e1e2e',
      borderRadius: '8px',
      overflow: 'hidden',
      margin: '10px 0',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 12px',
        background: '#2d2d3f',
        fontSize: '11px',
        color: '#999',
      }}>
        <span>{language || ''}</span>
        <span
          onClick={handleCopy}
          style={{
            cursor: 'pointer',
            color: copied ? '#27ae60' : '#7ec8e3',
            transition: 'color 0.2s',
          }}
        >
          {copied ? '✓ 已复制' : '复制'}
        </span>
      </div>
      <pre style={{
        margin: 0,
        padding: '12px',
        color: '#cdd6f4',
        fontFamily: "var(--font-mono)",
        fontSize: '13px',
        overflowX: 'auto',
        whiteSpace: 'pre',
      }}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default CodeBlock;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/CodeBlock.tsx && git commit -m "feat(RQ-021/T2): add CodeBlock component with copy button"
```

---

### Task 3: Create MarkdownRenderer component

**Files:**
- Create: `context-lab/src/components/MarkdownRenderer.tsx`

- [ ] **Step 1: Write MarkdownRenderer component**

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body" style={{
      fontSize: '15px',
      lineHeight: 1.7,
      color: 'var(--text-secondary)',
      wordBreak: 'break-word',
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h2: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h3: ({ children }) => <h3 style={{ margin: '12px 0 8px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>,
          h4: ({ children }) => <h4 style={{ margin: '10px 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h4>,
          p: ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            if (match) {
              return <CodeBlock language={match[1]}>{codeString}</CodeBlock>;
            }
            return (
              <code style={{
                background: 'var(--bg-elevated)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9em',
              }} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          ul: ({ children }) => <ul style={{ paddingLeft: '20px', margin: '6px 0', listStyleType: 'disc' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '3px solid var(--accent-blue)',
              paddingLeft: '12px',
              margin: '10px 0',
              color: 'var(--text-tertiary)',
              background: 'var(--bg-elevated)',
              borderRadius: '0 4px 4px 0',
              padding: '8px 12px',
            }}>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
              {children}
            </a>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '16px 0' }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/MarkdownRenderer.tsx && git commit -m "feat(RQ-021/T3): add MarkdownRenderer with custom styling"
```

---

### Task 4: Create MessageBubble component

**Files:**
- Create: `context-lab/src/components/MessageBubble.tsx`

- [ ] **Step 1: Write MessageBubble component**

```tsx
import React from 'react';
import type { Message } from '../stores/appStore';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageBubbleProps {
  message: Message;
  index: number;
  isExpanded: boolean;
  onToggleDetail: () => void;
}

function MessageBubble({ message, index, isExpanded, onToggleDetail }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start', gap: '8px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '28px', height: '28px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 600, flexShrink: 0,
        ...(isUser
          ? { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))', color: '#fff' }
          : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' })
      }}>
        {isUser ? 'U' : 'A'}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '75%', position: 'relative' }}>
        <div style={{
          padding: '10px 14px', fontSize: '15px', lineHeight: 1.5,
          ...(isUser
            ? {
                background: 'linear-gradient(135deg, rgba(91,156,245,0.15), rgba(167,139,250,0.1))',
                border: '1px solid rgba(91,156,245,0.15)',
                color: 'var(--text-primary)',
                borderRadius: '12px 4px 12px 12px'
              }
            : {
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: '4px 12px 12px 12px'
              })
        }}>
          {isUser ? message.content : <MarkdownRenderer content={message.content} />}
        </div>
        {/* Auxiliary detail button */}
        <button
          onClick={onToggleDetail}
          style={{
            position: 'absolute', bottom: '-2px', right: isUser ? undefined : '-4px',
            left: isUser ? '-4px' : undefined,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '4px', color: 'var(--text-tertiary)', fontSize: '11px',
            padding: '1px 4px', cursor: 'pointer', lineHeight: 1,
          }}
        >
          ···
        </button>
        {/* Auxiliary detail panel */}
        {isExpanded && (
          <div style={{
            marginTop: '8px', padding: '8px 10px', fontSize: '12px', lineHeight: 1.5,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '6px', color: 'var(--text-tertiary)',
          }}>
            {isUser ? (
              <>
                <div>Token 数: {Math.ceil(message.content.length / 4)}</div>
                <div>对话轮次: {Math.floor(index / 2) + 1}</div>
              </>
            ) : (
              <>
                {message.tokenUsage && (
                  <div>Token: input {message.tokenUsage.input} / output {message.tokenUsage.output}</div>
                )}
                {message.apiCallCount != null && <div>API 调用: {message.apiCallCount}次</div>}
                {message.toolsUsed && message.toolsUsed.length > 0 && <div>使用工具: {message.toolsUsed.join(', ')}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/MessageBubble.tsx && git commit -m "feat(RQ-021/T4): add MessageBubble with user/assistant rendering split"
```

---

### Task 5: Create MessageList component

**Files:**
- Create: `context-lab/src/components/MessageList.tsx`

- [ ] **Step 1: Write MessageList component**

```tsx
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
      <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '32px 0', fontSize: '16px' }}>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add context-lab/src/components/MessageList.tsx && git commit -m "feat(RQ-021/T5): add MessageList with scrollToBottom"
```

---

### Task 6: Refactor ChatInteraction to use new components

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: Replace ChatInteraction with refactored version**

Replace the entire content of `context-lab/src/components/ChatInteraction.tsx` with:

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, type TimelineStep, type StrategyEffectStepDetails } from '../stores/appStore';
import { agentService } from '../services/agentService';
import type { ContextStrategy } from '../types/index';
import ToolSelectorBar from './ToolSelectorBar';
import MessageList from './MessageList';

interface ChatInteractionProps {
  initialMessage?: string;
}

let stepCounter = 0;
function nextStepId() { return `step-${Date.now()}-${++stepCounter}`; }

function ChatInteraction({ initialMessage = '' }: ChatInteractionProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoSent = useRef(false);
  const [expandedBubble, setExpandedBubble] = useState<number | null>(null);
  const [sceneOpen, setSceneOpen] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  const {
    scenes,
    currentScene,
    setScene,
    systemPrompt,
    selectedTools,
    contextStrategy,
    resetTimeline,
    addTimelineStep,
    completeTimelineStep,
    updateTimelineStepData,
    addMessage,
    conversationHistory,
    addApiRequest,
    addApiResponse,
    saveCurrentSession,
    setLastUserInput,
    setStrategyEffect,
  } = useAppStore();

  useEffect(() => {
    if (initialMessage && !hasAutoSent.current) {
      hasAutoSent.current = true;
      setInput(initialMessage);
      handleSendWithInput(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sceneRef.current && !sceneRef.current.contains(e.target as Node)) {
        setSceneOpen(false);
      }
    };
    if (sceneOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sceneOpen]);

  const handleSend = async () => {
    handleSendWithInput(input);
  };

  const handleSendWithInput = async (text: string) => {
    if (!text.trim()) return;

    try {
      resetTimeline();
      setLastUserInput(text);
      setIsLoading(true);

      // Step 1: User input — complete immediately
      const userInputStep: TimelineStep = {
        id: nextStepId(),
        type: 'user-input',
        icon: '💬',
        title: '用户输入',
        description: `发送请求：${text.slice(0, 50)}...`,
        active: false,
        completed: true,
        expandable: true,
        expanded: false,
        details: {
          type: 'user-input',
          text,
          tokenCount: Math.ceil(text.length / 4),
          conversationTurns: conversationHistory.filter(m => m.role === 'user').length + 1,
        },
      };
      addTimelineStep(userInputStep);

      addMessage('user', text);
      saveCurrentSession();
      setInput('');

      // Initialize agent if needed
      if (!agentService.isAgentInitialized()) {
        const config = {
          apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
          baseURL: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
          model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
        };
        await agentService.initialize(config);
      }

      // Inject API recording methods
      agentService.setApiRecordingMethods(addApiRequest, addApiResponse);

      // Register timeline callbacks
      agentService.setTimelineCallbacks({
        onUserInput: () => { /* Already handled above */ },
        onApiRequestStart: (url, model, contextBreakdown, requestBody) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'api-request',
            icon: '📤',
            title: 'API 请求',
            description: `发送请求到 ${model}`,
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            details: { type: 'api-request', url, model, contextBreakdown, requestBody },
          };
          addTimelineStep(step);
        },
        onApiResponseReceived: (statusCode, duration, tokenUsage, responseType, responseBody) => {
          const state = useAppStore.getState();
          const requestStep = [...state.timelineSteps].reverse().find(s => s.type === 'api-request' && s.active);
          if (requestStep) {
            completeTimelineStep(requestStep.id);
          }
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'api-response',
            icon: '📥',
            title: 'API 响应',
            description: responseType === 'tool_call' ? '收到工具调用指令' : responseType === 'error' ? '响应错误' : '收到最终响应',
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            duration,
            tokenUsage,
            details: { type: 'api-response', statusCode, duration, tokenUsage, responseType, responseBody },
          };
          addTimelineStep(step);
          setTimeout(() => {
            completeTimelineStep(step.id);
          }, 100);
        },
        onToolCallDetected: (toolName, toolDescription, parameters, reasoning) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'tool-call',
            icon: '🔧',
            title: `工具: ${toolName}`,
            description: `调用 ${toolName}`,
            active: true,
            completed: false,
            expandable: true,
            expanded: false,
            toolCallName: toolName,
            details: { type: 'tool-call', toolName, toolDescription, parameters, reasoning },
          };
          addTimelineStep(step);
        },
        onToolResultReady: (toolName, result, reorganizedContext) => {
          const state = useAppStore.getState();
          const toolStep = [...state.timelineSteps].reverse().find(s => s.type === 'tool-call' && s.toolCallName === toolName && s.active);
          const resultSummary = typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
          if (toolStep) {
            updateTimelineStepData(toolStep.id, {
              details: {
                type: 'tool-call',
                toolName,
                toolDescription: (toolStep.details as any)?.toolDescription || '',
                parameters: (toolStep.details as any)?.parameters || {},
                reasoning: (toolStep.details as any)?.reasoning || '',
                result,
                resultSummary,
                reorganizedContext,
              },
            });
            completeTimelineStep(toolStep.id);
          }
        },
        onAgentResponse: (text, tokenUsage, toolsUsed, apiCallCount) => {
          const step: TimelineStep = {
            id: nextStepId(),
            type: 'agent-response',
            icon: '🤖',
            title: '智能体回复',
            description: '收到大模型响应',
            active: false,
            completed: true,
            expandable: true,
            expanded: false,
            tokenUsage,
            details: { type: 'agent-response', text, tokenUsage, toolsUsed, apiCallCount },
          };
          addTimelineStep(step);
        },
      });

      // Send message to Claude
      const agentResponse = await agentService.sendMessage(
        text,
        systemPrompt,
        selectedTools,
        contextStrategy
      );

      // Check if strategy was triggered and add timeline step
      const strategyEffect = agentService.getLastStrategyEffect();
      if (strategyEffect && strategyEffect.triggered) {
        setStrategyEffect(strategyEffect);
        const strategyLabels: Record<string, string> = {
          sliding: '滑动窗口',
          full: '完整记忆',
          summary: '摘要记忆',
          none: '无记忆',
        };
        const savingsPercent = strategyEffect.beforeTokenCount > 0
          ? Math.round((1 - strategyEffect.afterTokenCount / strategyEffect.beforeTokenCount) * 100)
          : 0;

        const strategyStep: TimelineStep = {
          id: nextStepId(),
          type: 'strategy-effect',
          icon: '⚡',
          title: `策略生效: ${strategyLabels[strategyEffect.strategy] || strategyEffect.strategy}`,
          description: strategyEffect.degraded
            ? `摘要降级为滑动窗口 - ${strategyEffect.degradeReason}`
            : `${strategyEffect.beforeMessages.length} 条 → ${strategyEffect.afterMessages.length} 条 · 节省 ${savingsPercent}%`,
          active: false,
          completed: true,
          expandable: true,
          expanded: false,
          details: {
            type: 'strategy-effect',
            strategy: strategyEffect.strategy,
            strategyLabel: strategyLabels[strategyEffect.strategy] || strategyEffect.strategy,
            beforeCount: strategyEffect.beforeMessages.length,
            afterCount: strategyEffect.afterMessages.length,
            beforeTokens: strategyEffect.beforeTokenCount,
            afterTokens: strategyEffect.afterTokenCount,
            savingsPercent,
            removedCount: strategyEffect.removedMessages.length,
            summaryContent: strategyEffect.summaryContent,
            degraded: strategyEffect.degraded,
            degradeReason: strategyEffect.degradeReason,
            summaryDuration: strategyEffect.summaryDuration,
            summarySourceCount: strategyEffect.summarySourceCount,
            summarySourceTokens: strategyEffect.summarySourceTokens,
            removedMessages: strategyEffect.removedMessages,
          } as StrategyEffectStepDetails,
        };
        addTimelineStep(strategyStep);
      } else {
        setStrategyEffect(null);
      }

      addMessage('assistant', agentResponse);
      saveCurrentSession();
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      addMessage('assistant', `抱歉，处理您的请求时出现错误: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 消息区域 */}
      <MessageList
        messages={conversationHistory}
        expandedBubble={expandedBubble}
        onToggleDetail={(index) => setExpandedBubble(expandedBubble === index ? null : index)}
      />

      {/* 输入区域 */}
      <div style={{
        background: 'var(--bg-base)', borderTop: '1px solid var(--border-subtle)',
        padding: '12px 20px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          {/* Scene selector */}
          <div ref={sceneRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setSceneOpen(!sceneOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '8px 10px', background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)', borderRadius: '8px',
                fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {scenes.find(s => s.id === currentScene)?.icon || '✏️'}{' '}
              {scenes.find(s => s.id === currentScene)?.name || '自定义'}
            </div>
            {sceneOpen && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: '6px',
                width: '180px', background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)', borderRadius: '8px',
                padding: '6px', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {scenes.map(scene => {
                  const isActive = currentScene === scene.id;
                  return (
                    <div
                      key={scene.id}
                      onClick={() => { setScene(scene.id); setSceneOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 8px', borderRadius: '5px', cursor: 'pointer',
                        transition: 'background 0.1s', fontSize: '14px',
                        color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: '16px' }}>{scene.icon}</span>
                      <span>{scene.name}</span>
                      {isActive && (
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--accent-blue)' }}>✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ToolSelectorBar />
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              disabled={isLoading}
              rows={1}
              style={{
                width: '100%', padding: '12px 48px 12px 14px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                borderRadius: '10px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)', fontSize: '15px',
                resize: 'none', outline: 'none', minHeight: '44px', maxHeight: '120px',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border-default)'; }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              style={{
                position: 'absolute', right: '6px', bottom: '6px',
                width: '34px', height: '34px',
                background: isLoading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
                border: 'none', borderRadius: '8px', color: 'white', cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatInteraction;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd context-lab && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Verify build succeeds**

```bash
cd context-lab && npm run build
```

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add context-lab/src/components/ChatInteraction.tsx && git commit -m "feat(RQ-021/T6): refactor ChatInteraction to use MessageList and MessageBubble"
```

---

### Task 7: Visual verification and style polish

**Files:**
- Potentially modify: `context-lab/src/components/MarkdownRenderer.tsx`
- Potentially modify: `context-lab/src/components/CodeBlock.tsx`

- [ ] **Step 1: Start dev server and verify rendering**

```bash
cd context-lab && npm run dev
```

Open http://localhost:5173, start a conversation, verify:
1. Assistant messages render with proper paragraphs (no wall of text)
2. Headings (## and ###) render with larger/bold text
3. **Bold** and *italic* text render correctly
4. `Inline code` has distinct background
5. Code blocks have dark background, language label, and copy button
6. Unordered and ordered lists render with proper indentation
7. Blockquotes have left border
8. User messages still display as plain text
9. Copy button shows "✓ 已复制" feedback then reverts

- [ ] **Step 2: Fix any visual issues found during verification**

Adjust styles in MarkdownRenderer.tsx or CodeBlock.tsx as needed.

- [ ] **Step 3: Final build verification**

```bash
cd context-lab && npm run build
```

Expected: build succeeds

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "feat(RQ-021/T7): polish markdown rendering styles"
```

import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { agentService } from '../services/agentService';
import ToolSelectorBar from './ToolSelectorBar';

interface ChatInteractionProps {
  initialMessage?: string;
}

function ChatInteraction({ initialMessage = '' }: ChatInteractionProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoSent = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMessage && !hasAutoSent.current) {
      hasAutoSent.current = true;
      setInput(initialMessage);
      handleSendWithInput(initialMessage);
    }
  }, [initialMessage]);

  const {
    systemPrompt,
    selectedTools,
    contextStrategy,
    currentScene,
    resetTimeline,
    updateTimelineStep,
    nextTimelineStep,
    setLastUserInput,
    addMessage,
    conversationHistory,
    addApiRequest,
    addApiResponse,
    saveCurrentSession,
  } = useAppStore();

  useEffect(() => {
    if (conversationHistory.length > 0 && messages.length === 0) {
      setMessages(
        conversationHistory.map(m =>
          m.role === 'user' ? `用户: ${m.content}` : `智能体: ${m.content}`
        )
      );
    }
  }, [conversationHistory]);

  const handleSend = async () => {
    handleSendWithInput(input);
  };

  const handleSendWithInput = async (text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      // 重置时间线
      resetTimeline();
      setLastUserInput(text);

      // 步骤 1: 用户输入 - 标记为已完成
      updateTimelineStep('user-input', `发送请求：${text}...`, false, true);

      // 添加用户消息
      const userMessage = `用户: ${text}`;

      setMessages(prev => [...prev, userMessage]);
      addMessage('user', text);
      saveCurrentSession();
      const currentInput = text;
      setInput('');
      setIsLoading(true);

      // 步骤 2: 上下文打包 - 先标记为进行中
      nextTimelineStep();
      updateTimelineStep('context-pack', `${currentScene} 场景，${selectedTools.length} 个工具可用，准备发送请求...`, true, false);

      console.log('Sending to agent...'); // 调试
      console.log('Env check:', {
        apiKey: import.meta.env.VITE_CLAUDE_API_KEY ? 'set' : 'not set',
        baseURL: import.meta.env.VITE_CLAUDE_BASE_URL,
        model: import.meta.env.VITE_CLAUDE_MODEL
      });

      // 初始化 Agent SDK（如果尚未初始化）
      if (!agentService.isAgentInitialized()) {
        const config = {
          apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
          baseURL: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
          model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
        };

        console.log('Initializing agent with config:', { ...config, apiKey: '***' });
        await agentService.initialize(config);
      }

      // 每次发送前都注入 API 记录方法
      agentService.setApiRecordingMethods(addApiRequest, addApiResponse);

      // 步骤 2: 上下文打包 - 标记为已完成
      updateTimelineStep('context-pack', `${currentScene} 场景，${selectedTools.length} 个工具可用，准备发送请求...`, false, true);

      // 步骤 3: 工具调用 - 标记为进行中
      nextTimelineStep();
      updateTimelineStep('tool-call', selectedTools.length > 0
        ? `准备调用工具：${selectedTools.join(', ')}`
        : '没有工具需要调用，直接响应...', true, false);

      // 发送消息到 Claude Agent（直接使用，不使用模拟 fallback）
      const agentResponse = await agentService.sendMessage(
        currentInput,
        systemPrompt,
        selectedTools,
        contextStrategy
      );

      // 步骤 3: 工具调用 - 标记为已完成
      updateTimelineStep('tool-call', selectedTools.length > 0
        ? `工具调用完成：${selectedTools.join(', ')}`
        : '没有工具需要调用，直接响应...', false, true);

      // 步骤 4: 结果打包 - 标记为进行中
      nextTimelineStep();
      updateTimelineStep('result-pack', '准备将工具结果重新发送给大模型...', true, false);

      // 延迟一段时间让用户看到这个步骤
      await new Promise(resolve => setTimeout(resolve, 300));

      // 步骤 4: 结果打包 - 标记为已完成
      updateTimelineStep('result-pack', '工具结果已准备，准备组织上下文...', false, true);

      // 步骤 5: 重新组织上下文报文 - 标记为进行中
      nextTimelineStep();
      updateTimelineStep('api-reorganize', '工具结果已整合，重新组织上下文报文...', true, false);

      // 延迟一段时间让用户看到这个步骤
      await new Promise(resolve => setTimeout(resolve, 500));

      // 步骤 5: 重新组织上下文报文 - 标记为已完成
      updateTimelineStep('api-reorganize', '上下文报文已准备完成，发送给大模型...', false, true);

      // 步骤 6: 智能体响应 - 标记为进行中
      nextTimelineStep();
      updateTimelineStep('agent-response', '等待大模型响应...', true, false);

      // 延迟一段时间
      await new Promise(resolve => setTimeout(resolve, 300));

      // 步骤 6: 智能体响应 - 标记为已完成
      updateTimelineStep('agent-response', '收到大模型响应，处理完成！', false, true);

      // 添加智能体响应
      const formattedResponse = `智能体: ${agentResponse}`;
      console.log('Adding agent response:', formattedResponse); // 调试

      setMessages(prev => [...prev, formattedResponse]);
      addMessage('assistant', agentResponse); // 记录到 store
      saveCurrentSession();
    } catch (error) {
      console.error('Error in handleSend:', error);
      const errorMsg = (error as Error).message || String(error);
      setMessages(prev => [...prev, `智能体: 抱歉，处理您的请求时出现错误: ${errorMsg}`]);
      // 标记当前步骤为完成
      updateTimelineStep('agent-response', `处理失败: ${errorMsg}`, false, false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('Enter key pressed, sending...');
      handleSend();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 消息区域 */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'transparent'
      }}>
        {messages.length === 0 ? (
          <div style={{
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            padding: '32px 0',
            fontSize: '14px'
          }}>
            开始对话来体验上下文管理！
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.startsWith('用户:');
            const content = msg.replace(/^(用户|智能体):\s*/, '');

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  gap: '8px',
                  animation: 'msgIn 0.3s ease-out'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                  flexShrink: 0,
                  ...(isUser
                    ? { background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))', color: '#fff' }
                    : { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' })
                }}>
                  {isUser ? 'U' : 'A'}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  fontSize: '13px',
                  lineHeight: 1.5,
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
                  {content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div style={{
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '12px 20px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
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
                fontFamily: 'var(--font-display)', fontSize: '13px',
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

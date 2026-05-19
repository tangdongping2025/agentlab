import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, type TimelineStep, type StrategyEffectStepDetails } from '../stores/appStore';
import { agentService } from '../services/agentService';
import ToolSelectorBar from './ToolSelectorBar';
import MessageList from './MessageList';
import type { FileAttachment } from '../types';
import { truncateResult, MAX_DISPLAY_RESULT_SIZE } from '../utils/truncator';
import * as jschardet from 'jschardet';

interface ChatInteractionProps {
  initialMessage?: string;
}

let stepCounter = 0;
function nextStepId() { return `step-${Date.now()}-${++stepCounter}`; }

function ChatInteraction({ initialMessage = '' }: ChatInteractionProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const hasAutoSent = useRef(false);
  const streamBufferRef = useRef('');
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [expandedBubble, setExpandedBubble] = useState<number | null>(null);
  const [sceneOpen, setSceneOpen] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

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
    updateStreamingMessage,
    clearStreamingMessage,
    setLastAssistantMessage,
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
    // 如果既没有文本也没有文件，不发送
    if (!text.trim() && !selectedFile) {
      return;
    }

    let fileAttachment: FileAttachment | null = null;
    if (selectedFile) {
      fileAttachment = await convertFileToBase64(selectedFile);
    }

    const messageText = text.trim() || (fileAttachment ? fileAttachment.name : '');

    try {
      resetTimeline();
      setLastUserInput(messageText);
      setIsLoading(true);

      // 用户输入步骤
      const userInputStep: TimelineStep = {
        id: nextStepId(),
        type: text.trim() ? 'user-input' : 'file-upload',
        icon: text.trim() ? '💬' : '📎',
        title: text.trim() ? '用户输入' : '文件上传',
        description: text.trim()
          ? `发送请求：${text.slice(0, 50)}...`
          : `发送文件：${fileAttachment?.name}`,
        active: false,
        completed: true,
        expandable: true,
        expanded: false,
        details: {
          type: text.trim() ? 'user-input' : 'file-upload',
          text: messageText,
          tokenCount: Math.ceil((text.length + (fileAttachment?.content.length || 0)) / 4),
          conversationTurns: conversationHistory.filter(m => m.role === 'user').length + 1,
          fileName: fileAttachment?.name,
          fileSize: fileAttachment?.size,
        },
      };
      addTimelineStep(userInputStep);

      // 初始化 agent
      if (!agentService.isAgentInitialized()) {
        const config = {
          apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
          baseURL: import.meta.env.VITE_CLAUDE_BASE_URL || 'https://api.anthropic.com',
          model: import.meta.env.VITE_CLAUDE_MODEL || 'claude-3-5-sonnet-20240620'
        };
        agentService.initialize(config);
      }

      // Inject API recording methods
      agentService.setApiRecordingMethods(addApiRequest, addApiResponse);

      // 将文件信息添加到消息中
      if (fileAttachment) {
        addMessage('user', text, [fileAttachment]);
      } else {
        addMessage('user', text);
      }
      saveCurrentSession();

      // 设置回调
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
        onToolResultReady: (toolName, result) => {
          const state = useAppStore.getState();
          const toolStep = [...state.timelineSteps].reverse().find(s => s.type === 'tool-call' && s.toolCallName === toolName && s.active);
          const truncatedResult = typeof result === 'string'
            ? truncateResult(result, MAX_DISPLAY_RESULT_SIZE)
            : truncateResult(JSON.stringify(result), MAX_DISPLAY_RESULT_SIZE);
          const resultSummary = truncatedResult.slice(0, 200);
          const isToolError = typeof result === 'string' && result.includes('"error"');
          if (toolStep) {
            updateTimelineStepData(toolStep.id, {
              icon: isToolError ? '⏱' : '🔧',
              description: isToolError ? `${toolName} — 请求超时` : `调用 ${toolName}`,
              details: {
                type: 'tool-call',
                toolName,
                toolDescription: (toolStep.details as any)?.toolDescription || '',
                parameters: (toolStep.details as any)?.parameters || {},
                reasoning: (toolStep.details as any)?.reasoning || '',
                result: truncatedResult,
                resultSummary,
              },
            });
            completeTimelineStep(toolStep.id);
          }
        },
        onStreamToken: (text) => {
          streamBufferRef.current += text;
          if (!streamTimerRef.current) {
            streamTimerRef.current = setInterval(() => {
              if (streamBufferRef.current) {
                updateStreamingMessage(streamBufferRef.current);
                streamBufferRef.current = '';
              }
            }, 50);
          }
        },
        onStreamEnd: () => {
          if (streamTimerRef.current) {
            clearInterval(streamTimerRef.current);
            streamTimerRef.current = null;
          }
          if (streamBufferRef.current) {
            updateStreamingMessage(streamBufferRef.current);
            streamBufferRef.current = '';
          }
          clearStreamingMessage();
        },
        onAgentResponse: (text, tokenUsage, toolsUsed, apiCallCount) => {
          // 非流式模式时文本不走 onStreamToken，需要手动更新最后一条消息
          // onStreamEnd 在 onAgentResponse 之前调用，此时 streamingMessageId 已为 null
          // 所以需要通过 setLastAssistantMessage 直接写入
          if (text && !streamBufferRef.current) {
            setLastAssistantMessage(text);
          }
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

      // 注入当前日期到 systemPrompt
      const now = new Date();
      const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日${['日','一','二','三','四','五','六'][now.getDay()]}`;
      const effectiveSystemPrompt = `[当前时间] 今天是${dateStr}。\n\n${systemPrompt}`;

      // 发送消息
      addMessage('assistant', '');
      const agentResponse = await agentService.sendMessage(
        messageText,
        effectiveSystemPrompt,
        selectedTools,
        contextStrategy,
        fileAttachment ? [fileAttachment] : undefined
      );

      // 发送后清理文件选择
      handleRemoveFile();

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

      saveCurrentSession();
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      addMessage('assistant', `抱歉，处理您的请求时出现错误: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setInput('');
    }
  };

  const handleStop = () => {
    agentService.abort();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('文件大小不能超过 5MB');
        return;
      }
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    }
  };

  const handleRemoveFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    setSelectedFile(null);
  };

  const convertFileToBase64 = (file: File): Promise<FileAttachment> => {
    return new Promise((resolve, reject) => {
      // 首先读取文本内容
      const textReader = new FileReader();
      textReader.onload = (e) => {
        const textContent = e.target?.result as string;

        // 然后读取 base64 用于预览
        const base64Reader = new FileReader();
        base64Reader.onload = (base64Event) => {
          const dataURL = base64Event.target?.result as string;

          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            url: dataURL,
            content: textContent,
            encoding: 'UTF-8'
          });
        };
        base64Reader.onerror = reject;
        base64Reader.readAsDataURL(file);
      };
      textReader.onerror = reject;
      textReader.readAsText(file);
    });
  };

  const isSendButtonEnabled = input.trim() || selectedFile;

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
          {/* File attachment */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '8px 10px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)', borderRadius: '8px',
            fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
            📎
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={isLoading}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.txt,.doc,.docx,.csv,.md,.markdown"
            />
          </label>
          {selectedFile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 8px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              fontSize: '13px', color: 'var(--text-secondary)',
            }}>
              {selectedFile.name.slice(0, 15)}{selectedFile.name.length > 15 ? '...' : ''}
              <button
                onClick={handleRemoveFile}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-tertiary)',
                  cursor: 'pointer', padding: '0 4px', fontSize: '16px',
                }}
              >
                ×
              </button>
            </div>
          )}

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
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && !isSendButtonEnabled}
              style={{
                position: 'absolute', right: '6px', bottom: '6px',
                width: '34px', height: '34px',
                background: isLoading
                  ? '#e53e3e'
                  : 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
                border: 'none', borderRadius: '8px', color: 'white',
                cursor: isLoading ? 'pointer' : (!isSendButtonEnabled ? 'not-allowed' : 'pointer'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
            >
              {isLoading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatInteraction;

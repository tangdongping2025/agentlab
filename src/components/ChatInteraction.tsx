import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { agentService } from '../services/agentService';

function ChatInteraction() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    addApiResponse
  } = useAppStore();

  const handleSend = async () => {
    console.log('handleSend called'); // 调试
    if (!input.trim()) {
      console.log('Input is empty, skipping'); // 调试
      return;
    }

    try {
      // 重置时间线
      resetTimeline();
      setLastUserInput(input);

      // 步骤 1: 用户输入 - 标记为已完成
      updateTimelineStep('user-input', `发送请求：${input}...`, false, true);

      // 添加用户消息
      const userMessage = `用户: ${input}`;
      console.log('Adding user message:', userMessage); // 调试

      setMessages(prev => [...prev, userMessage]);
      addMessage('user', input); // 记录到 store
      const currentInput = input;
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

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold text-gray-900">对话交互</div>

      {/* 消息区域 */}
      <div className="bg-gray-50 p-4 rounded-lg min-h-[150px] max-h-[300px] overflow-y-auto space-y-2">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            开始对话来体验上下文管理！
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="text-sm text-gray-700">
              {msg}
            </div>
          ))
        )}
      </div>

      {/* 输入区域 */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            console.log('Input change:', value); // 调试
            setInput(value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入您的请求..."
          className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={2}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>处理中...</span>
            </>
          ) : (
            <>
              <span>发送</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default ChatInteraction;
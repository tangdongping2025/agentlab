// src/components/ContextVisualizer.tsx
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { TokenService } from '../services/tokenService';
import { formatNumber, formatTokenCount } from '../utils/formatters';
import DetailModal from './DetailModal';

const tokenService = new TokenService();

function ContextVisualizer() {
  const { systemPrompt, contextSize, lastUserInput, conversationHistory, apiInteractions } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  // 获取用户输入（如果没有新输入，则使用最后一条消息）
  const userInput = lastUserInput || (conversationHistory || [])
    .filter(msg => msg.role === 'user')
    .pop()?.content || '我需要预订明天晚上的餐厅...';

  // 获取对话历史（不包括当前输入的消息）
  const history = (conversationHistory || [])
    .filter(msg => {
      // 排除最后一条用户消息（因为已经在 userInput 中显示了）
      if (msg.role === 'user' && msg.content === userInput) {
        return false;
      }
      return true;
    })
    .map(msg => `${msg.role === 'user' ? '用户' : '智能体'}: ${msg.content}`);

  // 计算Token使用
  const systemTokens = tokenService.calculate(systemPrompt);
  const userTokens = tokenService.calculate(userInput);
  const historyTokens = history.reduce((sum, message) => sum + tokenService.calculate(message), 0);
  const totalTokens = systemTokens + userTokens + historyTokens;

  const usagePercentage = Math.min((totalTokens / contextSize) * 100, 100);

  // 显示系统提示词详情
  const openSystemPromptModal = () => {
    setModalTitle('系统提示词');
    setModalContent(systemPrompt);
    setModalOpen(true);
  };

  // 显示用户提示词详情
  const openUserPromptModal = () => {
    setModalTitle('用户提示词');
    setModalContent(userInput);
    setModalOpen(true);
  };

  // 显示对话历史详情
  const openHistoryModal = () => {
    setModalTitle('对话历史');
    setModalContent(history.join('\n\n'));
    setModalOpen(true);
  };

  // 显示 API 请求详情
  const openApiRequestModal = (interactionId: string) => {
    const interaction = apiInteractions.find(i => i.id === interactionId);
    if (!interaction) return;

    const requestContent = `请求 URL: ${interaction.request.url}

请求头:
${Object.entries(interaction.request.headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}

请求体:
${JSON.stringify(JSON.parse(interaction.request.body), null, 2)}`;

    setModalTitle('API 请求报文');
    setModalContent(requestContent);
    setModalOpen(true);
  };

  // 显示 API 响应详情
  const openApiResponseModal = (interactionId: string) => {
    const interaction = apiInteractions.find(i => i.id === interactionId);
    if (!interaction || !interaction.response) return;

    const responseContent = `响应状态: ${interaction.response.status}
响应时间: ${interaction.response.duration}ms

响应头:
${Object.entries(interaction.response.headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}

响应体:
${JSON.stringify(JSON.parse(interaction.response.body), null, 2)}`;

    setModalTitle('API 响应报文');
    setModalContent(responseContent);
    setModalOpen(true);
  };

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">上下文窗口</h2>

      <div className="space-y-4">
        {/* Token使用统计 */}
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-900">Token使用情况</span>
            <span className="text-sm text-blue-900">
              {formatNumber(totalTokens)} / {formatNumber(contextSize)} ({usagePercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${usagePercentage}%` }}
            ></div>
          </div>
        </div>

        {/* 系统提示词 */}
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-green-900">系统提示词</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600">{formatTokenCount(systemTokens)} tokens</span>
              <button
                onClick={openSystemPromptModal}
                className="text-xs text-green-700 hover:text-green-900 underline"
              >
                查看详情
              </button>
            </div>
          </div>
          <div className="text-sm text-green-800 line-clamp-3">
            {systemPrompt}
          </div>
        </div>

        {/* 用户提示词 */}
        <div className="bg-yellow-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-yellow-900">用户提示词</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-600">{formatTokenCount(userTokens)} tokens</span>
              <button
                onClick={openUserPromptModal}
                className="text-xs text-yellow-700 hover:text-yellow-900 underline"
              >
                查看详情
              </button>
            </div>
          </div>
          <div className="text-sm text-yellow-800">
            {userInput}
          </div>
        </div>

        {/* 对话历史 */}
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-purple-900">对话历史</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-600">{formatTokenCount(historyTokens)} tokens</span>
              <button
                onClick={openHistoryModal}
                className="text-xs text-purple-700 hover:text-purple-900 underline"
              >
                查看详情
              </button>
            </div>
          </div>
          <div className="text-sm text-purple-800 space-y-1">
            {history.slice(0, 3).map((message, index) => (
              <div key={index} className="line-clamp-1">{message}</div>
            ))}
            {history.length > 3 && (
              <div className="text-xs italic text-purple-600">
                + {history.length - 3} 条历史消息
              </div>
            )}
          </div>
        </div>

        {/* API 交互记录 */}
        {apiInteractions.length > 0 && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-900">API 交互记录</h3>
            </div>
            <div className="space-y-2">
              {apiInteractions.slice(-3).map((interaction) => (
                <div key={interaction.id} className="bg-white p-2 rounded border border-gray-200">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      {interaction.timestamp.toLocaleTimeString()}
                    </span>
                    {interaction.response && (
                      <span className={`text-xs px-2 py-0.5 rounded ${interaction.response.status >= 200 && interaction.response.status < 300 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {interaction.response.status} ({interaction.response.duration}ms)
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openApiRequestModal(interaction.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      查看请求
                    </button>
                    {interaction.response && (
                      <button
                        onClick={() => openApiResponseModal(interaction.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        查看响应
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        content={modalContent}
      />
    </section>
  );
}

export default ContextVisualizer;

import React from 'react';
import './App.css';
import SceneSelector from './components/SceneSelector';
import StrategySelector from './components/StrategySelector';
import ContextSizeSlider from './components/ContextSizeSlider';
import PromptEditor from './components/PromptEditor';
import ContextWindowVisualizer from './components/ContextWindowVisualizer';
import ToolSelector from './components/ToolSelector';
import ProcessTimeline from './components/ProcessTimeline';
import ChatInteraction from './components/ChatInteraction';
import ConnectionStatus from './components/ConnectionStatus';
import EnvConfig from './components/EnvConfig';
import { useAppStore } from './stores/appStore';

const App: React.FC = () => {
  const {
    currentScene,
    systemPrompt,
    setSystemPrompt,
    saveUserConfig,
    resetPromptForScene
  } = useAppStore();

  const isCustom = currentScene === 'custom';

  return (
    <div className="app min-h-screen bg-gray-50">
      {/* 顶部导航区 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Context Lab</h1>
                <p className="text-sm text-gray-600 mt-0.5">智能体上下文管理实验平台</p>
              </div>
              <ConnectionStatus />
            </div>
            <EnvConfig />
          </div>
        </div>

      </header>

      {/* 顶部配置区 */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <SceneSelector />
            </div>
            <div>
              <StrategySelector />
            </div>
            <div>
              <ContextSizeSlider />
            </div>
          </div>
        </div>
      </section>

      {/* 系统提示词编辑区 */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <PromptEditor
            isCustom={isCustom}
            initialPrompt={systemPrompt}
            onPromptChange={setSystemPrompt}
            onSave={saveUserConfig}
            onReset={() => resetPromptForScene(currentScene)}
          />
        </div>
      </section>

      {/* 可用工具配置区 */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <ToolSelector />
        </div>
      </section>

      {/* 主内容区 - 左侧对话交互，右侧上下文可视化 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧面板 - 对话交互 */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <ChatInteraction />
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <ProcessTimeline />
            </div>
          </div>

          {/* 右侧面板 - 新的上下文可视化 */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <ContextWindowVisualizer />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
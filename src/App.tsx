import React from 'react';
import './App.css';
import SceneSelector from './components/SceneSelector';
import StrategySelector from './components/StrategySelector';
import ContextSizeSlider from './components/ContextSizeSlider';
import PromptEditor from './components/PromptEditor';
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
    <div className="app max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Context Lab</h1>
      <p className="mb-6 text-gray-600">智能体上下文管理实验平台</p>

      <SceneSelector />
      <StrategySelector />
      <ContextSizeSlider />

      <PromptEditor
        isCustom={isCustom}
        initialPrompt={systemPrompt}
        onPromptChange={setSystemPrompt}
        onSave={saveUserConfig}
        onReset={() => resetPromptForScene(currentScene)}
      />
    </div>
  );
};

export default App;
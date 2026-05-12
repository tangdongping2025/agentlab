import React from 'react';
import './App.css';
import SceneSelector from './components/SceneSelector';

const App: React.FC = () => {
  return (
    <div className="app">
      <h1>Context Lab</h1>
      <p>智能体上下文管理实验平台</p>
      <SceneSelector />
    </div>
  );
};

export default App;
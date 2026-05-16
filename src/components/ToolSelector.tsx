// src/components/ToolSelector.tsx
import { useAppStore } from '../stores/appStore';
import { useState } from 'react';

function ToolSelector() {
  const { selectedTools, toggleTool, availableTools, selectAllTools, clearAllTools } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSelectAll = () => {
    selectAllTools();
  };

  const handleClearAll = () => {
    clearAllTools();
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">工具配置</h2>
          <div className="text-sm text-slate-400">
            ({selectedTools.length} 个工具)
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          aria-label={isExpanded ? "收起工具配置" : "展开工具配置"}
        >
          {isExpanded ? (
            <span className="text-lg">▼</span>
          ) : (
            <span className="text-lg">▶</span>
          )}
        </button>
      </div>

      {/* 工具配置区域 - 收缩/展开逻辑 */}
      {isExpanded ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors"
              >
                全选
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors"
              >
                清除
              </button>
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableTools.map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-700/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTools.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="mt-1 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-700"
                    aria-label={tool.name}
                  />
                  <div>
                    <div className="font-medium text-slate-200">{tool.name}</div>
                    <div className="text-sm text-slate-400">{tool.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-slate-800/50 p-4 rounded-lg text-center text-slate-400">
          <p>点击 ▶ 查看工具配置 ({selectedTools.length} 个工具)</p>
        </div>
      )}
    </div>
  );
}

export default ToolSelector;

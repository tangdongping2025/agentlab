// src/components/ToolSelector.tsx
import { useAppStore } from '../stores/appStore';

function ToolSelector() {
  const { selectedTools, toggleTool, availableTools, selectAllTools, clearAllTools } = useAppStore();

  const handleSelectAll = () => {
    selectAllTools();
  };

  const handleClearAll = () => {
    clearAllTools();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">工具配置</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            全选
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            清除
          </button>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {availableTools.map((tool) => (
            <label
              key={tool.id}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedTools.includes(tool.id)}
                onChange={() => toggleTool(tool.id)}
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                aria-label={tool.name}
              />
              <div>
                <div className="font-medium text-gray-900">{tool.name}</div>
                <div className="text-sm text-gray-500">{tool.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ToolSelector;

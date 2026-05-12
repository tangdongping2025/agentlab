// src/components/StrategySelector.tsx
import { useAppStore } from '../stores/appStore';

const strategies = [
  { value: 'sliding', label: '滑动窗口' },
  { value: 'full', label: '完整记忆' },
  { value: 'summary', label: '摘要记忆' },
  { value: 'none', label: '无记忆' }
];

function StrategySelector() {
  const { contextStrategy, setStrategy } = useAppStore();

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStrategy(e.target.value as any);
  };

  return (
    <div className="mb-4">
      <label htmlFor="strategy-select" className="block text-sm font-medium text-gray-700 mb-2">
        上下文策略
      </label>
      <select
        id="strategy-select"
        value={contextStrategy}
        onChange={handleStrategyChange}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {strategies.map(strategy => (
          <option key={strategy.value} value={strategy.value}>
            {strategy.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default StrategySelector;
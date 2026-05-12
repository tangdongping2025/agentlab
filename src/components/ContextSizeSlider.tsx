import { useAppStore } from '../stores/appStore';
import { formatNumber } from '../utils/formatters';

function ContextSizeSlider() {
  const { contextSize, setContextSize } = useAppStore();

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    setContextSize(newValue);
  };

  return (
    <div className="mb-4">
      <label htmlFor="context-size-slider" className="block text-sm font-medium text-gray-700 mb-2">
        上下文大小
      </label>
      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-600 w-12 text-right">{formatNumber(1024)}</span>
        <input
          id="context-size-slider"
          type="range"
          min="1024"
          max="1048576"
          step="1024"
          value={contextSize}
          onChange={handleSliderChange}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm text-gray-600 w-16 text-left">{formatNumber(contextSize)}</span>
        <span className="text-sm text-gray-600 w-16">{formatNumber(1048576)}</span>
      </div>
    </div>
  );
}

export default ContextSizeSlider;

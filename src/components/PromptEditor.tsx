import React, { useState, useMemo, useEffect } from 'react';
import { TokenService } from '../services/tokenService';

const tokenService = new TokenService();

interface PromptEditorProps {
  isCustom: boolean;
  initialPrompt: string;
  onPromptChange: (prompt: string) => void;
  onSave: () => void;
  onReset: () => void;
}

export default function PromptEditor({
  isCustom,
  initialPrompt,
  onPromptChange,
  onSave,
  onReset
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const tokenCount = useMemo(() => tokenService.calculate(prompt), [prompt]);

  // Sync with external prop changes
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setPrompt(newValue);
    onPromptChange(newValue);
  };

  const handleReset = () => {
    setPrompt(initialPrompt);
    onPromptChange(initialPrompt);
    onReset();
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="system-prompt" className="block text-sm font-medium text-gray-700">
          系统提示词
        </label>
        <div className="text-sm text-gray-500">
          {tokenCount} tokens
        </div>
      </div>

      <textarea
        id="system-prompt"
        value={prompt}
        onChange={handleChange}
        disabled={!isCustom}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
        rows={6}
        placeholder="请输入系统提示词..."
      />

      <div className="flex gap-2 mt-2">
        {isCustom ? (
          <>
            <button
              onClick={onSave}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              保存
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              恢复默认
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-500">
            预设场景提示词不可编辑
          </span>
        )}
      </div>
    </div>
  );
}

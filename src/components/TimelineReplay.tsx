import React, { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

interface TimelineStep {
  id: string;
  icon: string;
  label: string;
  description: string;
}

const defaultSteps: TimelineStep[] = [
  { id: 'init', icon: '📄', label: '系统初始化', description: '加载配置和初始状态' },
  { id: 'user-greet', icon: '💬', label: '用户问候', description: '用户发送第一条消息' },
  { id: 'assistant-response', icon: '🤖', label: '助手响应', description: 'AI生成第一条回复' },
  { id: 'user-request', icon: '💬', label: '用户请求', description: '用户发送具体需求' },
  { id: 'tool-call', icon: '🔧', label: '工具调用', description: 'AI调用相关工具' },
  { id: 'final-response', icon: '🤖', label: '最终响应', description: 'AI给出完整回答' }
];

function TimelineReplay() {
  const {
    conversationHistory,
    timelineReplayIndex,
    isTimelinePlaying,
    timelineSpeed,
    setTimelineReplayIndex,
    toggleTimelinePlaying
  } = useAppStore();

  // Generate dynamic steps based on actual conversation history
  const getSteps = (): TimelineStep[] => {
    if (conversationHistory.length === 0) {
      return defaultSteps;
    }

    const steps: TimelineStep[] = [
      { id: 'init', icon: '📄', label: '系统初始化', description: '配置加载完成' }
    ];

    conversationHistory.forEach((msg, index) => {
      steps.push({
        id: `msg-${index}`,
        icon: msg.role === 'user' ? '💬' : '🤖',
        label: msg.role === 'user' ? '用户消息' : '助手响应',
        description: msg.content.substring(0, 30) + '...'
      });
    });

    return steps;
  };

  const steps = getSteps();
  const currentStep = Math.min(timelineReplayIndex, steps.length - 1);

  // Auto-play effect
  useEffect(() => {
    if (!isTimelinePlaying) return;

    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        setTimelineReplayIndex(currentStep + 1);
      } else {
        toggleTimelinePlaying();
      }
    }, timelineSpeed);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, currentStep, steps.length, setTimelineReplayIndex, toggleTimelinePlaying, timelineSpeed]);

  const handleStepClick = (index: number) => {
    setTimelineReplayIndex(index);
  };

  const goToStart = useCallback(() => {
    setTimelineReplayIndex(0);
  }, [setTimelineReplayIndex]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setTimelineReplayIndex(currentStep - 1);
    }
  }, [currentStep, setTimelineReplayIndex]);

  const goForward = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setTimelineReplayIndex(currentStep + 1);
    }
  }, [currentStep, steps.length, setTimelineReplayIndex]);

  const progressPercent = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">⏱️</span>
        <h3 className="text-sm font-bold text-slate-800">时间轴回放</h3>
      </div>

      {/* Timeline Steps */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex-shrink-0 w-24 p-2 rounded-lg border-2 cursor-pointer transition-all hover:shadow-sm ${
              index <= currentStep
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300'
                : 'bg-white border-slate-200'
            } ${index === currentStep ? 'ring-2 ring-blue-400' : ''}`}
            onClick={() => handleStepClick(index)}
          >
            <div className="text-center">
              <div className="text-xl mb-1">{step.icon}</div>
              <div className="text-xs font-bold text-slate-700 truncate">{step.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Step Description */}
      {steps[currentStep] && (
        <div className="bg-white rounded-lg p-3 mb-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{steps[currentStep].icon}</span>
            <span className="text-sm font-bold text-slate-800">{steps[currentStep].label}</span>
          </div>
          <div className="text-xs text-slate-600">{steps[currentStep].description}</div>
        </div>
      )}

      {/* Playback Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={goToStart}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="回到开始"
        >
          ⏮️
        </button>
        <button
          onClick={goBack}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="后退一步"
        >
          ◀️
        </button>
        <div className="flex-1">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <button
          onClick={goForward}
          className="p-2 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
          title="前进一步"
        >
          ▶️
        </button>
        <button
          onClick={toggleTimelinePlaying}
          className={`p-2 rounded-lg border transition-all ${
            isTimelinePlaying
              ? 'bg-gradient-to-r from-amber-100 to-orange-100 border-amber-400 text-amber-700'
              : 'bg-gradient-to-r from-blue-500 to-violet-500 border-blue-500 text-white'
          }`}
          title={isTimelinePlaying ? '暂停' : '自动播放'}
        >
          {isTimelinePlaying ? '⏸️' : '⏯️'}
        </button>
      </div>

      {/* Step Counter */}
      <div className="mt-3 text-center text-xs text-slate-500">
        第 {currentStep + 1} 步 / 共 {steps.length} 步
      </div>
    </div>
  );
}

export default TimelineReplay;

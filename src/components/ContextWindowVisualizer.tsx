import React from 'react';
import TokenAllocation from './TokenAllocation';
import ContextStructureTree from './ContextStructureTree';
import StrategyComparator from './StrategyComparator';
import TimelineReplay from './TimelineReplay';
import DetailPanel from './DetailPanel';

function ContextWindowVisualizer() {
  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h2 className="text-lg font-bold">上下文窗口可视化学习</h2>
              <p className="text-sm text-slate-400 mt-1">
                渐进式学习：了解 AI 上下文窗口的组成、分配和管理策略
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 bg-gradient-to-r from-pink-500 to-violet-500 rounded-full font-bold">
            ✨ 新增功能
          </span>
        </div>
      </div>

      {/* Top Row: Token + Structure + Strategy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TokenAllocation />
        <ContextStructureTree />
        <StrategyComparator />
      </div>

      {/* Bottom Row: Timeline */}
      <TimelineReplay />

      {/* Detail Panel */}
      <DetailPanel />
    </section>
  );
}

export default ContextWindowVisualizer;

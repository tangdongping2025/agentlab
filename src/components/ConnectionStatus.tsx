// src/components/ConnectionStatus.tsx
import React from 'react';

function ConnectionStatus() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-gray-700">已连接</span>
      </div>
    </div>
  );
}

export default ConnectionStatus;

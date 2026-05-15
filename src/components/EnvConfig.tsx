// src/components/EnvConfig.tsx
import React from 'react';

function EnvConfig() {
  const envInfo = {
    baseURL: "https://api.anthropic.com",
    model: "Claude 3.5 Sonnet",
    contextSize: "32k tokens"
  };

  return (
    <div className="flex items-center gap-4 text-xs text-gray-600">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">Base URL:</span>
        <span>{envInfo.baseURL}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">Model:</span>
        <span>{envInfo.model}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">Context:</span>
        <span>{envInfo.contextSize}</span>
      </div>
    </div>
  );
}

export default EnvConfig;

import React, { useState } from 'react';
import type { AgentError } from '../../services/agentRuntimeApi';

export const ErrorBubble: React.FC<{ error: AgentError }> = ({ error }) => {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="error-bubble" style={{ borderLeft: '3px solid #B42318', background: '#FEF3F2', padding: '10px 14px', borderRadius: 8 }}>
      <div style={{ color: '#B42318', fontWeight: 700, fontSize: 14 }}>{error.message}</div>
      {error.detail && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{ marginTop: 6, fontSize: 12, background: 'transparent', border: 'none', color: '#B42318', cursor: 'pointer', padding: 0 }}
        >
          {open ? '隐藏技术详情' : '查看技术详情'}
        </button>
      )}
      {open && error.detail && (
        <pre data-testid="error-detail" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#7A271A', fontSize: 11 }}>
          {error.detail}
        </pre>
      )}
    </div>
  );
};

export default ErrorBubble;

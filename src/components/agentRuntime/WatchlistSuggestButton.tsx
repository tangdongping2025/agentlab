import React, { useState } from 'react';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const containerStyle: React.CSSProperties = {
  margin: '4px 20px 8px',
  padding: '8px 12px',
  borderRadius: 10,
  background: '#FFFDF9',
  border: '1px solid #E5DCC9',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
};

const WatchlistSuggestButton: React.FC = () => {
  const suggestion = useAgentRuntimeStore(s => s.pendingWatchlistSuggestion);
  const pinWatchlist = useAgentRuntimeStore(s => s.pinWatchlist);
  const unpinWatchlist = useAgentRuntimeStore(s => s.unpinWatchlist);
  const [busy, setBusy] = useState(false);

  if (!suggestion) return null;
  const { ts_code, name, already_pinned } = suggestion;

  const handlePin = async () => {
    setBusy(true);
    await pinWatchlist(ts_code, name);
    setBusy(false);
  };
  const handleUnpin = async () => {
    setBusy(true);
    await unpinWatchlist(ts_code);
    setBusy(false);
  };

  if (already_pinned) {
    return (
      <div style={containerStyle} data-testid="watchlist-suggest">
        <span style={{ color: 'var(--text-secondary, #6b6155)' }}>✓ 已自选 {name}({ts_code})</span>
        <button
          onClick={handleUnpin}
          disabled={busy}
          data-testid="watchlist-unpin-btn"
          style={{
            border: 'none', background: 'transparent', color: 'var(--accent-red, #d9534f)',
            cursor: busy ? 'wait' : 'pointer', fontSize: 12, padding: '2px 6px', textDecoration: 'underline',
          }}
        >
          移除
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle} data-testid="watchlist-suggest">
      <button
        onClick={handlePin}
        disabled={busy}
        data-testid="watchlist-pin-btn"
        style={{
          border: '1px solid var(--accent-blue, #2b6cb0)', background: 'var(--accent-blue, #2b6cb0)',
          color: '#fff', borderRadius: 16, padding: '5px 14px', fontSize: 13, cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '加入中…' : `📈 加入自选 ${name}(${ts_code})`}
      </button>
    </div>
  );
};

export default WatchlistSuggestButton;

import React from 'react';

const StockDetailPanel: React.FC<{ ts_code: string }> = ({ ts_code }) => (
  <div style={{ padding: 16 }} data-testid="stock-detail-panel">{ts_code}</div>
);

export default StockDetailPanel;

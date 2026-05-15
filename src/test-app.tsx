// 测试文件 - 用于确认 React 能正常工作
import React from 'react';

function TestApp() {
  return (
    <div style={{
      padding: '20px',
      background: 'lightblue',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>Test App</h1>
      <p>React 正在工作！</p>
      <p>当前时间: {new Date().toLocaleString()}</p>
    </div>
  );
}

export default TestApp;

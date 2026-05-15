import React from 'react';

function SimpleApp() {
  console.log('SimpleApp mounted!');

  return (
    <div style={{
      padding: '40px',
      fontFamily: 'Arial, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      color: 'white'
    }}>
      <h1>🚀 Context Lab is Working!</h1>
      <h2>Smart Agent Management Platform</h2>
      <p>Current server time: {new Date().toLocaleString()}</p>

      <div style={{
        background: 'rgba(255,255,255,0.2)',
        padding: '20px',
        borderRadius: '10px',
        marginTop: '20px'
      }}>
        <h3>✅ Everything Working!</h3>
        <ul>
          <li>React: OK</li>
          <li>TypeScript: OK</li>
          <li>Vite: OK</li>
          <li>Port 5181: OK</li>
        </ul>
      </div>
    </div>
  );
}

export default SimpleApp;

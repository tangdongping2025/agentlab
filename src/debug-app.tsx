// 调试用的简单 App
import React from 'react';

function DebugApp() {
  console.log('Debug app is rendering!');

  return (
    <div style={{
      padding: '40px',
      background: 'lightgray',
      minHeight: '100vh'
    }}>
      <h1>Debug App - It Works!</h1>
      <h2>If you see this, React is working.</h2>
      <p>Current time: {new Date().toLocaleString()}</p>
      <hr />
      <h3>Now let's test each component...</h3>
    </div>
  );
}

export default DebugApp;

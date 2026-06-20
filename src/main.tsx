import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyMobileCompactMode } from './utils/mobileCompact'

applyMobileCompactMode()
window.addEventListener('resize', applyMobileCompactMode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

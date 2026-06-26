import React from 'react'
import ReactDOM from 'react-dom/client'
// Self-hosted Inter (variable) — bundled offline, no CDN. Fixes the prior state
// where 'Inter' was declared but never loaded, so the app fell back to Segoe UI.
import '@fontsource-variable/inter'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

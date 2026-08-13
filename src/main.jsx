import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initSocketSync } from '@/lib/socket-sync'

// Prevent "Cannot set property fetch of #<Window> which has only a getter"
try {
  const originalFetch = window.fetch;
  let currentFetch = originalFetch;
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get() { return currentFetch; },
    set(v) { currentFetch = v; }
  });
} catch (e) {}

// Initialize Socket.io and TanStack Query automatic sync
initSocketSync();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)


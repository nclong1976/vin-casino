import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

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

// Register the minimal service worker so "Add to Home Screen" satisfies
// Chrome/Android's installability criteria and actually launches fullscreen
// instead of falling back to a plain bookmark shortcut.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)


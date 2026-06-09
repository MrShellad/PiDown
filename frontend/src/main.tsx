import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Disable the native menu except where the app provides a custom context menu.
window.addEventListener('contextmenu', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[data-slot="context-menu-trigger"]')) return;
  event.preventDefault();
});

if (import.meta.env.PROD) {
  window.addEventListener(
    'keydown',
    (event) => {
      const key = event.key.toLowerCase();
      const isRefreshShortcut =
        event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r');

      if (!isRefreshShortcut) return;

      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

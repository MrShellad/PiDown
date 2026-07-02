import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { info as tauriInfo, error as tauriError } from '@tauri-apps/plugin-log'

// Safe logger wrapper to prevent crashes when running in browser mode
const backendLogger = {
  info: (msg: string) => {
    tauriInfo(msg).catch(() => console.info(msg));
  },
  error: (msg: string) => {
    tauriError(msg).catch(() => console.error(msg));
  }
};

backendLogger.info("PiDownloader frontend initializing...");

// Capture uncaught React / JavaScript exceptions
window.addEventListener('error', (event) => {
  const err = event.error;
  const message = err?.message || event.message;
  const stack = err?.stack || 'No stack trace available';
  backendLogger.error(`[Uncaught UI Error] ${message}\nSource: ${event.filename}:${event.lineno}:${event.colno}\nStack: ${stack}`);
});

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason?.message || String(reason);
  const stack = reason?.stack || 'No stack trace available';
  backendLogger.error(`[Unhandled UI Rejection] Reason: ${message}\nStack: ${stack}`);
});

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

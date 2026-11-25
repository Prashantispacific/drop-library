import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { coldStartBuffer } from './native/coldStartBuffer';

// Detect native environment early for status bar safe area reserve
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-capacitor');
}

// Guard against silent unhandled promise rejections in WebView
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[Global] Unhandled promise rejection:', event.reason);
});

// Buffer cold-start share events BEFORE React renders!
coldStartBuffer.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

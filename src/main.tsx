import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App.tsx';
import { coldStartBuffer } from './native/coldStartBuffer';

// Detect native environment early for status bar safe area reserve
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-capacitor');
}

// Buffer cold-start share events BEFORE React renders!
coldStartBuffer.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

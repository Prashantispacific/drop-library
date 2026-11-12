import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { coldStartBuffer } from './native/coldStartBuffer';

// Buffer cold-start share events BEFORE React renders!
coldStartBuffer.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

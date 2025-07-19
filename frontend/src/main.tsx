// frontend/src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeToggleProvider } from './theme/ThemeToggleProvider.tsx';
// 1. Importa el WebSocketProvider que acabamos de crear
import { WebSocketProvider } from './context/WebSocketProvider.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeToggleProvider>
      {/* 2. Envuelve tu App con el WebSocketProvider */}
      <WebSocketProvider>
        <App />
      </WebSocketProvider>
    </ThemeToggleProvider>
  </React.StrictMode>
);
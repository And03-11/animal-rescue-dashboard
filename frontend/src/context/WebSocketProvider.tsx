// frontend/src/context/WebSocketProvider.tsx
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Define la forma de nuestro contexto
interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (eventType: string, callback: (data: any) => void) => () => void;
}

// Creamos el contexto con un valor por defecto
const WebSocketContext = createContext<WebSocketContextType | null>(null);

// El proveedor que envolverá nuestra aplicación
export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  // Usamos un ref para almacenar los listeners y evitar re-renders innecesarios
  const listeners = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const connect = useCallback(() => {
    // Evita múltiples conexiones
    if (ws.current && ws.current.readyState === WebSocket.OPEN) return;

    // Obtiene la URL de la API de las variables de entorno de Vite
    const isSecure = window.location.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss' : 'ws';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}://${wsHost}/api/v1/ws/updates`;
    // Construye la URL del WebSocket, reemplazando http con ws

    console.log('Connecting to WebSocket:', wsUrl);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket Connected');
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      console.log('WebSocket Disconnected. Attempting to reconnect...');
      setIsConnected(false);
      // Intenta reconectar después de 3 segundos
      setTimeout(connect, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket Error:', error);
      ws.current?.close(); // Dispara el onclose para la lógica de reconexión
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        // Si hay listeners para este tipo de evento, ejecútalos
        if (listeners.current.has(type)) {
          listeners.current.get(type)?.forEach(callback => callback(data));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      // Limpia la conexión cuando el componente se desmonta
      ws.current?.close();
    };
  }, [connect]);

  // Función para que los componentes se suscriban a eventos
  const subscribe = useCallback((eventType: string, callback: (data: any) => void) => {
    if (!listeners.current.has(eventType)) {
      listeners.current.set(eventType, new Set());
    }
    listeners.current.get(eventType)?.add(callback);

    // Devuelve una función para desuscribirse y limpiar
    return () => {
      listeners.current.get(eventType)?.delete(callback);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
};

// Hook personalizado para usar el contexto fácilmente
export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
import { createContext, useContext } from 'react';

export type WebSocketPayload = unknown;
export type WebSocketListener = (data: WebSocketPayload) => void;

export interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (eventType: string, callback: WebSocketListener) => () => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

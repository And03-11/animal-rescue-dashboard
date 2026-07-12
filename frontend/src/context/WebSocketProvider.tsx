import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type WebSocketPayload = unknown;
type WebSocketListener = (data: WebSocketPayload) => void;

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (eventType: string, callback: WebSocketListener) => () => void;
}

interface WebSocketMessage {
  type?: unknown;
  data?: unknown;
}

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<WebSocketListener>>>(new Map());

  useEffect(() => {
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const connect = () => {
      if (disposed) return;

      const currentSocket = socketRef.current;
      if (
        currentSocket
        && (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      clearReconnectTimer();

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/ws/updates`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed || socketRef.current !== socket) return;
        reconnectAttempt = 0;
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if (typeof message.type !== 'string') return;
          listenersRef.current.get(message.type)?.forEach((callback) => callback(message.data));
        } catch {
          // Ignore malformed messages without interrupting the live connection.
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;

        setIsConnected(false);
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempt),
          RECONNECT_MAX_DELAY_MS,
        );
        reconnectAttempt += 1;
        clearReconnectTimer();
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();

      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const subscribe = useCallback((eventType: string, callback: WebSocketListener) => {
    const eventListeners = listenersRef.current.get(eventType) ?? new Set<WebSocketListener>();
    eventListeners.add(callback);
    listenersRef.current.set(eventType, eventListeners);

    return () => {
      const currentListeners = listenersRef.current.get(eventType);
      currentListeners?.delete(callback);
      if (currentListeners?.size === 0) listenersRef.current.delete(eventType);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

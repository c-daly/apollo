/**
 * React hook for real-time HCG updates via WebSocket
 */

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hcgWebSocket } from '../lib/websocket-client';
import type { WebSocketMessage, GraphSnapshot } from '../types/hcg';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
  onSnapshot?: (snapshot: GraphSnapshot) => void;
  onUpdate?: (update: unknown) => void;
  onError?: (error: string) => void;
}

export interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
  refresh: () => void;
}

/**
 * Hook to manage WebSocket connection for real-time HCG updates
 * 
 * Automatically invalidates TanStack Query cache when updates are received,
 * ensuring React components re-fetch fresh data.
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    onSnapshot,
    onUpdate,
    onError,
  } = options;

  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const connect = useCallback(() => {
    hcgWebSocket.connect();
  }, []);

  const disconnect = useCallback(() => {
    hcgWebSocket.disconnect();
  }, []);

  const refresh = useCallback(() => {
    hcgWebSocket.refresh();
  }, []);

  useEffect(() => {
    const handleMessage = (message: WebSocketMessage) => {
      setLastMessage(message);

      switch (message.type) {
        case 'snapshot':
          // Full snapshot received
          if (message.data && onSnapshot) {
            onSnapshot(message.data as GraphSnapshot);
          }
          // Invalidate all HCG queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['hcg'] });
          break;

        case 'update':
          // Incremental update received
          if (message.data && onUpdate) {
            onUpdate(message.data);
          }
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['hcg', 'history'] });
          queryClient.invalidateQueries({ queryKey: ['hcg', 'states'] });
          break;

        case 'error':
          // Error message received
          if (message.message && onError) {
            onError(message.message);
          }
          console.error('WebSocket error:', message.message);
          break;

        case 'pong':
          // Pong response to ping
          break;
      }
    };

    const unsubscribe = hcgWebSocket.onMessage(handleMessage);

    // Check connection status periodically
    const checkConnection = setInterval(() => {
      setConnected(hcgWebSocket.isConnected());
    }, 1000);

    // Auto-connect if enabled
    if (autoConnect) {
      connect();
    }

    return () => {
      unsubscribe();
      clearInterval(checkConnection);
      if (autoConnect) {
        disconnect();
      }
    };
  }, [autoConnect, connect, disconnect, onSnapshot, onUpdate, onError, queryClient]);

  return {
    connected,
    lastMessage,
    connect,
    disconnect,
    refresh,
  };
}

/**
 * Hook to get WebSocket connection status only
 */
export function useWebSocketStatus(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      setConnected(hcgWebSocket.isConnected());
    }, 1000);

    return () => clearInterval(checkConnection);
  }, []);

  return connected;
}

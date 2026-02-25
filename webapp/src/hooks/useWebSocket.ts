/**
 * React hook for real-time HCG updates via WebSocket
 */

import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hcgWebSocket } from '../lib/websocket-client'
import type { WebSocketMessage, GraphSnapshot } from '../types/hcg'

export interface UseWebSocketOptions {
  autoConnect?: boolean
  onSnapshot?: (snapshot: GraphSnapshot) => void
  onUpdate?: (update: unknown) => void
  onError?: (error: string) => void
}

export interface UseWebSocketReturn {
  connected: boolean
  lastMessage: WebSocketMessage | null
  connect: () => void
  disconnect: () => void
  refresh: () => void
}

/**
 * Hook to manage WebSocket connection for real-time HCG updates
 *
 * Automatically invalidates TanStack Query cache when updates are received,
 * ensuring React components re-fetch fresh data.
 */
export function useWebSocket(
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { autoConnect = true, onSnapshot, onUpdate, onError } = options

  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)

  const connect = useCallback(() => {
    hcgWebSocket.connect()
  }, [])

  const disconnect = useCallback(() => {
    hcgWebSocket.disconnect()
  }, [])

  const refresh = useCallback(() => {
    hcgWebSocket.refresh()
  }, [])

  useEffect(() => {
    let batchTimer: ReturnType<typeof setTimeout> | null = null
    let pendingUpdates: unknown[] = []

    const flushUpdates = () => {
      if (pendingUpdates.length === 0) return
      const updates = pendingUpdates
      pendingUpdates = []

      // Notify update callbacks
      for (const update of updates) {
        onUpdate?.(update)
      }

      // Invalidate only history/states, not the full snapshot
      queryClient.invalidateQueries({ queryKey: ['hcg', 'history'] })
      queryClient.invalidateQueries({ queryKey: ['hcg', 'states'] })
    }

    const handleMessage = (message: WebSocketMessage) => {
      setLastMessage(message)

      switch (message.type) {
        case 'snapshot':
          // Full snapshot — invalidate everything
          if (message.data && onSnapshot) {
            onSnapshot(message.data as GraphSnapshot)
          }
          queryClient.invalidateQueries({ queryKey: ['hcg'] })
          break

        case 'update':
          // Batch incremental updates — collect for 200ms then flush
          if (message.data) {
            pendingUpdates.push(message.data)
          }
          if (batchTimer) clearTimeout(batchTimer)
          batchTimer = setTimeout(flushUpdates, 200)
          break

        case 'error':
          if (message.message && onError) {
            onError(message.message)
          }
          console.error('WebSocket error:', message.message)
          break

        case 'pong':
          break
      }
    }

    const unsubscribe = hcgWebSocket.onMessage(handleMessage)

    const checkConnection = setInterval(() => {
      setConnected(hcgWebSocket.isConnected())
    }, 1000)

    if (autoConnect) {
      connect()
    }

    return () => {
      unsubscribe()
      clearInterval(checkConnection)
      if (batchTimer) {
        clearTimeout(batchTimer)
        flushUpdates()
      }
      if (autoConnect) {
        disconnect()
      }
    }
  }, [autoConnect, connect, disconnect, onSnapshot, onUpdate, onError, queryClient])

  return {
    connected,
    lastMessage,
    connect,
    disconnect,
    refresh,
  }
}

/**
 * Hook to get WebSocket connection status only
 */
export function useWebSocketStatus(): boolean {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const checkConnection = setInterval(() => {
      setConnected(hcgWebSocket.isConnected())
    }, 1000)

    return () => clearInterval(checkConnection)
  }, [])

  return connected
}

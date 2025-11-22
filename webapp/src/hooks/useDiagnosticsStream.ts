import { useEffect, useState, useRef } from 'react'
import { diagnosticsWebSocket } from '../lib/websocket-client'
import type { PersonaEntry } from '../types/hcg'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
  DiagnosticsEvent,
} from '../types/diagnostics'

interface DiagnosticsStreamOptions {
  onLog?: (entry: DiagnosticLogEntry) => void
  onTelemetry?: (snapshot: TelemetrySnapshot) => void
  onLogBatch?: (entries: DiagnosticLogEntry[]) => void
  onPersonaEntry?: (entry: PersonaEntry) => void
  onError?: (message: string) => void
  onConnectionChange?: (status: DiagnosticsConnectionStatus) => void
}

export type DiagnosticsConnectionStatus =
  | 'connecting'
  | 'online'
  | 'offline'
  | 'reconnecting'
  | 'error'

export interface DiagnosticsHealth {
  status: DiagnosticsConnectionStatus
  retryCount: number
  lastHeartbeat: Date | null
}

const DISCONNECT_DELAY_MS = 5000
let subscriberCount = 0
let disconnectTimer: ReturnType<typeof setTimeout> | null = null

function clearPendingDisconnect(): void {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer)
    disconnectTimer = null
  }
}

function startSubscription(): void {
  subscriberCount += 1
  clearPendingDisconnect()

  if (subscriberCount === 1) {
    diagnosticsWebSocket.connect()
  }
}

function stopSubscription(): void {
  subscriberCount = Math.max(0, subscriberCount - 1)

  if (subscriberCount === 0 && !disconnectTimer) {
    disconnectTimer = setTimeout(() => {
      diagnosticsWebSocket.disconnect()
      disconnectTimer = null
    }, DISCONNECT_DELAY_MS)
  }
}

export function useDiagnosticsStream(
  options: DiagnosticsStreamOptions
): DiagnosticsHealth {
  const {
    onLog,
    onTelemetry,
    onLogBatch,
    onPersonaEntry,
    onError,
    onConnectionChange,
  } = options

  const [health, setHealth] = useState<DiagnosticsHealth>(() => {
    const clientHealth = diagnosticsWebSocket.getHealth()
    return {
      status: clientHealth.connected ? 'online' : 'connecting',
      retryCount: clientHealth.retryCount,
      lastHeartbeat: clientHealth.lastHeartbeat,
    }
  })

  const callbacksRef = useRef({
    onLog,
    onTelemetry,
    onLogBatch,
    onPersonaEntry,
    onError,
    onConnectionChange,
  })

  useEffect(() => {
    callbacksRef.current = {
      onLog,
      onTelemetry,
      onLogBatch,
      onPersonaEntry,
      onError,
      onConnectionChange,
    }
  }, [
    onLog,
    onTelemetry,
    onLogBatch,
    onPersonaEntry,
    onError,
    onConnectionChange,
  ])

  useEffect(() => {
    startSubscription()

    const updateHealth = () => {
      const clientHealth = diagnosticsWebSocket.getHealth()
      setHealth(prev => ({
        ...prev,
        retryCount: clientHealth.retryCount,
        lastHeartbeat: clientHealth.lastHeartbeat,
      }))
    }

    const unsubscribe = diagnosticsWebSocket.onMessage(
      (event: DiagnosticsEvent) => {
        updateHealth()
        const callbacks = callbacksRef.current
        switch (event.type) {
          case 'log':
            callbacks.onLog?.({
              ...event.data,
              timestamp: event.data.timestamp,
            })
            break
          case 'logs':
            callbacks.onLogBatch?.(event.data)
            break
          case 'telemetry':
            callbacks.onTelemetry?.(event.data)
            break
          case 'persona_entry':
            callbacks.onPersonaEntry?.(event.data)
            break
          case 'error':
            if (event.data?.message) {
              callbacks.onError?.(String(event.data.message))
            }
            break
        }
      }
    )

    const unsubscribeConnection = diagnosticsWebSocket.onConnectionChange(
      state => {
        const mapped: DiagnosticsConnectionStatus =
          state === 'connected'
            ? 'online'
            : state === 'connecting'
              ? 'connecting'
              : state === 'reconnecting'
                ? 'reconnecting'
                : state === 'error'
                  ? 'error'
                  : 'offline'

        const clientHealth = diagnosticsWebSocket.getHealth()
        setHealth({
          status: mapped,
          retryCount: clientHealth.retryCount,
          lastHeartbeat: clientHealth.lastHeartbeat,
        })
        callbacksRef.current.onConnectionChange?.(mapped)
      }
    )

    // Poll for heartbeat updates every second to keep UI fresh
    const heartbeatTimer = setInterval(updateHealth, 1000)

    return () => {
      clearInterval(heartbeatTimer)
      unsubscribe()
      unsubscribeConnection()
      stopSubscription()
    }
  }, [])

  return health
}

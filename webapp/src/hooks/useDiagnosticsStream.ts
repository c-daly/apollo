import { useEffect, useState } from 'react'
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
  | 'error'

export function useDiagnosticsStream(
  options: DiagnosticsStreamOptions
): DiagnosticsConnectionStatus {
  const {
    onLog,
    onTelemetry,
    onLogBatch,
    onPersonaEntry,
    onError,
    onConnectionChange,
  } = options
  const [status, setStatus] =
    useState<DiagnosticsConnectionStatus>('connecting')

  useEffect(() => {
    const unsubscribe = diagnosticsWebSocket.onMessage(
      (event: DiagnosticsEvent) => {
        switch (event.type) {
          case 'log':
            onLog?.({
              ...event.data,
              timestamp: event.data.timestamp,
            })
            break
          case 'logs':
            onLogBatch?.(event.data)
            break
          case 'telemetry':
            onTelemetry?.(event.data)
            break
          case 'persona_entry':
            if (onPersonaEntry) {
              onPersonaEntry(event.data)
            }
            break
          case 'error':
            if (event.data?.message && onError) {
              onError(String(event.data.message))
            }
            break
        }
      }
    )

    diagnosticsWebSocket.connect()

    const unsubscribeConnection =
      diagnosticsWebSocket.onConnectionChange(state => {
        const mapped =
          state === 'connected'
            ? 'online'
            : state === 'connecting'
              ? 'connecting'
              : state === 'error'
                ? 'error'
                : 'offline'
        setStatus(mapped)
        onConnectionChange?.(mapped)
      })

    return () => {
      unsubscribe()
      unsubscribeConnection()
      diagnosticsWebSocket.disconnect()
    }
  }, [onLog, onTelemetry, onLogBatch, onPersonaEntry, onError, onConnectionChange])

  return status
}

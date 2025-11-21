import { useEffect, useState } from 'react'
import { diagnosticsWebSocket } from '../lib/websocket-client'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
  DiagnosticsEvent,
} from '../types/diagnostics'

interface DiagnosticsStreamOptions {
  onLog?: (entry: DiagnosticLogEntry) => void
  onTelemetry?: (snapshot: TelemetrySnapshot) => void
  onLogBatch?: (entries: DiagnosticLogEntry[]) => void
  onError?: (message: string) => void
}

export function useDiagnosticsStream(
  options: DiagnosticsStreamOptions
): boolean {
  const { onLog, onTelemetry, onLogBatch, onError } = options
  const [connected, setConnected] = useState(false)

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
          case 'error':
            if (event.data?.message && onError) {
              onError(String(event.data.message))
            }
            break
        }
      }
    )

    diagnosticsWebSocket.connect()
    const statusInterval = setInterval(() => {
      setConnected(diagnosticsWebSocket.isConnected())
    }, 1000)

    return () => {
      unsubscribe()
      clearInterval(statusInterval)
      diagnosticsWebSocket.disconnect()
    }
  }, [onLog, onTelemetry, onLogBatch, onError])

  return connected
}

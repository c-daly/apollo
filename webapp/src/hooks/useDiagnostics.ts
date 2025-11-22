import { useQuery } from '@tanstack/react-query'
import {
  fetchDiagnosticsLogs,
  fetchTelemetryMetrics,
} from '../lib/diagnostics-client'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
} from '../types/diagnostics'

const LOGS_POLL_INTERVAL = 30_000
const TELEMETRY_POLL_INTERVAL = 20_000

export function useDiagnosticsLogs(limit = 50) {
  return useQuery<DiagnosticLogEntry[]>({
    queryKey: ['diagnostics', 'logs', limit],
    queryFn: () => fetchDiagnosticsLogs(limit),
    refetchInterval: LOGS_POLL_INTERVAL,
  })
}

export function useTelemetryMetrics() {
  return useQuery<TelemetrySnapshot>({
    queryKey: ['diagnostics', 'telemetry'],
    queryFn: fetchTelemetryMetrics,
    refetchInterval: TELEMETRY_POLL_INTERVAL,
  })
}

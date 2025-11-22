export type DiagnosticLevel = 'info' | 'warning' | 'error'

export interface DiagnosticLogEntry {
  id: string
  timestamp: string
  level: DiagnosticLevel
  message: string
}

export interface TelemetrySnapshot {
  api_latency_ms: number
  request_count: number
  success_rate: number
  active_plans: number
  last_update: string
}

import type { PersonaEntry } from './hcg'

export type DiagnosticsEvent =
  | {
      type: 'log'
      data: DiagnosticLogEntry
    }
  | {
      type: 'logs'
      data: DiagnosticLogEntry[]
    }
  | {
      type: 'telemetry'
      data: TelemetrySnapshot
    }
  | {
      type: 'persona_entry'
      data: PersonaEntry
    }
  | {
      type: 'error' | 'pong'
      data?: Record<string, unknown>
    }

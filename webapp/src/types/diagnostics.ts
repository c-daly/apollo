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
  llm_latency_ms?: number | null
  llm_prompt_tokens?: number | null
  llm_completion_tokens?: number | null
  llm_total_tokens?: number | null
  persona_sentiment?: string | null
  persona_confidence?: number | null
  last_llm_update?: string | null
  last_llm_session?: string | null
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

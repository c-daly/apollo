import { getHCGConfig } from './config'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
} from '../types/diagnostics'

function buildDiagnosticsBaseUrl(): string {
  const apiUrl = getHCGConfig().apiUrl || 'http://localhost:8082'
  return `${apiUrl.replace(/\/$/, '')}/api/diagnostics`
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Diagnostics API error (${response.status})`)
  }

  return response.json() as Promise<T>
}

export async function fetchDiagnosticsLogs(
  limit = 50
): Promise<DiagnosticLogEntry[]> {
  const base = buildDiagnosticsBaseUrl()
  const response = await fetch(`${base}/logs?limit=${limit}`)
  return handleResponse<DiagnosticLogEntry[]>(response)
}

export async function fetchTelemetryMetrics(): Promise<TelemetrySnapshot> {
  const base = buildDiagnosticsBaseUrl()
  const response = await fetch(`${base}/metrics`)
  return handleResponse<TelemetrySnapshot>(response)
}

export interface LLMTelemetryPayload {
  latency_ms: number
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  persona_sentiment?: string | null
  persona_confidence?: number | null
  metadata?: Record<string, unknown>
}

export async function sendLLMTelemetry(
  payload: LLMTelemetryPayload
): Promise<void> {
  const base = buildDiagnosticsBaseUrl()
  const response = await fetch(`${base}/llm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || 'Failed to submit LLM telemetry')
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlanHistory, useProcesses } from '../hooks/useHCG'
import {
  useDiagnosticsLogs,
  useTelemetryMetrics,
} from '../hooks/useDiagnostics'
import {
  useDiagnosticsStream,
  type DiagnosticsConnectionStatus,
} from '../hooks/useDiagnosticsStream'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
} from '../types/diagnostics'
import TelemetryCard from './TelemetryCard'
import './DiagnosticsPanel.css'

type DiagnosticTab = 'logs' | 'timeline' | 'telemetry'
interface TelemetryHistoryPoint {
  timestamp: number
  apiLatency: number
  requestCount: number
  successRate: number
  llmLatency?: number | null
}

const HISTORY_LIMIT = 60

function DiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagnosticTab>('logs')
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([])
  const [logFilter, setLogFilter] = useState<string>('all')
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [telemetryHistory, setTelemetryHistory] = useState<
    TelemetryHistoryPoint[]
  >([])

  const {
    data: planHistory,
    isLoading: plansLoading,
    refetch: refetchPlans,
  } = usePlanHistory(undefined, 20)
  const {
    data: processes,
    isLoading: processesLoading,
    refetch: refetchProcesses,
  } = useProcesses(undefined, 50)

  const {
    data: initialLogs,
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useDiagnosticsLogs(100)
  const {
    data: initialTelemetry,
    isLoading: telemetryLoading,
    refetch: refetchTelemetry,
  } = useTelemetryMetrics()

  const pushHistoryPoint = useCallback((snapshot: TelemetrySnapshot) => {
    setTelemetryHistory(prev => {
      const next = [
        ...prev,
        {
          timestamp: new Date(snapshot.last_update).getTime(),
          apiLatency: snapshot.api_latency_ms,
          requestCount: snapshot.request_count,
          successRate: snapshot.success_rate,
          llmLatency: snapshot.llm_latency_ms ?? null,
        },
      ]
      return next.slice(-HISTORY_LIMIT)
    })
  }, [])

  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs)
    }
  }, [initialLogs])

  useEffect(() => {
    if (initialTelemetry) {
      setTelemetry(initialTelemetry)
      pushHistoryPoint(initialTelemetry)
    }
  }, [initialTelemetry, pushHistoryPoint])

  const streamHealth = useDiagnosticsStream({
    onLog: entry => {
      setLogs(prev => [entry, ...prev].slice(0, 100))
    },
    onLogBatch: entries => {
      setLogs(prev => [...entries, ...prev].slice(0, 100))
    },
    onTelemetry: snapshot => {
      setTelemetry(snapshot)
      pushHistoryPoint(snapshot)
    },
    onError: message => {
      setStreamError(message)
    },
  })

  useEffect(() => {
    if (streamError) {
      setLogs(prev => [
        {
          id: `stream-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: streamError,
        },
        ...prev,
      ])
    }
  }, [streamError])

  const filteredLogs = useMemo(
    () =>
      logs.filter(log =>
        logFilter === 'all' ? true : log.level === logFilter
      ),
    [logs, logFilter]
  )

  const telemetryTrends = useMemo(
    () => ({
      api: telemetryHistory.map(point => point.apiLatency),
      llm: telemetryHistory.map(point => point.llmLatency ?? null),
      requests: telemetryHistory.map(point => point.requestCount),
      success: telemetryHistory.map(point => point.successRate),
    }),
    [telemetryHistory]
  )

  const handleExportLogs = () => {
    const logData = filteredLogs
      .map(
        log =>
          `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${
            log.message
          }`
      )
      .join('\n')

    const blob = new Blob([logData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apollo-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleManualRefresh = () => {
    refetchLogs()
    refetchTelemetry()
    refetchPlans()
    refetchProcesses()
  }

  const statusLabel = connectionStatusLabel(streamHealth.status)
  const statusClass = connectionStatusClass(streamHealth.status)

  return (
    <div className="diagnostics-panel">
      <div className="diagnostics-status-bar">
        <div className={`stream-pill ${statusClass}`}>{statusLabel}</div>
        <div className="status-meta">
          <div>
            Last update:{' '}
            {telemetry
              ? new Date(telemetry.last_update).toLocaleTimeString()
              : '—'}
          </div>
          <div>
            WS Heartbeat:{' '}
            {streamHealth.lastHeartbeat
              ? new Date(streamHealth.lastHeartbeat).toLocaleTimeString()
              : '—'}
          </div>
          {streamHealth.retryCount > 0 && (
            <div style={{ color: 'var(--color-warning)' }}>
              Retries: {streamHealth.retryCount}
            </div>
          )}
          <div>
            LLM session:&nbsp;
            {telemetry?.last_llm_session ? telemetry.last_llm_session : '—'}
          </div>
        </div>
        <div className="status-actions">
          <button className="btn-secondary" onClick={handleManualRefresh}>
            Refresh Snapshot
          </button>
        </div>
      </div>
      {streamError && (
        <div className="stream-error-banner">
          Diagnostics stream degraded: {streamError}
        </div>
      )}
      <div className="diagnostics-tabs">
        <button
          className={`diag-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Logs
        </button>
        <button
          className={`diag-tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Plan Timeline
        </button>
        <button
          className={`diag-tab ${activeTab === 'telemetry' ? 'active' : ''}`}
          onClick={() => setActiveTab('telemetry')}
        >
          Telemetry
        </button>
      </div>

      <div className="diagnostics-content">
        {activeTab === 'logs' && (
          <div className="logs-view">
            <div className="logs-header">
              <h3>System Logs</h3>
              <div className="logs-controls">
                <select
                  className="log-filter"
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                >
                  <option value="all">All Levels</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
                <button className="btn-secondary" onClick={handleExportLogs}>
                  Export
                </button>
              </div>
            </div>
            <div className="logs-list">
              {logsLoading && filteredLogs.length === 0 ? (
                <div className="logs-placeholder">Loading logs...</div>
              ) : filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => (
                  <div
                    key={`${log.id}-${log.timestamp}-${index}`}
                    className={`log-entry ${log.level}`}
                  >
                    <span className="log-timestamp">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`log-level ${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="logs-placeholder">
                  No log entries yet. Activity will appear here in real time.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="timeline-view">
            <h3>Plan Execution Timeline</h3>
            {plansLoading ? (
              <div className="timeline-loading">Loading plan history...</div>
            ) : planHistory && planHistory.length > 0 ? (
              <div className="timeline-list">
                {planHistory.map(plan => (
                  <div key={plan.id} className="timeline-item">
                    <div className="timeline-marker">
                      <div className={`status-dot ${plan.status}`}></div>
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="timeline-id">Plan: {plan.id}</span>
                        <span className={`timeline-status ${plan.status}`}>
                          {plan.status}
                        </span>
                      </div>
                      <div className="timeline-details">
                        <div className="detail-row">
                          <strong>Goal ID:</strong> {plan.goal_id}
                        </div>
                        <div className="detail-row">
                          <strong>Steps:</strong> {plan.steps.length}
                        </div>
                        <div className="detail-row">
                          <strong>Created:</strong>{' '}
                          {new Date(plan.created_at).toLocaleString()}
                        </div>
                        {plan.started_at && (
                          <div className="detail-row">
                            <strong>Started:</strong>{' '}
                            {new Date(plan.started_at).toLocaleString()}
                          </div>
                        )}
                        {plan.completed_at && (
                          <div className="detail-row">
                            <strong>Completed:</strong>{' '}
                            {new Date(plan.completed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {plan.steps.length > 0 && (
                        <div className="timeline-steps">
                          <strong>Steps:</strong>
                          <ol>
                            {plan.steps.map(
                              (step: Record<string, unknown>, idx: number) => (
                                <li key={idx}>
                                  {(step.description as string) ||
                                    (step.name as string) ||
                                    `Step ${idx + 1}`}
                                </li>
                              )
                            )}
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="timeline-placeholder">
                <p>No plan history available.</p>
                <p>
                  Plans will appear here as they are created and executed in the
                  system.
                </p>
              </div>
            )}

            {!processesLoading && processes && processes.length > 0 && (
              <>
                <h3 style={{ marginTop: '2rem' }}>Active Processes</h3>
                <div className="processes-list">
                  {processes
                    .filter(
                      p => p.status === 'running' || p.status === 'pending'
                    )
                    .map(process => (
                      <div key={process.id} className="process-card">
                        <div className="process-header">
                          <span className="process-name">{process.name}</span>
                          <span className={`process-status ${process.status}`}>
                            {process.status}
                          </span>
                        </div>
                        {process.description && (
                          <div className="process-description">
                            {process.description}
                          </div>
                        )}
                        <div className="process-meta">
                          <span>Inputs: {process.inputs.length}</span>
                          <span>Outputs: {process.outputs.length}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="telemetry-view">
            <div className="telemetry-grid">
              <TelemetryCard
                label="API Latency"
                value={
                  telemetry ? `${telemetry.api_latency_ms.toFixed(1)} ms` : '—'
                }
                subtext="Rolling average"
                trend={telemetryTrends.api}
                trendLabel="API latency trend"
                tone={
                  telemetry && telemetry.api_latency_ms > 1500
                    ? 'warning'
                    : 'default'
                }
              />
              <TelemetryCard
                label="Request Rate"
                value={telemetry ? telemetry.request_count : '—'}
                subtext="Total API requests"
                trend={telemetryTrends.requests}
                trendLabel="Request trend"
              />
              <TelemetryCard
                label="Success Rate"
                value={
                  telemetry ? `${telemetry.success_rate.toFixed(1)}%` : '—'
                }
                subtext="Past minute"
                trend={telemetryTrends.success}
                trendLabel="Success rate trend"
                tone={
                  telemetry && telemetry.success_rate < 90
                    ? 'danger'
                    : 'default'
                }
              />
              <TelemetryCard
                label="Active Plans"
                value={telemetry ? telemetry.active_plans : '—'}
                subtext="Processes in execution"
                tone="default"
              />
              <TelemetryCard
                label="Active Clients"
                value={telemetry?.active_websockets ?? '—'}
                subtext="Connected dashboards"
                tone="default"
              />
              <TelemetryCard
                label="LLM Latency"
                value={
                  telemetry?.llm_latency_ms != null
                    ? `${telemetry.llm_latency_ms.toFixed(1)} ms`
                    : '—'
                }
                subtext={`Session: ${telemetry?.last_llm_session ?? '—'}`}
                trend={telemetryTrends.llm}
                trendLabel="LLM latency trend"
              />
              <TelemetryCard
                label="LLM Tokens"
                value={telemetry?.llm_total_tokens ?? '—'}
                subtext={
                  telemetry?.llm_prompt_tokens != null &&
                  telemetry?.llm_completion_tokens != null ? (
                    <>
                      {telemetry.llm_prompt_tokens} prompt /{' '}
                      {telemetry.llm_completion_tokens} completion
                    </>
                  ) : (
                    '—'
                  )
                }
              />
              <TelemetryCard
                label="Persona Sentiment"
                value={
                  telemetry?.persona_sentiment
                    ? telemetry.persona_sentiment
                    : '—'
                }
                subtext={
                  telemetry?.persona_confidence != null
                    ? `${Math.round(telemetry.persona_confidence * 100)}% confidence`
                    : 'Awaiting signal'
                }
                tone={sentimentTone(telemetry?.persona_sentiment)}
              />
            </div>
            {telemetryLoading && (
              <div className="telemetry-loading">Loading metrics…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function connectionStatusLabel(status: DiagnosticsConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'Live stream'
    case 'connecting':
      return 'Connecting…'
    case 'error':
      return 'Stream error'
    default:
      return 'Offline'
  }
}

function connectionStatusClass(status: DiagnosticsConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'online'
    case 'error':
      return 'error'
    case 'connecting':
      return 'connecting'
    default:
      return 'offline'
  }
}

function sentimentTone(
  sentiment?: string | null
): 'default' | 'success' | 'warning' | 'danger' {
  if (!sentiment) {
    return 'default'
  }
  switch (sentiment.toLowerCase()) {
    case 'positive':
      return 'success'
    case 'negative':
      return 'danger'
    case 'mixed':
      return 'warning'
    default:
      return 'default'
  }
}

export default DiagnosticsPanel

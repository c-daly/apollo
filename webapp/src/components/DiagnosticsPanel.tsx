import { useEffect, useMemo, useState } from 'react'
import { usePlanHistory, useProcesses } from '../hooks/useHCG'
import {
  useDiagnosticsLogs,
  useTelemetryMetrics,
} from '../hooks/useDiagnostics'
import { useDiagnosticsStream } from '../hooks/useDiagnosticsStream'
import type {
  DiagnosticLogEntry,
  TelemetrySnapshot,
} from '../types/diagnostics'
import './DiagnosticsPanel.css'

type DiagnosticTab = 'logs' | 'timeline' | 'telemetry'

function DiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagnosticTab>('logs')
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([])
  const [logFilter, setLogFilter] = useState<string>('all')
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)

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

  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs)
    }
  }, [initialLogs])

  useEffect(() => {
    if (initialTelemetry) {
      setTelemetry(initialTelemetry)
    }
  }, [initialTelemetry])

  const streamConnected = useDiagnosticsStream({
    onLog: entry => {
      setLogs(prev => [entry, ...prev].slice(0, 100))
    },
    onLogBatch: entries => {
      setLogs(prev => [...entries, ...prev].slice(0, 100))
    },
    onTelemetry: snapshot => {
      setTelemetry(snapshot)
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

  return (
    <div className="diagnostics-panel">
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
                <span
                  className={`stream-status ${streamConnected ? 'online' : 'offline'}`}
                >
                  {streamConnected ? 'Live' : 'Offline'}
                </span>
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
                filteredLogs.map(log => (
                  <div key={log.id} className={`log-entry ${log.level}`}>
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
            <h3>System Telemetry</h3>
            <div className="telemetry-update">
              Last updated:{' '}
              {telemetry
                ? new Date(telemetry.last_update).toLocaleTimeString()
                : telemetryLoading
                  ? 'Loading...'
                  : 'No data'}
            </div>
            <div className="telemetry-grid">
              <div className="telemetry-card">
                <span className="telemetry-label">API Latency</span>
                <span className="telemetry-value">
                  {telemetry ? `${telemetry.api_latency_ms} ms` : '—'}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Requests</span>
                <span className="telemetry-value">
                  {telemetry ? telemetry.request_count : '—'}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Success Rate</span>
                <span className="telemetry-value">
                  {telemetry ? `${telemetry.success_rate}%` : '—'}
                </span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Active Plans</span>
                <span className="telemetry-value">
                  {telemetry ? telemetry.active_plans : '—'}
                </span>
              </div>
            </div>
            <div className="telemetry-actions">
              <button className="btn-secondary" onClick={handleManualRefresh}>
                Refresh Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiagnosticsPanel

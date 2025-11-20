import { useState, useEffect } from 'react'
import { usePlanHistory, useProcesses } from '../hooks/useHCG'
import { hcgWebSocket } from '../lib/websocket-client'
import type { WebSocketMessage } from '../types/hcg'
import './DiagnosticsPanel.css'

type DiagnosticTab = 'logs' | 'timeline' | 'telemetry'

interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error'
  message: string
}

interface TelemetryData {
  apiLatency: number
  requests: number
  successRate: number
  activePlans: number
  lastUpdate: Date
}

function DiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagnosticTab>('logs')
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date(),
      level: 'info',
      message: 'Sophia API connected successfully',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 60000),
      level: 'info',
      message: 'Plan generation started for goal_12345',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 120000),
      level: 'warning',
      message: 'High latency detected on Hermes API (>500ms)',
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 180000),
      level: 'info',
      message: 'Embedding generated for text input',
    },
  ])
  const [logFilter, setLogFilter] = useState<string>('all')
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    apiLatency: 127,
    requests: 1247,
    successRate: 98.5,
    activePlans: 3,
    lastUpdate: new Date(),
  })

  // Fetch plan history for timeline
  const { data: planHistory, isLoading: plansLoading } = usePlanHistory(undefined, 20)
  const { data: processes, isLoading: processesLoading } = useProcesses(undefined, 50)

  // Setup WebSocket for real-time updates
  useEffect(() => {
    hcgWebSocket.connect()

    const unsubscribe = hcgWebSocket.onMessage((message: WebSocketMessage) => {
      if (message.type === 'update') {
        // Add log entry for updates
        const newLog: LogEntry = {
          id: `ws-${Date.now()}`,
          timestamp: new Date(),
          level: 'info',
          message: message.message || 'HCG update received',
        }
        setLogs(prev => [newLog, ...prev].slice(0, 100))

        // Update telemetry
        setTelemetry(prev => ({
          ...prev,
          lastUpdate: new Date(),
          requests: prev.requests + 1,
        }))
      } else if (message.type === 'error') {
        const errorLog: LogEntry = {
          id: `ws-error-${Date.now()}`,
          timestamp: new Date(),
          level: 'error',
          message: message.message || 'WebSocket error',
        }
        setLogs(prev => [errorLog, ...prev].slice(0, 100))
      }
    })

    // Refresh telemetry periodically
    const telemetryInterval = setInterval(() => {
      // Simulate telemetry updates (in production, fetch from API)
      setTelemetry(prev => ({
        apiLatency: Math.round(prev.apiLatency + (Math.random() - 0.5) * 20),
        requests: prev.requests + Math.floor(Math.random() * 10),
        successRate: Math.max(95, Math.min(100, prev.successRate + (Math.random() - 0.5))),
        activePlans: Math.max(0, prev.activePlans + Math.floor(Math.random() * 3 - 1)),
        lastUpdate: new Date(),
      }))
    }, 5000)

    return () => {
      unsubscribe()
      hcgWebSocket.disconnect()
      clearInterval(telemetryInterval)
    }
  }, [])

  const filteredLogs = logs.filter(log =>
    logFilter === 'all' ? true : log.level === logFilter
  )

  const handleExportLogs = () => {
    const logData = filteredLogs.map(log =>
      `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n')
    
    const blob = new Blob([logData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apollo-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
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
              {filteredLogs.map(log => (
                <div key={log.id} className={`log-entry ${log.level}`}>
                  <span className="log-timestamp">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`log-level ${log.level}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
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
                            {plan.steps.map((step: Record<string, unknown>, idx: number) => (
                              <li key={idx}>
                                {(step.description as string) || (step.name as string) || `Step ${idx + 1}`}
                              </li>
                            ))}
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
                    .filter(p => p.status === 'running' || p.status === 'pending')
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
              Last updated: {telemetry.lastUpdate.toLocaleTimeString()}
            </div>
            <div className="telemetry-grid">
              <div className="metric-card">
                <h4>API Latency</h4>
                <div className="metric-value">{telemetry.apiLatency}ms</div>
                <div className="metric-label">Average (last hour)</div>
              </div>
              <div className="metric-card">
                <h4>Requests</h4>
                <div className="metric-value">{telemetry.requests.toLocaleString()}</div>
                <div className="metric-label">Last hour</div>
              </div>
              <div className="metric-card">
                <h4>Success Rate</h4>
                <div className="metric-value">{telemetry.successRate.toFixed(1)}%</div>
                <div className="metric-label">Last hour</div>
              </div>
              <div className="metric-card">
                <h4>Active Plans</h4>
                <div className="metric-value">{telemetry.activePlans}</div>
                <div className="metric-label">Currently executing</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiagnosticsPanel

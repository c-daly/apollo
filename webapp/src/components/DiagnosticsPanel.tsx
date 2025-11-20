import { useState } from 'react'
import './DiagnosticsPanel.css'

type DiagnosticTab = 'logs' | 'timeline' | 'telemetry'

interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error'
  message: string
}

function DiagnosticsPanel() {
  const [activeTab, setActiveTab] = useState<DiagnosticTab>('logs')

  // Sample log data
  const logs: LogEntry[] = [
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
  ]

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
                <select className="log-filter">
                  <option value="all">All Levels</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
                <button className="btn-secondary">Export</button>
              </div>
            </div>
            <div className="logs-list">
              {logs.map(log => (
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
            <div className="timeline-placeholder">
              <p>
                Plan timeline visualization will show step-by-step execution
                progress.
              </p>
              <ul>
                <li>Step start/end times</li>
                <li>Performance metrics per step</li>
                <li>Dependencies and parallelization</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="telemetry-view">
            <h3>System Telemetry</h3>
            <div className="telemetry-grid">
              <div className="metric-card">
                <h4>API Latency</h4>
                <div className="metric-value">127ms</div>
                <div className="metric-label">Average (last hour)</div>
              </div>
              <div className="metric-card">
                <h4>Requests</h4>
                <div className="metric-value">1,247</div>
                <div className="metric-label">Last hour</div>
              </div>
              <div className="metric-card">
                <h4>Success Rate</h4>
                <div className="metric-value">98.5%</div>
                <div className="metric-label">Last hour</div>
              </div>
              <div className="metric-card">
                <h4>Active Plans</h4>
                <div className="metric-value">3</div>
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

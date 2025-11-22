/**
 * Example component demonstrating CWM mock fixtures usage
 *
 * This component shows how to:
 * - Toggle between live and mock data modes
 * - Subscribe to CWM state streams
 * - Display CWM records with type safety
 * - Filter records by type
 */

import { useEffect, useState } from 'react'
import {
  mockCWMStateService,
  toggleMockMode,
  isMockMode,
  type CWMState,
  type CWMActionPayload,
  type CWMGoalPayload,
  type CWMEventPayload,
} from '../fixtures'

export function CWMFixtureExample() {
  const [records, setRecords] = useState<
    Array<CWMState<CWMActionPayload | CWMGoalPayload | CWMEventPayload>>
  >([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [mockMode, setMockMode] = useState(isMockMode())
  const [filterType, setFilterType] = useState<
    'all' | 'cwm-a' | 'cwm-g' | 'cwm-e'
  >('all')

  useEffect(() => {
    // Subscribe to stream updates
    const unsubscribe = mockCWMStateService.subscribe(record => {
      if (record) {
        setRecords(prev => [...prev, record])
      } else {
        // Stream complete
        setIsStreaming(false)
      }
    })

    return unsubscribe
  }, [])

  const handleToggleMode = () => {
    const newMode = toggleMockMode()
    setMockMode(newMode === 'mock')
    setRecords([])
  }

  const handleStartStream = () => {
    setRecords([])
    mockCWMStateService.resetStream()
    mockCWMStateService.startStream()
    setIsStreaming(true)
  }

  const handleStopStream = () => {
    mockCWMStateService.stopStream()
    setIsStreaming(false)
  }

  const handleLoadStream = (type: 'default' | 'short' | 'failures') => {
    const stream = mockCWMStateService.getFullStream(type)
    mockCWMStateService.loadStream(stream)
    setRecords([])
  }

  const stats = mockCWMStateService.getStreamStats()

  const filteredRecords =
    filterType === 'all'
      ? records
      : records.filter(r => r.model_type === filterType)

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>CWM Mock Fixtures Example</h1>

      {/* Mode Controls */}
      <div
        style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '5px',
        }}
      >
        <h2>Data Mode</h2>
        <button
          onClick={handleToggleMode}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          {mockMode ? '🔄 Switch to Live Mode' : '🔄 Switch to Mock Mode'}
        </button>
        <p>
          <strong>Current Mode:</strong> {mockMode ? 'Mock Data' : 'Live Data'}
        </p>
      </div>

      {/* Stream Controls */}
      {mockMode && (
        <div
          style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e8f4f8',
            borderRadius: '5px',
          }}
        >
          <h2>Stream Controls</h2>
          <div style={{ marginBottom: '10px' }}>
            <button
              onClick={handleStartStream}
              disabled={isStreaming}
              style={{
                marginRight: '10px',
                padding: '10px 20px',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
              }}
            >
              ▶️ Start Stream
            </button>
            <button
              onClick={handleStopStream}
              disabled={!isStreaming}
              style={{
                padding: '10px 20px',
                cursor: !isStreaming ? 'not-allowed' : 'pointer',
              }}
            >
              ⏸️ Stop Stream
            </button>
          </div>

          <div style={{ marginTop: '10px' }}>
            <strong>Load Stream: </strong>
            <button
              onClick={() => handleLoadStream('default')}
              style={{ marginRight: '5px', padding: '5px 10px' }}
            >
              Default (7 records)
            </button>
            <button
              onClick={() => handleLoadStream('short')}
              style={{ marginRight: '5px', padding: '5px 10px' }}
            >
              Short (3 records)
            </button>
            <button
              onClick={() => handleLoadStream('failures')}
              style={{ padding: '5px 10px' }}
            >
              Failures (1 record)
            </button>
          </div>

          <div style={{ marginTop: '15px', fontSize: '14px' }}>
            <strong>Stream Stats:</strong>
            <ul>
              <li>Stream ID: {stats.streamId || 'None'}</li>
              <li>Total Records: {stats.totalRecords}</li>
              <li>Current Position: {stats.currentPosition}</li>
              <li>
                Record Counts: Actions: {stats.recordCounts.actions}, Goals:{' '}
                {stats.recordCounts.goals}, Events: {stats.recordCounts.events}
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Filter Controls */}
      {records.length > 0 && (
        <div
          style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            borderRadius: '5px',
          }}
        >
          <h2>Filter Records</h2>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as typeof filterType)}
            style={{ padding: '5px 10px', fontSize: '16px' }}
          >
            <option value="all">All Records ({records.length})</option>
            <option value="cwm-a">
              Actions ({records.filter(r => r.model_type === 'cwm-a').length})
            </option>
            <option value="cwm-g">
              Goals ({records.filter(r => r.model_type === 'cwm-g').length})
            </option>
            <option value="cwm-e">
              Events ({records.filter(r => r.model_type === 'cwm-e').length})
            </option>
          </select>
        </div>
      )}

      {/* Records Display */}
      <div>
        <h2>
          CWM Records ({filteredRecords.length}){' '}
          {isStreaming && <span style={{ color: '#28a745' }}>● Streaming</span>}
        </h2>
        {filteredRecords.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>
            No records yet. {mockMode ? 'Start a stream to see records.' : ''}
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {filteredRecords.map(record => (
              <div
                key={record.state_id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  padding: '15px',
                  backgroundColor: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <span>
                    <strong
                      style={{
                        color:
                          record.model_type === 'cwm-a'
                            ? '#007bff'
                            : record.model_type === 'cwm-g'
                              ? '#28a745'
                              : '#ffc107',
                      }}
                    >
                      {record.model_type.toUpperCase()}
                    </strong>{' '}
                    - {record.state_id}
                  </span>
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    Status: {record.status}
                  </span>
                </div>

                {record.model_type === 'cwm-a' &&
                  'action_type' in record.data && (
                    <div>
                      <p>
                        <strong>Action:</strong> {record.data.action_type}
                      </p>
                      <p>
                        <strong>Description:</strong>{' '}
                        {record.data.description}
                      </p>
                      <p>
                        <strong>Status:</strong>{' '}
                        <span
                          style={{
                            color:
                              record.data.status === 'completed'
                                ? '#28a745'
                                : record.data.status === 'failed'
                                  ? '#dc3545'
                                  : '#ffc107',
                          }}
                        >
                          {record.data.status}
                        </span>
                      </p>
                    </div>
                  )}

                {record.model_type === 'cwm-g' &&
                  'priority' in record.data && (
                    <div>
                      <p>
                        <strong>Goal:</strong> {record.data.description}
                      </p>
                      <p>
                        <strong>Priority:</strong> {record.data.priority}
                      </p>
                      <p>
                        <strong>Progress:</strong> {record.data.progress}%
                      </p>
                      <p>
                        <strong>Frames:</strong> {record.data.frames.length}{' '}
                        frame(s)
                      </p>
                    </div>
                  )}

                {record.model_type === 'cwm-e' &&
                  'event_type' in record.data && (
                    <div>
                      <p>
                        <strong>Event:</strong> {record.data.event_type}
                      </p>
                      <p>
                        <strong>Description:</strong>{' '}
                        {record.data.description}
                      </p>
                      <p>
                        <strong>Severity:</strong>{' '}
                        <span
                          style={{
                            color:
                              record.data.severity === 'critical'
                                ? '#dc3545'
                                : record.data.severity === 'error'
                                  ? '#fd7e14'
                                  : record.data.severity === 'warning'
                                    ? '#ffc107'
                                    : '#17a2b8',
                          }}
                        >
                          {record.data.severity}
                        </span>
                      </p>
                    </div>
                  )}

                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    color: '#666',
                  }}
                >
                  <strong>Timestamp:</strong>{' '}
                  {new Date(record.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '5px',
          fontSize: '14px',
        }}
      >
        <h3>How to Use</h3>
        <ol>
          <li>Toggle to "Mock Mode" to enable fixture data</li>
          <li>
            Choose a stream to load (default, short, or failures) or keep the
            current one
          </li>
          <li>Click "Start Stream" to begin streaming records</li>
          <li>
            Records will appear below as they're streamed (100ms delay between
            records)
          </li>
          <li>Use the filter dropdown to show specific record types</li>
          <li>
            Click "Stop Stream" to pause or "Start Stream" again to restart
          </li>
        </ol>
        <p>
          <strong>Note:</strong> In "Live Mode", this component would connect to
          real backend services via the Sophia and Hermes clients.
        </p>
      </div>
    </div>
  )
}

export default CWMFixtureExample

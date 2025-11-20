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
  type CWMEnvelope,
  type CWMActionPayload,
  type CWMGoalPayload,
  type CWMEventPayload,
} from '../fixtures'

export function CWMFixtureExample() {
  const [records, setRecords] = useState<
    Array<CWMEnvelope<CWMActionPayload | CWMGoalPayload | CWMEventPayload>>
  >([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [mockMode, setMockMode] = useState(isMockMode())
  const [filterType, setFilterType] = useState<
    'all' | 'CWM-A' | 'CWM-G' | 'CWM-E'
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
      : records.filter(r => r.record_type === filterType)

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
            <option value="CWM-A">
              Actions ({records.filter(r => r.record_type === 'CWM-A').length})
            </option>
            <option value="CWM-G">
              Goals ({records.filter(r => r.record_type === 'CWM-G').length})
            </option>
            <option value="CWM-E">
              Events ({records.filter(r => r.record_type === 'CWM-E').length})
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
                key={record.record_id}
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
                          record.record_type === 'CWM-A'
                            ? '#007bff'
                            : record.record_type === 'CWM-G'
                              ? '#28a745'
                              : '#ffc107',
                      }}
                    >
                      {record.record_type}
                    </strong>{' '}
                    - {record.record_id}
                  </span>
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    Seq: {record.sequence_number}
                  </span>
                </div>

                {record.record_type === 'CWM-A' &&
                  'action_type' in record.payload && (
                    <div>
                      <p>
                        <strong>Action:</strong> {record.payload.action_type}
                      </p>
                      <p>
                        <strong>Description:</strong>{' '}
                        {record.payload.description}
                      </p>
                      <p>
                        <strong>Status:</strong>{' '}
                        <span
                          style={{
                            color:
                              record.payload.status === 'completed'
                                ? '#28a745'
                                : record.payload.status === 'failed'
                                  ? '#dc3545'
                                  : '#ffc107',
                          }}
                        >
                          {record.payload.status}
                        </span>
                      </p>
                    </div>
                  )}

                {record.record_type === 'CWM-G' &&
                  'priority' in record.payload && (
                    <div>
                      <p>
                        <strong>Goal:</strong> {record.payload.description}
                      </p>
                      <p>
                        <strong>Priority:</strong> {record.payload.priority}
                      </p>
                      <p>
                        <strong>Progress:</strong> {record.payload.progress}%
                      </p>
                      <p>
                        <strong>Frames:</strong> {record.payload.frames.length}{' '}
                        frame(s)
                      </p>
                    </div>
                  )}

                {record.record_type === 'CWM-E' &&
                  'event_type' in record.payload && (
                    <div>
                      <p>
                        <strong>Event:</strong> {record.payload.event_type}
                      </p>
                      <p>
                        <strong>Description:</strong>{' '}
                        {record.payload.description}
                      </p>
                      <p>
                        <strong>Severity:</strong>{' '}
                        <span
                          style={{
                            color:
                              record.payload.severity === 'critical'
                                ? '#dc3545'
                                : record.payload.severity === 'error'
                                  ? '#fd7e14'
                                  : record.payload.severity === 'warning'
                                    ? '#ffc107'
                                    : '#17a2b8',
                          }}
                        >
                          {record.payload.severity}
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

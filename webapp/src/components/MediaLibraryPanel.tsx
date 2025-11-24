import { useState, useEffect, useCallback } from 'react'
import { getHCGConfig } from '../lib/config'
import './MediaLibraryPanel.css'

interface MediaMetadata {
  file_size: number
  mime_type: string
  width?: number
  height?: number
  duration?: number
}

interface MediaSample {
  sample_id: string
  media_type: 'IMAGE' | 'VIDEO' | 'AUDIO'
  file_path: string
  metadata: MediaMetadata
  neo4j_node_id: string
  created_at: string
  simulation_count?: number
}

interface MediaSamplesResponse {
  samples: MediaSample[]
  total: number
  offset: number
  limit: number
}

type MediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO'

function MediaLibraryPanel() {
  const [samples, setSamples] = useState<MediaSample[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<MediaTypeFilter>('ALL')
  const [selectedSample, setSelectedSample] = useState<MediaSample | null>(null)
  const [total, setTotal] = useState(0)

  const apolloApiBase =
    getHCGConfig().apiUrl?.replace(/\/$/, '') || 'http://localhost:8082'

  const fetchSamples = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: '0',
      })
      if (filter !== 'ALL') {
        params.append('media_type', filter)
      }

      const response = await fetch(`${apolloApiBase}/api/media/samples?${params}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch samples: ${response.statusText}`)
      }

      const data: MediaSamplesResponse = await response.json()
      setSamples(data.samples)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media samples')
    } finally {
      setLoading(false)
    }
  }, [apolloApiBase, filter])

  useEffect(() => {
    fetchSamples()
  }, [fetchSamples])

  const handleSampleClick = (sample: MediaSample) => {
    setSelectedSample(sample)
  }

  const handleCloseDetail = () => {
    setSelectedSample(null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hr ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const getMediaIcon = (type: string): string => {
    switch (type) {
      case 'IMAGE':
        return '🖼️'
      case 'VIDEO':
        return '🎥'
      case 'AUDIO':
        return '🎵'
      default:
        return '📄'
    }
  }

  return (
    <div className="media-library-panel">
      <div className="library-header">
        <div className="header-content">
          <h2>Media Samples</h2>
          <div className="filter-controls">
            <label htmlFor="type-filter">Filter:</label>
            <select
              id="type-filter"
              value={filter}
              onChange={e => setFilter(e.target.value as MediaTypeFilter)}
              className="filter-select"
            >
              <option value="ALL">All Types</option>
              <option value="IMAGE">Images</option>
              <option value="VIDEO">Videos</option>
              <option value="AUDIO">Audio</option>
            </select>
          </div>
        </div>
        <p className="sample-count">
          {loading ? 'Loading...' : `${total} sample${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {error && (
        <div className="library-error">
          <span className="error-icon">⚠️</span>
          {error}
          <button onClick={fetchSamples} className="retry-btn">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading media samples...</p>
        </div>
      ) : samples.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <p>No media samples found</p>
          <p className="empty-hint">Upload some media to get started</p>
        </div>
      ) : (
        <div className="samples-grid">
          {samples.map(sample => (
            <div
              key={sample.sample_id}
              className="sample-card"
              onClick={() => handleSampleClick(sample)}
            >
              <div className="sample-preview">
                <div className="sample-icon">{getMediaIcon(sample.media_type)}</div>
              </div>
              <div className="sample-info">
                <p className="sample-id">{sample.sample_id}</p>
                <p className="sample-meta">
                  {sample.media_type} • {formatFileSize(sample.metadata.file_size)}
                </p>
                <p className="sample-time">{formatTimestamp(sample.created_at)}</p>
                {sample.simulation_count !== undefined && (
                  <p className="simulation-count">
                    {sample.simulation_count} simulation
                    {sample.simulation_count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <div className="sample-actions">
                <button
                  className="action-btn view-btn"
                  onClick={e => {
                    e.stopPropagation()
                    handleSampleClick(sample)
                  }}
                >
                  View
                </button>
                <button
                  className="action-btn simulate-btn"
                  onClick={e => {
                    e.stopPropagation()
                    alert(`Simulation with ${sample.sample_id} - Coming soon!`)
                  }}
                >
                  Simulate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSample && (
        <div className="detail-modal" onClick={handleCloseDetail}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Media Sample Details</h3>
              <button className="close-btn" onClick={handleCloseDetail}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <label>Sample ID</label>
                <p className="detail-value">{selectedSample.sample_id}</p>
              </div>
              <div className="detail-section">
                <label>Type</label>
                <p className="detail-value">{selectedSample.media_type}</p>
              </div>
              <div className="detail-section">
                <label>File Path</label>
                <p className="detail-value code">{selectedSample.file_path}</p>
              </div>
              <div className="detail-section">
                <label>Size</label>
                <p className="detail-value">
                  {formatFileSize(selectedSample.metadata.file_size)}
                </p>
              </div>
              <div className="detail-section">
                <label>MIME Type</label>
                <p className="detail-value">{selectedSample.metadata.mime_type}</p>
              </div>
              {selectedSample.metadata.width && selectedSample.metadata.height && (
                <div className="detail-section">
                  <label>Dimensions</label>
                  <p className="detail-value">
                    {selectedSample.metadata.width} × {selectedSample.metadata.height}
                  </p>
                </div>
              )}
              {selectedSample.metadata.duration && (
                <div className="detail-section">
                  <label>Duration</label>
                  <p className="detail-value">
                    {selectedSample.metadata.duration.toFixed(1)}s
                  </p>
                </div>
              )}
              <div className="detail-section">
                <label>Neo4j Node ID</label>
                <p className="detail-value code">{selectedSample.neo4j_node_id}</p>
              </div>
              <div className="detail-section">
                <label>Created</label>
                <p className="detail-value">
                  {new Date(selectedSample.created_at).toLocaleString()}
                </p>
              </div>
              {selectedSample.simulation_count !== undefined && (
                <div className="detail-section">
                  <label>Simulations</label>
                  <p className="detail-value">{selectedSample.simulation_count}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleCloseDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MediaLibraryPanel

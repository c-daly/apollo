import { useState, useEffect, useCallback } from 'react'
import { usePersonaEntries } from '../hooks/useHCG'
import { useDiagnosticsStream } from '../hooks/useDiagnosticsStream'
import type { PersonaEntry } from '../types/hcg'
import './PersonaDiary.css'

function PersonaDiary() {
  const [filterType, setFilterType] = useState<string>('')
  const [filterSentiment, setFilterSentiment] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Fetch persona entries from API
  const {
    data: apiEntries,
    refetch,
    isLoading,
    error,
  } = usePersonaEntries({
    entry_type: filterType || undefined,
    sentiment: filterSentiment || undefined,
    limit: 100,
  })

  // Local state for entries (combines API + WebSocket)
  const [entries, setEntries] = useState<PersonaEntry[]>([])

  // Update entries when API data changes
  useEffect(() => {
    if (apiEntries && apiEntries.length > 0) {
      setEntries(apiEntries)
    }
  }, [apiEntries])

  const handlePersonaEntry = useCallback(
    (entry: PersonaEntry) => {
      setEntries(prev => {
        const filtered = prev.filter(existing => existing.id !== entry.id)
        return [entry, ...filtered].slice(0, 100)
      })
      refetch()
    },
    [refetch]
  )

  useDiagnosticsStream({
    onPersonaEntry: handlePersonaEntry,
  })

  // Filter entries based on search term
  const filteredEntries = entries.filter(entry => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      entry.content.toLowerCase().includes(searchLower) ||
      entry.entry_type.toLowerCase().includes(searchLower) ||
      entry.emotion_tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
      (entry.summary && entry.summary.toLowerCase().includes(searchLower))
    )
  })

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'belief':
        return '💭'
      case 'decision':
        return '⚡'
      case 'observation':
        return '👁️'
      case 'reflection':
        return '🤔'
      default:
        return '📝'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'belief':
        return '#60a5fa'
      case 'decision':
        return '#4ade80'
      case 'observation':
        return '#fbbf24'
      case 'reflection':
        return '#a78bfa'
      default:
        return '#888'
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return '#4ade80'
      case 'negative':
        return '#f87171'
      case 'neutral':
        return '#9ca3af'
      case 'mixed':
        return '#fbbf24'
      default:
        return '#888'
    }
  }

  if (error) {
    return (
      <div className="persona-diary">
        <div className="diary-header">
          <h2>Persona Diary</h2>
          <p className="diary-error">
            Error loading diary entries: {error.message}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="persona-diary">
      <div className="diary-header">
        <h2>Persona Diary</h2>
        <p className="diary-subtitle">
          Agent's internal reasoning and decision-making process
        </p>

        {/* Filters and Search */}
        <div className="diary-controls">
          <input
            type="text"
            placeholder="Search entries..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="diary-search"
          />

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="diary-filter"
          >
            <option value="">All Types</option>
            <option value="belief">Beliefs</option>
            <option value="decision">Decisions</option>
            <option value="observation">Observations</option>
            <option value="reflection">Reflections</option>
          </select>

          <select
            value={filterSentiment}
            onChange={e => setFilterSentiment(e.target.value)}
            className="diary-filter"
          >
            <option value="">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
            <option value="neutral">Neutral</option>
            <option value="mixed">Mixed</option>
          </select>

          <button onClick={() => refetch()} className="diary-refresh">
            ↻ Refresh
          </button>
        </div>

        <div className="diary-stats">
          <span>Total Entries: {filteredEntries.length}</span>
          {isLoading && <span className="loading">Loading...</span>}
          <span>
            Latest:{' '}
            {filteredEntries.length > 0
              ? new Date(filteredEntries[0].timestamp).toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
      </div>

      <div className="diary-timeline">
        {filteredEntries.length === 0 ? (
          <div className="diary-empty">
            <p>No diary entries found.</p>
            <p className="diary-help">
              Use the CLI command <code>apollo-cli diary</code> to create
              entries, or entries will be created automatically from agent
              activities.
            </p>
          </div>
        ) : (
          filteredEntries.map(entry => (
            <div key={entry.id} className="diary-entry">
              <div
                className="entry-marker"
                style={{ backgroundColor: getTypeColor(entry.entry_type) }}
              >
                <span className="entry-icon">
                  {getTypeIcon(entry.entry_type)}
                </span>
              </div>
              <div className="entry-content">
                <div className="entry-header">
                  <span
                    className="entry-type"
                    style={{ color: getTypeColor(entry.entry_type) }}
                  >
                    {entry.entry_type.charAt(0).toUpperCase() +
                      entry.entry_type.slice(1)}
                  </span>
                  <span className="entry-timestamp">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>

                {entry.summary && (
                  <div className="entry-summary">{entry.summary}</div>
                )}

                <div className="entry-text">{entry.content}</div>

                <div className="entry-metadata">
                  {entry.sentiment && (
                    <span
                      className="entry-sentiment"
                      style={{ color: getSentimentColor(entry.sentiment) }}
                    >
                      Sentiment: {entry.sentiment}
                    </span>
                  )}
                  {entry.confidence !== undefined && (
                    <span className="entry-confidence">
                      Confidence: {(entry.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {entry.emotion_tags.length > 0 && (
                    <div className="entry-emotions">
                      {entry.emotion_tags.map(tag => (
                        <span key={tag} className="emotion-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {(entry.related_process_ids.length > 0 ||
                    entry.related_goal_ids.length > 0) && (
                    <div className="entry-links">
                      {entry.related_process_ids.length > 0 && (
                        <span className="link-info">
                          🔗 Processes: {entry.related_process_ids.join(', ')}
                        </span>
                      )}
                      {entry.related_goal_ids.length > 0 && (
                        <span className="link-info">
                          🎯 Goals: {entry.related_goal_ids.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="diary-legend">
        <h3>Entry Types</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span
              className="legend-icon"
              style={{ backgroundColor: '#60a5fa' }}
            >
              💭
            </span>
            <span>Belief Update</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-icon"
              style={{ backgroundColor: '#4ade80' }}
            >
              ⚡
            </span>
            <span>Decision</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-icon"
              style={{ backgroundColor: '#fbbf24' }}
            >
              👁️
            </span>
            <span>Observation</span>
          </div>
          <div className="legend-item">
            <span
              className="legend-icon"
              style={{ backgroundColor: '#a78bfa' }}
            >
              🤔
            </span>
            <span>Reflection</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PersonaDiary

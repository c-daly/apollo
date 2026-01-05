import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePersonaEntries, type PersonaEntryFull } from '../hooks/useHCG'
import {
  useDiagnosticsStream,
  type DiagnosticsConnectionStatus,
} from '../hooks/useDiagnosticsStream'
import './PersonaDiary.css'

const PREF_KEY = 'apollo-persona-preferences'
const HIGHLIGHT_TTL = 6000
const MAX_ENTRIES = 150

interface DiaryPreferences {
  filterType: string
  filterSentiment: string
  searchTerm: string
  sessionFilter: string
}

const defaultPrefs: DiaryPreferences = {
  filterType: '',
  filterSentiment: '',
  searchTerm: '',
  sessionFilter: '',
}

function PersonaDiary() {
  const [prefs, setPrefs] = useState<DiaryPreferences>(() => {
    try {
      const stored = localStorage.getItem(PREF_KEY)
      if (stored) {
        return { ...defaultPrefs, ...JSON.parse(stored) }
      }
    } catch {
      // ignore
    }
    return defaultPrefs
  })
  const { filterType, filterSentiment, searchTerm, sessionFilter } = prefs

  const {
    data: apiEntries,
    isLoading,
    error,
  } = usePersonaEntries({
    entry_type: filterType || undefined,
    sentiment: filterSentiment || undefined,
    limit: MAX_ENTRIES,
  })

  const [entries, setEntries] = useState<PersonaEntryFull[]>([])
  const [connectionStatus, setConnectionStatus] =
    useState<DiagnosticsConnectionStatus>('connecting')
  const [highlightMap, setHighlightMap] = useState<Record<string, number>>({})

  useEffect(() => {
    if (apiEntries?.length) {
      setEntries(apiEntries)
    }
  }, [apiEntries])

  const handlePersonaEntry = useCallback((entry: PersonaEntryFull) => {
    setEntries(prev => {
      const filtered = prev.filter(existing => existing.entry_id !== entry.entry_id)
      return [entry, ...filtered].slice(0, MAX_ENTRIES)
    })
    setHighlightMap(prev => ({ ...prev, [entry.entry_id]: Date.now() }))
  }, [])

  useDiagnosticsStream({
    onPersonaEntry: handlePersonaEntry,
    onConnectionChange: setConnectionStatus,
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setHighlightMap(prev => {
        const next = { ...prev }
        Object.entries(next).forEach(([id, ts]) => {
          if (now - ts > HIGHLIGHT_TTL) {
            delete next[id]
          }
        })
        return next
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  }, [prefs])

  const updatePrefs = (changes: Partial<DiaryPreferences>) =>
    setPrefs(prev => ({ ...prev, ...changes }))

  const filteredEntries = useMemo(() => {
    return entries
      .filter(entry => {
        if (!searchTerm) return true
        const lower = searchTerm.toLowerCase()
        return (
          entry.content.toLowerCase().includes(lower) ||
          entry.entry_type.toLowerCase().includes(lower) ||
          entry.emotion_tags.some(tag => tag.toLowerCase().includes(lower)) ||
          entry.related_process_ids.some(id =>
            id.toLowerCase().includes(lower)
          ) ||
          entry.related_goal_ids.some(id => id.toLowerCase().includes(lower)) ||
          (entry.summary && entry.summary.toLowerCase().includes(lower))
        )
      })
      .filter(entry =>
        sessionFilter
          ? entry.metadata?.session_id === sessionFilter ||
            entry.metadata?.sessionId === sessionFilter
          : true
      )
      .filter(entry => (filterType ? entry.entry_type === filterType : true))
      .filter(entry =>
        filterSentiment
          ? entry.sentiment
            ? entry.sentiment === filterSentiment
            : false
          : true
      )
  }, [entries, filterType, filterSentiment, sessionFilter, searchTerm])

  const latestTimestamp = filteredEntries[0]?.timestamp

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

  const renderEntries = () => {
    if (!filteredEntries.length) {
      return (
        <div className="diary-empty">
          <p>No diary entries found.</p>
          <p className="diary-help">
            Use <code>apollo-cli diary</code> or interact via the chat panel to
            generate entries.
          </p>
        </div>
      )
    }

    return filteredEntries.map(entry => {
      const sessionId =
        (entry.metadata?.session_id as string | undefined) ||
        (entry.metadata?.sessionId as string | undefined)
      const responseId = entry.metadata?.hermes_response_id as
        | string
        | undefined
      const isHighlighted = Boolean(highlightMap[entry.entry_id])
      return (
        <div
          key={entry.entry_id}
          className={`diary-entry ${isHighlighted ? 'recent' : ''}`}
        >
          <div
            className="entry-marker"
            style={{ backgroundColor: getTypeColor(entry.entry_type) }}
          >
            <span className="entry-icon">{getTypeIcon(entry.entry_type)}</span>
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
              {entry.confidence != null && (
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
              {(sessionId || responseId) && (
                <div className="entry-links">
                  {sessionId && (
                    <button
                      className="session-chip"
                      onClick={() => updatePrefs({ sessionFilter: sessionId })}
                    >
                      Session: {sessionId.slice(0, 8)}
                    </button>
                  )}
                  {responseId && (
                    <span className="response-chip">
                      Hermes: {responseId.slice(0, 10)}
                    </span>
                  )}
                </div>
              )}
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <details className="entry-metadata-details">
                  <summary>Metadata</summary>
                  <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="persona-diary">
      <div className="diary-header">
        <h2>Persona Diary</h2>
        <div className="diary-status">
          <span className={`stream-pill ${connectionStatus}`}>
            {connectionStatus === 'online'
              ? 'Live stream'
              : connectionStatus === 'connecting'
                ? 'Connecting…'
                : connectionStatus === 'error'
                  ? 'Stream error'
                  : 'Offline'}
          </span>
          {error && (
            <span className="diary-error">
              API error: {error.message}. Showing cached entries.
            </span>
          )}
        </div>

        <div className="diary-controls">
          <input
            type="text"
            placeholder="Search entries..."
            value={searchTerm}
            onChange={e => updatePrefs({ searchTerm: e.target.value })}
            className="diary-search"
          />
          <select
            value={filterType}
            onChange={e => updatePrefs({ filterType: e.target.value })}
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
            onChange={e => updatePrefs({ filterSentiment: e.target.value })}
            className="diary-filter"
          >
            <option value="">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
            <option value="neutral">Neutral</option>
            <option value="mixed">Mixed</option>
          </select>
          <div className="diary-session-filter">
            <input
              type="text"
              placeholder="Session ID filter"
              value={sessionFilter}
              onChange={e => updatePrefs({ sessionFilter: e.target.value })}
            />
            {sessionFilter && (
              <button
                className="session-clear"
                onClick={() =>
                  updatePrefs({
                    sessionFilter: '',
                  })
                }
              >
                Clear
              </button>
            )}
          </div>
          <button
            onClick={() => setEntries(apiEntries ?? [])}
            className="diary-refresh"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="diary-stats">
          <span>Total Entries: {filteredEntries.length}</span>
          {isLoading && <span className="loading">Loading...</span>}
          <span>
            Latest:{' '}
            {latestTimestamp
              ? new Date(latestTimestamp).toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
      </div>

      <div className="diary-timeline">{renderEntries()}</div>

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

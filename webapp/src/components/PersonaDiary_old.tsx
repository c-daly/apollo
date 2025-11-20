import { useState, useEffect } from 'react'
import { usePersonaEntries } from '../hooks/useHCG'
import { hcgWebSocket } from '../lib/websocket-client'
import type { WebSocketMessage, PersonaEntry } from '../types/hcg'
import './PersonaDiary.css'

function PersonaDiary() {
  const [filterType, setFilterType] = useState<string>('')
  const [filterSentiment, setFilterSentiment] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Fetch persona entries from API
  const { data: apiEntries, refetch, isLoading, error } = usePersonaEntries({
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

  // Setup WebSocket for real-time diary updates
  useEffect(() => {
    hcgWebSocket.connect()

    const unsubscribe = hcgWebSocket.onMessage((message: WebSocketMessage) => {
      if (message.type === 'update' && message.data) {
        // Add new diary entry from WebSocket update
        const data = message.data as Record<string, unknown>
        if (data.entry_type && data.content) {
          const newEntry: PersonaEntry = {
            id: `ws-${Date.now()}`,
            timestamp: new Date().toISOString(),
            entry_type: (data.entry_type as 'belief' | 'decision' | 'observation' | 'reflection'),
            content: (data.content as string),
            summary: data.summary as string | undefined,
            sentiment: data.sentiment as ('positive' | 'negative' | 'neutral' | 'mixed') | undefined,
            confidence: data.confidence as number | undefined,
            related_process_ids: (data.related_process_ids as string[]) || [],
            related_goal_ids: (data.related_goal_ids as string[]) || [],
            emotion_tags: (data.emotion_tags as string[]) || [],
            metadata: (data.metadata as Record<string, unknown>) || {},
          }
          setEntries(prev => [newEntry, ...prev].slice(0, 100))

          // Refresh from API
          refetch()
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [refetch])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'belief':
        return '💭'
      case 'decision':
        return '⚡'
      case 'observation':
        return '👁️'
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
      default:
        return '#888'
    }
  }

  return (
    <div className="persona-diary">
      <div className="diary-header">
        <h2>Persona Diary</h2>
        <p className="diary-subtitle">
          Agent's internal reasoning and decision-making process
        </p>
        <div className="diary-stats">
          <span>Total Entries: {entries.length}</span>
          <span>
            Latest:{' '}
            {entries.length > 0
              ? entries[0].timestamp.toLocaleTimeString()
              : 'N/A'}
          </span>
        </div>
      </div>

      <div className="diary-timeline">
        {entries.map(entry => (
          <div key={entry.id} className="diary-entry">
            <div
              className="entry-marker"
              style={{ backgroundColor: getTypeColor(entry.type) }}
            >
              <span className="entry-icon">{getTypeIcon(entry.type)}</span>
            </div>
            <div className="entry-content">
              <div className="entry-header">
                <span
                  className="entry-type"
                  style={{ color: getTypeColor(entry.type) }}
                >
                  {entry.type.charAt(0).toUpperCase() + entry.type.slice(1)}
                </span>
                <span className="entry-timestamp">
                  {entry.timestamp.toLocaleString()}
                </span>
              </div>
              <div className="entry-text">{entry.content}</div>
            </div>
          </div>
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

import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { type ElementDefinition } from 'cytoscape'
import dagre from 'cytoscape-dagre'
import { useGraphSnapshot } from '../hooks/useHCG'
import type { GraphSnapshot } from '../types/hcg'
import {
  summarizeSnapshot,
  computeWorldDeltas,
  formatPosition,
  type WorldDelta,
  type WorldDeltaType,
  type WorldEntitySummary,
} from '../lib/world-state'
import './GraphViewer.css'

cytoscape.use(dagre)

const AUTO_REFRESH_OPTIONS = [
  { label: '5s', value: 5000 },
  { label: '15s', value: 15000 },
  { label: '60s', value: 60000 },
]

const HIGHLIGHT_TTL = 8000
const DELTA_HISTORY_LIMIT = 25

type HighlightEntry = { type: WorldDeltaType; timestamp: number }
type TimedDelta = WorldDelta & { timestamp: number }

// Mock data for demo/fallback when API is unavailable
const createMockSnapshot = (): GraphSnapshot => ({
  entities: [
    {
      id: 'goal_1',
      type: 'goal',
      properties: {
        name: 'Navigate to Kitchen',
        priority: 'high',
        status: 'active',
      },
      labels: ['Goal'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'plan_1',
      type: 'plan',
      properties: { name: 'Kitchen Navigation Plan', status: 'executing' },
      labels: ['Plan'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'agent_1',
      type: 'agent',
      properties: { name: 'Hermes Bot', status: 'moving', x: 1, y: 1 },
      labels: ['Agent'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'step_1',
      type: 'step',
      properties: { name: 'Move forward', order: 1, status: 'completed' },
      labels: ['Step'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'step_2',
      type: 'step',
      properties: { name: 'Turn left', order: 2, status: 'in_progress' },
      labels: ['Step'],
      created_at: new Date().toISOString(),
    },
    {
      id: 'state_1',
      type: 'state',
      properties: { name: 'Current Position', x: 10, y: 5 },
      labels: ['State'],
      created_at: new Date().toISOString(),
    },
  ],
  edges: [
    {
      id: 'edge_1',
      source_id: 'goal_1',
      target_id: 'plan_1',
      edge_type: 'generates',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_2',
      source_id: 'plan_1',
      target_id: 'step_1',
      edge_type: 'contains',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_3',
      source_id: 'plan_1',
      target_id: 'step_2',
      edge_type: 'contains',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_4',
      source_id: 'step_2',
      target_id: 'state_1',
      edge_type: 'updates',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
    {
      id: 'edge_5',
      source_id: 'agent_1',
      target_id: 'state_1',
      edge_type: 'occupies',
      properties: {},
      weight: 1.0,
      created_at: new Date().toISOString(),
    },
  ],
  timestamp: new Date().toISOString(),
  metadata: {
    entity_count: 6,
    edge_count: 5,
    entity_types: ['goal', 'plan', 'agent', 'state'],
  },
})

function GraphViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousSummaryRef = useRef<Map<string, WorldEntitySummary>>(new Map())
  const [cyInstance, setCyInstance] = useState<cytoscape.Core | null>(null)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(
    AUTO_REFRESH_OPTIONS[0].value
  )
  const [focusEntityId, setFocusEntityId] = useState('')
  const [recentDeltas, setRecentDeltas] = useState<TimedDelta[]>([])
  const [highlightMap, setHighlightMap] = useState<
    Record<string, HighlightEntry>
  >({})

  const {
    data: apiSnapshot,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useGraphSnapshot({
    entityTypes: entityTypeFilter.length ? entityTypeFilter : undefined,
    refetchInterval: autoRefresh ? refreshInterval : false,
  })

  const snapshot = useMemo(() => {
    if (apiSnapshot) return apiSnapshot
    if (error) return createMockSnapshot()
    return null
  }, [apiSnapshot, error])

  const usingMockData = !apiSnapshot && !!snapshot && !!error
  const summaryMap = useMemo(
    () => (snapshot ? summarizeSnapshot(snapshot) : null),
    [snapshot]
  )
  const summaries = useMemo(
    () => (summaryMap ? Array.from(summaryMap.values()) : []),
    [summaryMap]
  )
  const agentSummaries = useMemo(
    () => summaries.filter(summary => summary.type === 'agent'),
    [summaries]
  )
  const planSummaries = useMemo(
    () => summaries.filter(summary => summary.type === 'plan'),
    [summaries]
  )
  const focusOptions = useMemo(
    () => [...agentSummaries, ...planSummaries],
    [agentSummaries, planSummaries]
  )

  useEffect(() => {
    if (!summaryMap) return

    if (usingMockData) {
      previousSummaryRef.current = new Map()
      setRecentDeltas([])
      setHighlightMap({})
      return
    }

    const previous = previousSummaryRef.current
    if (previous.size === 0) {
      previousSummaryRef.current = new Map(summaryMap)
      return
    }

    const deltas = computeWorldDeltas(previous, summaryMap)
    if (deltas.length) {
      const timestamp = Date.now()
      const timed = deltas.map(delta => ({ ...delta, timestamp }))
      setRecentDeltas(prev => [...timed, ...prev].slice(0, DELTA_HISTORY_LIMIT))
      setHighlightMap(prev => {
        const next = { ...prev }
        timed.forEach(delta => {
          next[delta.id] = { type: delta.type, timestamp: delta.timestamp }
        })
        return next
      })
    }
    previousSummaryRef.current = new Map(summaryMap)
  }, [summaryMap, usingMockData])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setHighlightMap(prev => {
        let mutated = false
        const next: Record<string, HighlightEntry> = {}
        Object.entries(prev).forEach(([id, entry]) => {
          if (now - entry.timestamp < HIGHLIGHT_TTL) {
            next[id] = entry
          } else {
            mutated = true
          }
        })
        return mutated ? next : prev
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !snapshot) return

    const nodes = snapshot.entities.map(entity => {
      const { source, target, ...safeProps } = (entity.properties || {}) as Record<string, unknown>
      const label =
        (safeProps.name as string) ||
        (safeProps.description as string) ||
        (entity.id as string)
      const status =
        typeof safeProps.status === 'string'
          ? safeProps.status.toLowerCase()
          : undefined
      const highlight = highlightMap[entity.id]
      return {
        data: {
          id: entity.id,
          label,
          type: entity.type,
          status,
          recent: highlight ? highlight.type : undefined,
          provenance_source: source,
          provenance_target: target,
          ...safeProps,
        },
      }
    })

    const edges = snapshot.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source_id,
        target: edge.target_id,
        type: edge.edge_type,
        label: edge.edge_type,
        weight: edge.weight,
      },
    }))

    const searchFiltered = filterBySearch(nodes, edges, searchQuery)
    const focusFiltered = filterByFocus(
      searchFiltered.nodes,
      searchFiltered.edges,
      focusEntityId
    )

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...focusFiltered.nodes, ...focusFiltered.edges],
      style: getGraphStyles(),
      layout: {
        name: 'dagre',
        // @ts-expect-error - dagre layout options are not fully typed
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 100,
      },
    })

    cy.on('tap', 'node', evt => {
      setSelectedNode(evt.target.id())
    })

    setCyInstance(cy)

    return () => {
      cy.destroy()
    }
  }, [snapshot, searchQuery, focusEntityId, highlightMap])

  const handleRefresh = () => {
    refetch()
  }

  const toggleEntityType = (type: string) => {
    setEntityTypeFilter(prev =>
      prev.includes(type)
        ? prev.filter(value => value !== type)
        : [...prev, type]
    )
  }

  const selectedNodeData = selectedNode
    ? snapshot?.entities.find(entity => entity.id === selectedNode)
    : null

  const lastUpdated = snapshot?.timestamp
    ? new Date(snapshot.timestamp).toLocaleTimeString()
    : '—'
  return (
    <div className="graph-viewer">
      <div className="graph-toolbar">
        <div className="graph-toolbar-row">
          <div className="graph-search">
            <input
              type="text"
              placeholder="Search nodes…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="graph-focus">
            <select
              value={focusEntityId}
              onChange={e => setFocusEntityId(e.target.value)}
            >
              <option value="">Focus: All entities</option>
              {focusOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.type})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="graph-toolbar-row graph-filters-row">
          {['goal', 'plan', 'agent', 'state', 'process', 'step'].map(type => (
            <label key={type}>
              <input
                type="checkbox"
                checked={entityTypeFilter.includes(type)}
                onChange={() => toggleEntityType(type)}
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
        <div className="graph-toolbar-row graph-controls-row">
          <div className="graph-refresh-controls">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              disabled={!autoRefresh}
            >
              {AUTO_REFRESH_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="graph-status-chip">
              {isFetching ? 'Updating…' : `Last update ${lastUpdated}`}
            </span>
          </div>
          <div className="graph-controls">
            <button onClick={handleRefresh} disabled={isFetching || isLoading}>
              Manual Refresh
            </button>
            <button onClick={() => cyInstance?.fit(undefined, 50)}>
              Fit View
            </button>
            <button
              onClick={() => cyInstance?.zoom((cyInstance.zoom() ?? 1) * 1.2)}
            >
              Zoom In
            </button>
            <button
              onClick={() => cyInstance?.zoom((cyInstance.zoom() ?? 1) * 0.8)}
            >
              Zoom Out
            </button>
          </div>
        </div>
      </div>

      {usingMockData && (
        <div className="graph-info">
          ⚠️ HCG API unavailable — displaying cached demo data.
        </div>
      )}
      {error && !snapshot && (
        <div className="graph-error">
          Unable to load HCG snapshot. Check the API service and retry.
        </div>
      )}
      {isLoading && (
        <div className="graph-loading">Loading world state snapshot…</div>
      )}

      <div className="graph-content">
        <div className="graph-container" ref={containerRef}></div>

        <div className="graph-legend">
          <h3>Legend</h3>
          {renderLegendItem('#4ade80', 'Goal')}
          {renderLegendItem('#60a5fa', 'Plan')}
          {renderLegendItem('#a78bfa', 'Step')}
          {renderLegendItem('#f59e0b', 'State')}
          {renderLegendItem('#ef4444', 'Process')}
          {renderLegendItem('#38bdf8', 'Agent')}
          {snapshot && (
            <div className="legend-stats">
              <div>Nodes: {snapshot.entities.length}</div>
              <div>Edges: {snapshot.edges.length}</div>
            </div>
          )}
        </div>
      </div>

      <div className="world-state-panels">
        {selectedNodeData && (
          <div className="world-card node-details-card">
            <div className="world-card-header">
              <h3>Node Details</h3>
              <button className="close-btn" onClick={() => setSelectedNode(null)}>
                ×
              </button>
            </div>
            <div className="node-details-content">
              <div className="detail-item">
                <strong>ID:</strong> <span>{selectedNodeData.id}</span>
              </div>
              <div className="detail-item">
                <strong>Type:</strong> <span>{selectedNodeData.type}</span>
              </div>
              <div className="detail-item">
                <strong>Labels:</strong> <span>{selectedNodeData.labels.join(', ')}</span>
              </div>
              <div className="detail-item detail-properties">
                <strong>Properties:</strong>
                <pre>{JSON.stringify(selectedNodeData.properties, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}

        <div className="world-card">
          <div className="world-card-header">
            <h3>Agents</h3>
            <span>{agentSummaries.length}</span>
          </div>
          {agentSummaries.length ? (
            <div className="world-table-wrapper">
              <table className="world-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {agentSummaries.slice(0, 6).map(agent => (
                    <tr key={agent.id}>
                      <td>{agent.name}</td>
                      <td>
                        <span className={`status-pill ${agent.status ?? ''}`}>
                          {agent.status ?? '—'}
                        </span>
                      </td>
                      <td>{formatPosition(agent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="world-empty">No agents detected.</div>
          )}
        </div>

        <div className="world-card">
          <div className="world-card-header">
            <h3>Plans</h3>
            <span>{planSummaries.length}</span>
          </div>
          {planSummaries.length ? (
            <div className="world-table-wrapper">
              <table className="world-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Node ID</th>
                  </tr>
                </thead>
                <tbody>
                  {planSummaries.slice(0, 6).map(plan => (
                    <tr key={plan.id}>
                      <td>{plan.name}</td>
                      <td>
                        <span className={`status-pill ${plan.status ?? ''}`}>
                          {plan.status ?? '—'}
                        </span>
                      </td>
                      <td className="world-id">{plan.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="world-empty">No plans recorded.</div>
          )}
        </div>

        <div className="world-card">
          <div className="world-card-header">
            <h3>Recent Changes</h3>
          </div>
          {recentDeltas.length ? (
            <ul className="world-changes">
              {recentDeltas.map(delta => (
                <li key={`${delta.id}-${delta.timestamp}`}>
                  <span className={`change-pill ${delta.type}`}>
                    {delta.type}
                  </span>
                  <span className="change-label">{delta.label}</span>
                  <span className="change-time">
                    {timeAgo(delta.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="world-empty">No recent updates detected.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function filterBySearch(
  nodes: ElementDefinition[],
  edges: ElementDefinition[],
  query: string
) {
  if (!query.trim()) {
    return { nodes, edges }
  }
  const lowered = query.toLowerCase()
  const filteredNodes = nodes.filter(node => {
    const data = node.data as Record<string, unknown>
    const label = String(data.label ?? '')
    const type = String(data.type ?? '')
    const id = String(data.id ?? '')
    return (
      label.toLowerCase().includes(lowered) ||
      type.toLowerCase().includes(lowered) ||
      id.toLowerCase().includes(lowered)
    )
  })
  const nodeIds = new Set(filteredNodes.map(node => String(node.data?.id)))
  const filteredEdges = edges.filter(edge => {
    const data = edge.data as Record<string, unknown>
    return nodeIds.has(String(data.source)) && nodeIds.has(String(data.target))
  })
  return { nodes: filteredNodes, edges: filteredEdges }
}

function filterByFocus(
  nodes: ElementDefinition[],
  edges: ElementDefinition[],
  focusId: string
) {
  if (!focusId) {
    return { nodes, edges }
  }
  const related = new Set<string>([focusId])
  edges.forEach(edge => {
    const data = edge.data as Record<string, unknown>
    if (data.source === focusId || data.target === focusId) {
      related.add(String(data.source))
      related.add(String(data.target))
    }
  })
  const filteredNodes = nodes.filter(node => related.has(String(node.data?.id)))
  const filteredEdges = edges.filter(edge => {
    const data = edge.data as Record<string, unknown>
    return related.has(String(data.source)) && related.has(String(data.target))
  })
  return { nodes: filteredNodes, edges: filteredEdges }
}

function renderLegendItem(color: string, label: string) {
  return (
    <div className="legend-item">
      <span className="legend-color" style={{ backgroundColor: color }}></span>
      <span>{label}</span>
    </div>
  )
}

function getGraphStyles(): cytoscape.StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        'background-color': '#646cff',
        label: 'data(label)',
        color: '#fff',
        'text-valign': 'center',
        'text-halign': 'center',
        width: '75px',
        height: '75px',
        'font-size': '11px',
        'text-wrap': 'wrap',
        'text-max-width': '70px',
      },
    },
    {
      selector: 'node[type="goal"]',
      style: {
        'background-color': '#4ade80',
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'node[type="plan"]',
      style: {
        'background-color': '#60a5fa',
        shape: 'round-rectangle',
      },
    },
    {
      selector: 'node[type="agent"]',
      style: {
        'background-color': '#38bdf8',
        shape: 'ellipse',
      },
    },
    {
      selector: 'node[type="state"]',
      style: {
        'background-color': '#f59e0b',
        shape: 'diamond',
      },
    },
    {
      selector: 'node[type="process"]',
      style: {
        'background-color': '#ef4444',
        shape: 'rectangle',
      },
    },
    {
      selector: 'node[status = "completed"]',
      style: {
        'background-color': '#22c55e',
      },
    },
    {
      selector: 'node[status = "failed"]',
      style: {
        'background-color': '#ef4444',
      },
    },
    {
      selector: 'node[recent = "added"]',
      style: {
        'border-color': '#4ade80',
        'border-width': 4,
      },
    },
    {
      selector: 'node[recent = "status"]',
      style: {
        'border-color': '#facc15',
        'border-width': 4,
      },
    },
    {
      selector: 'node[recent = "position"]',
      style: {
        'border-color': '#38bdf8',
        'border-width': 4,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#fff',
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': '#888',
        'target-arrow-color': '#888',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '10px',
        'text-rotation': 'autorotate',
        color: '#999',
      },
    },
  ] as cytoscape.StylesheetJson
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

export default GraphViewer

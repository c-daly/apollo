/**
 * HCG Explorer - Multi-modal knowledge graph visualization
 *
 * A sophisticated visualization tool for Sophia's Hierarchical Causal Graph
 * with 2D and 3D rendering modes, semantic clustering, and temporal playback.
 */

import { useEffect, useMemo, useCallback, useState, useRef, type ChangeEvent } from 'react'
import { useHCGSnapshot, type HCGGraphSnapshot } from '../../hooks/useHCG'
import { HCGExplorerProvider, useHCGExplorer } from './context'
import { ThreeRenderer } from './renderers/ThreeRenderer'
import { CytoscapeRenderer } from './renderers/CytoscapeRenderer'
import {
  buildGraph,
  deriveTypeSummaries,
  type GraphMode,
  type TypeSummary,
} from './utils/graph-processor'
import { generateMockSnapshot } from './utils/mock-data'
import type {
  LayoutType,
  ViewMode,
  GraphNode,
  ProcessedGraph,
  GraphSnapshot,
} from './types'
import { NODE_COLORS, DEFAULT_FILTER_CONFIG } from './types'
import './HCGExplorer.css'

/** Convert HCGGraphSnapshot to our internal GraphSnapshot type (keeps all entities) */
function convertSnapshot(hcg: HCGGraphSnapshot): GraphSnapshot {
  return {
    entities: hcg.entities.map(e => ({
      id: e.id,
      type: e.type,
      name: e.name,
      properties: e.properties,
      labels: e.labels || [],
      created_at: e.created_at,
      embedding: e.embedding,
    })),
    edges: hcg.edges.map(e => ({
      id: e.id,
      source_id: e.source_id,
      target_id: e.target_id,
      edge_type: e.edge_type,
      properties: e.properties,
      weight: e.weight as number,
      created_at: new Date().toISOString(),
    })),
    timestamp: hcg.timestamp || new Date().toISOString(),
    metadata: {
      entity_count: hcg.entity_count,
      edge_count: hcg.edge_count,
    },
  }
}

/** Available layouts for each view mode */
const LAYOUTS_2D: LayoutType[] = ['dagre', 'fcose', 'circle', 'concentric', 'breadthfirst']
const LAYOUTS_3D: LayoutType[] = ['force-3d', 'semantic']

/** Layout display names */
const LAYOUT_NAMES: Record<LayoutType, string> = {
  dagre: 'Hierarchical',
  fcose: 'Force-Directed',
  circle: 'Circle',
  concentric: 'Concentric',
  breadthfirst: 'Tree',
  'force-3d': 'Force 3D',
  semantic: 'Semantic',
}

/** Well-known entity types shown first in filter bar (incl. the NDT realms
 * entity/concept/process that sophia's realm-triage stamps on ingested nodes) */
const KNOWN_ENTITY_TYPES = ['goal', 'plan', 'step', 'action', 'state', 'process', 'entity', 'concept', 'agent', 'object', 'location', 'workspace', 'zone', 'simulation']

export interface HCGExplorerProps {
  /** Initial view mode */
  defaultViewMode?: ViewMode
  /** Initial layout */
  defaultLayout?: LayoutType
  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number
  /** CSS class name */
  className?: string
}

/** Main explorer component (wrapped with provider) */
export function HCGExplorer(props: HCGExplorerProps) {
  return (
    <HCGExplorerProvider>
      <HCGExplorerInner {...props} />
    </HCGExplorerProvider>
  )
}

/** Inner component with access to context */
function HCGExplorerInner({
  defaultViewMode = '3d',
  defaultLayout,
  refreshInterval = 15000,
  className = '',
}: HCGExplorerProps) {
  const {
    state,
    setViewMode,
    setLayout,
    setFilter,
    resetFilters,
    selectNode,
    hoverNode,
    addSnapshot,
    setTimelineIndex,
    togglePlayback,
  } = useHCGExplorer()

  const {
    viewMode,
    layout,
    filterConfig,
    currentSnapshot,
    snapshotHistory,
    timelineIndex,
    selectedNodeId,
    hoveredNodeId,
    isPlaying,
    showNodeDetails,
  } = state

  // Initialize view mode and layout
  useEffect(() => {
    if (defaultViewMode) {
      setViewMode(defaultViewMode)
    }
    if (defaultLayout) {
      setLayout(defaultLayout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount - intentionally omitting deps

  // Track if using mock data
  const [usingMockData, setUsingMockData] = useState(false)

  // Which representation to render:
  // - 'logical' (default): the graph as meant to be seen (reified edges collapsed)
  // - 'reified': the graph as stored (every edge is a node — "all nodes")
  const [graphMode, setGraphMode] = useState<GraphMode>('logical')

  // Fetch graph data
  const {
    data: apiSnapshot,
    isLoading,
    error,
    refetch,
  } = useHCGSnapshot({
    entityTypes: filterConfig.entityTypes.length
      ? filterConfig.entityTypes
      : undefined,
    // The explorer loads the whole graph for its semantic layout; request the
    // high limit explicitly so the shared hook's default stays small for other
    // callers (e.g. GraphViewer) (greptile #186).
    limit: 10000,
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  })

  // Track whether we've loaded any data (for mock fallback decision).
  // Using a ref avoids including currentSnapshot in the dep array,
  // which would re-trigger the effect every time we add a snapshot.
  const hasDataRef = useRef(false)

  // Add new snapshots to history (with mock fallback)
  useEffect(() => {
    if (apiSnapshot) {
      setUsingMockData(false)
      hasDataRef.current = true
      addSnapshot(convertSnapshot(apiSnapshot))
    } else if (error && !hasDataRef.current) {
      // Fallback to mock data if API fails and we have no data
      console.log('HCG API unavailable, using mock data')
      setUsingMockData(true)
      hasDataRef.current = true
      addSnapshot(generateMockSnapshot())
    }
  }, [apiSnapshot, error, addSnapshot])

  // Process graph data for rendering. The chosen view (logical vs reified) is
  // applied by buildGraph; see graph-processor for the two transforms.
  const processedGraph = useMemo<ProcessedGraph>(() => {
    if (!currentSnapshot) {
      return { nodes: [], edges: [], clusters: [] }
    }
    return buildGraph(currentSnapshot, graphMode, filterConfig)
  }, [currentSnapshot, filterConfig, graphMode])

  // Derive entity types from the rendered graph, ordered by known types first.
  const entityTypes = useMemo<string[]>(() => {
    if (!currentSnapshot) return KNOWN_ENTITY_TYPES
    // Reflect ALL types present in the current view, independent of the active
    // search / status / property filters — otherwise the type buttons vanish as
    // you type a search. Using DEFAULT_FILTER_CONFIG also drops the filterConfig
    // dependency, so this no longer rebuilds the whole graph on every keystroke.
    const seen = new Set(
      buildGraph(currentSnapshot, graphMode, DEFAULT_FILTER_CONFIG).nodes.map(
        n => n.type
      )
    )
    const ordered = KNOWN_ENTITY_TYPES.filter(t => seen.has(t))
    for (const t of seen) {
      if (!ordered.includes(t)) ordered.push(t)
    }
    return ordered
  }, [currentSnapshot, graphMode])

  // Flat, IS_A-driven type list for the Types panel. Counts come from IS_A
  // edges (deriveTypeSummaries), independent of the realm-based entityTypes.
  const typeSummaries = useMemo<TypeSummary[]>(
    () => (currentSnapshot ? deriveTypeSummaries(currentSnapshot) : []),
    [currentSnapshot]
  )

  // Local text filter for the Types list (filters the rows, not the graph).
  const [typeSearch, setTypeSearch] = useState('')

  const visibleTypeSummaries = useMemo<TypeSummary[]>(() => {
    const q = typeSearch.trim().toLowerCase()
    if (!q) return typeSummaries
    return typeSummaries.filter(t => t.name.toLowerCase().includes(q))
  }, [typeSummaries, typeSearch])

  // Single-select an emergent type (click the active row again to clear it).
  const handleTypeSelect = useCallback(
    (id: string) => {
      setFilter({
        selectedTypeId: filterConfig.selectedTypeId === id ? null : id,
      })
    },
    [filterConfig.selectedTypeId, setFilter]
  )

  const handleTypeClear = useCallback(() => {
    setFilter({ selectedTypeId: null })
  }, [setFilter])

  // Get available layouts based on view mode
  const availableLayouts = viewMode === '3d' ? LAYOUTS_3D : LAYOUTS_2D

  // Find selected node data
  const selectedNode = useMemo<GraphNode | null>(() => {
    if (!selectedNodeId) return null
    return processedGraph.nodes.find(n => n.id === selectedNodeId) || null
  }, [selectedNodeId, processedGraph.nodes])

  // Handle view mode change
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode)
    },
    [setViewMode]
  )

  // Handle layout change
  const handleLayoutChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setLayout(e.target.value as LayoutType)
    },
    [setLayout]
  )

  // Handle search
  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setFilter({ searchQuery: e.target.value })
    },
    [setFilter]
  )

  // Handle entity type filter toggle
  const handleTypeToggle = useCallback(
    (type: string) => {
      const current = filterConfig.entityTypes
      const updated = current.includes(type)
        ? current.filter(t => t !== type)
        : [...current, type]
      setFilter({ entityTypes: updated })
    },
    [filterConfig.entityTypes, setFilter]
  )

  // Handle timeline change
  const handleTimelineChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setTimelineIndex(parseInt(e.target.value, 10))
    },
    [setTimelineIndex]
  )

  // Playback effect
  useEffect(() => {
    if (!isPlaying || snapshotHistory.length === 0) return

    const interval = setInterval(() => {
      setTimelineIndex(
        timelineIndex < snapshotHistory.length - 1 ? timelineIndex + 1 : 0
      )
    }, 1000 / state.playbackSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, timelineIndex, snapshotHistory.length, state.playbackSpeed, setTimelineIndex])

  // Format timestamp for display
  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString()
    } catch {
      return ts
    }
  }

  return (
    <div className={`hcg-explorer ${className}`}>
      {/* Toolbar */}
      <div className="hcg-toolbar">
        {/* View Mode Toggle */}
        <div className="hcg-toolbar-group">
          <label>View</label>
          <button
            className={`hcg-btn ${viewMode === '2d' ? 'hcg-btn--active' : ''}`}
            onClick={() => handleViewModeChange('2d')}
          >
            2D
          </button>
          <button
            className={`hcg-btn ${viewMode === '3d' ? 'hcg-btn--active' : ''}`}
            onClick={() => handleViewModeChange('3d')}
          >
            3D
          </button>
        </div>

        <div className="hcg-toolbar-divider" />

        {/* Layout Selector */}
        <div className="hcg-toolbar-group">
          <label>Layout</label>
          <select
            className="hcg-select"
            value={layout}
            onChange={handleLayoutChange}
          >
            {availableLayouts.map(l => (
              <option key={l} value={l}>
                {LAYOUT_NAMES[l]}
              </option>
            ))}
          </select>
        </div>

        <div className="hcg-toolbar-divider" />

        {/* Search */}
        <div className="hcg-toolbar-group">
          <input
            type="text"
            className="hcg-input hcg-input--search"
            placeholder="Search nodes..."
            value={filterConfig.searchQuery}
            onChange={handleSearchChange}
          />
        </div>

        <div className="hcg-toolbar-divider" />

        {/* Entity Type Filters */}
        <div className="hcg-toolbar-group">
          {entityTypes.map(type => (
            <button
              key={type}
              className={`hcg-btn ${filterConfig.entityTypes.includes(type) ? 'hcg-btn--active' : ''}`}
              onClick={() => handleTypeToggle(type)}
              style={{
                borderColor: filterConfig.entityTypes.includes(type)
                  ? NODE_COLORS[type]
                  : undefined,
              }}
            >
              {type}
            </button>
          ))}
          {filterConfig.entityTypes.length > 0 && (
            <button className="hcg-btn" onClick={resetFilters}>
              Clear
            </button>
          )}
        </div>

        <div className="hcg-toolbar-divider" />

        {/* Graph representation: logical (as meant to be seen) vs reified
            (as stored — every edge is a node). */}
        <div className="hcg-toolbar-group">
          <label>Representation</label>
          <button
            className={`hcg-btn ${graphMode === 'logical' ? 'hcg-btn--active' : ''}`}
            onClick={() => {
              setGraphMode('logical')
              // Switching representation clears the entity-type filter so a
              // filter set in one view can't silently hide nodes in the other
              // (notably reified edge-nodes, type 'edge').
              setFilter({ entityTypes: [] })
            }}
            title="The graph as meant to be seen: relations rendered as edges"
          >
            Data
          </button>
          <button
            className={`hcg-btn ${graphMode === 'reified' ? 'hcg-btn--active' : ''}`}
            onClick={() => {
              setGraphMode('reified')
              setFilter({ entityTypes: [] })
            }}
            title="The graph as stored: every edge is itself a node"
          >
            All nodes
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Refresh */}
        <div className="hcg-toolbar-group">
          <button
            className="hcg-btn"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Mock data banner */}
      {usingMockData && (
        <div className="hcg-mock-banner">
          HCG API unavailable - displaying sophisticated mock data for development
        </div>
      )}

      {/* Main Content */}
      <div className="hcg-content">
        {/* Canvas */}
        <div className="hcg-canvas">
          {isLoading && !currentSnapshot && (
            <div className="hcg-loading">
              <div className="hcg-loading-spinner" />
            </div>
          )}

          {error && !currentSnapshot && !usingMockData && (
            <div className="hcg-error">
              <div className="hcg-error-icon">!</div>
              <div className="hcg-error-message">
                Failed to load graph data. Check API connection.
              </div>
              <button className="hcg-btn" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}

          {currentSnapshot && viewMode === '3d' && (
            <ThreeRenderer
              graph={processedGraph}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onNodeSelect={selectNode}
              onNodeHover={hoverNode}
              layout={layout}
            />
          )}

          {currentSnapshot && viewMode === '2d' && (
            <CytoscapeRenderer
              graph={processedGraph}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onNodeSelect={selectNode}
              onNodeHover={hoverNode}
              layout={layout}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="hcg-sidebar">
          {/* Node Details Panel */}
          {showNodeDetails && (
            <div className="hcg-panel">
              <div className="hcg-panel-header">
                <span className="hcg-panel-title">Node Details</span>
              </div>
              <div className="hcg-panel-content">
                {selectedNode ? (
                  <div className="hcg-node-details">
                    <div className="hcg-detail-row">
                      <span className="hcg-detail-label">ID</span>
                      <span className="hcg-detail-value">{selectedNode.id}</span>
                    </div>
                    <div className="hcg-detail-row">
                      <span className="hcg-detail-label">Type</span>
                      <span className="hcg-detail-value">
                        <span
                          className={`hcg-detail-type hcg-detail-type--${selectedNode.type}`}
                        >
                          {selectedNode.type}
                        </span>
                      </span>
                    </div>
                    <div className="hcg-detail-row">
                      <span className="hcg-detail-label">Label</span>
                      <span className="hcg-detail-value">{selectedNode.label}</span>
                    </div>
                    {selectedNode.status && (
                      <div className="hcg-detail-row">
                        <span className="hcg-detail-label">Status</span>
                        <span className="hcg-detail-value">
                          <span
                            className={`hcg-detail-status hcg-detail-status--${selectedNode.status}`}
                          >
                            {selectedNode.status}
                          </span>
                        </span>
                      </div>
                    )}
                    <div className="hcg-properties">
                      {JSON.stringify(selectedNode.properties, null, 2)}
                    </div>
                  </div>
                ) : (
                  <div className="hcg-node-details-empty">
                    Click a node to view details
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legend Panel */}
          <div className="hcg-panel">
            <div className="hcg-panel-header">
              <span className="hcg-panel-title">Legend</span>
            </div>
            <div className="hcg-panel-content">
              <div className="hcg-legend">
                {entityTypes.map(type => (
                  <div key={type} className="hcg-legend-item">
                    <span
                      className="hcg-legend-color"
                      style={{ backgroundColor: NODE_COLORS[type] }}
                    />
                    <span>{type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Types Panel - flat, IS_A-driven emergent type filter.
              Membership comes from IS_A edges, not node.type (post-NDT
              node.type is only the realm), so emergent type names show here. */}
          <div className="hcg-panel">
            <div className="hcg-panel-header">
              <span className="hcg-panel-title">Types</span>
              {filterConfig.selectedTypeId && (
                <button
                  className="hcg-btn hcg-btn--icon"
                  onClick={handleTypeClear}
                  title="Show all (clear type filter)"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="hcg-panel-content">
              <input
                type="text"
                className="hcg-input hcg-type-search"
                placeholder="Filter types..."
                value={typeSearch}
                onChange={e => setTypeSearch(e.target.value)}
              />
              <div className="hcg-types">
                {visibleTypeSummaries.length === 0 ? (
                  <div className="hcg-node-details-empty">No types</div>
                ) : (
                  visibleTypeSummaries.map(t => (
                    <button
                      key={t.id}
                      className={`hcg-type-row ${filterConfig.selectedTypeId === t.id ? 'hcg-type-row--active' : ''}`}
                      onClick={() => handleTypeSelect(t.id)}
                      title={t.name}
                    >
                      <span className="hcg-type-name">{t.name}</span>
                      <span className="hcg-type-count">{t.count}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Stats Panel */}
          <div className="hcg-panel">
            <div className="hcg-panel-header">
              <span className="hcg-panel-title">Stats</span>
            </div>
            <div className="hcg-panel-content">
              <div className="hcg-stat">
                <span>Nodes:</span>
                <span className="hcg-stat-value">
                  {processedGraph.nodes.length}
                </span>
              </div>
              <div className="hcg-stat">
                <span>Edges:</span>
                <span className="hcg-stat-value">
                  {processedGraph.edges.length}
                </span>
              </div>
              <div className="hcg-stat">
                <span>Clusters:</span>
                <span className="hcg-stat-value">
                  {processedGraph.clusters.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {snapshotHistory.length > 1 && (
        <div className="hcg-timeline">
          <div className="hcg-timeline-controls">
            <button
              className="hcg-btn hcg-btn--icon"
              onClick={() => setTimelineIndex(Math.max(0, timelineIndex - 1))}
              disabled={timelineIndex <= 0}
            >
              {'<'}
            </button>
            <button
              className={`hcg-btn hcg-btn--icon ${isPlaying ? 'hcg-btn--active' : ''}`}
              onClick={togglePlayback}
            >
              {isPlaying ? '||' : '>'}
            </button>
            <button
              className="hcg-btn hcg-btn--icon"
              onClick={() =>
                setTimelineIndex(
                  Math.min(snapshotHistory.length - 1, timelineIndex + 1)
                )
              }
              disabled={timelineIndex >= snapshotHistory.length - 1}
            >
              {'>'}
            </button>
          </div>
          <input
            type="range"
            className="hcg-timeline-slider"
            min={0}
            max={snapshotHistory.length - 1}
            value={timelineIndex}
            onChange={handleTimelineChange}
          />
          <span className="hcg-timeline-time">
            {timelineIndex >= 0 && snapshotHistory[timelineIndex]
              ? formatTime(snapshotHistory[timelineIndex].timestamp)
              : '--:--:--'}
          </span>
        </div>
      )}

      {/* Status Bar */}
      <div className="hcg-stats">
        <div className="hcg-stat">
          <span>Snapshot:</span>
          <span className="hcg-stat-value">
            {timelineIndex + 1} / {snapshotHistory.length}
          </span>
        </div>
        {currentSnapshot?.timestamp && (
          <div className="hcg-stat">
            <span>Updated:</span>
            <span className="hcg-stat-value">
              {formatTime(currentSnapshot.timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default HCGExplorer

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
import { processGraph } from './utils/graph-processor'
import { generateMockSnapshot } from './utils/mock-data'
import type {
  LayoutType,
  ViewMode,
  GraphNode,
  ProcessedGraph,
  GraphSnapshot,
  CausalEdge,
} from './types'
import { NODE_COLORS } from './types'
import './HCGExplorer.css'

/** Check if an entity is an entity-type definition (ontology metadata, not data).
 *  Sophia's seeder creates type-def nodes with uuid prefix "type_"
 *  (e.g. id="type_object", name="object", type="physical_entity").
 *  Note: the entity's `type` field is the PARENT type, not the type it defines. */
function isEntityTypeDef(e: { id: string }): boolean {
  return e.id.startsWith('type_') && !e.id.startsWith('type_edge_')
}

/** Check if an entity is an edge-type definition (e.g. type_edge_located_at).
 *  These are already represented as edges in the graph and should never
 *  appear as nodes. */
function isEdgeTypeDef(e: { id: string }): boolean {
  return e.id.startsWith('type_edge_')
}

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

/** Well-known entity types shown first in filter bar */
const KNOWN_ENTITY_TYPES = ['goal', 'plan', 'step', 'action', 'state', 'process', 'agent', 'object', 'location', 'workspace', 'zone', 'simulation']

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

  // Toggle to hide ontology type-definition nodes (on by default)
  const [hideTypeDefs, setHideTypeDefs] = useState(true)

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

  // Process graph data for rendering.
  // - Edge-type-defs are always excluded (they're already represented as edges).
  // - Entity-type-defs are shown/hidden via the hideTypeDefs toggle.
  // - When entity-type-defs are shown, synthetic INSTANCE_OF edges are added
  //   because Sophia stores type hierarchy as node properties, not :RELATION edges.
  const processedGraph = useMemo<ProcessedGraph>(() => {
    if (!currentSnapshot) {
      return { nodes: [], edges: [], clusters: [] }
    }
    // Always strip edge-type-def nodes — they manifest as edges, not nodes.
    let entities = currentSnapshot.entities.filter(e => !isEdgeTypeDef(e))
    let edges = currentSnapshot.edges

    if (hideTypeDefs) {
      entities = entities.filter(e => !isEntityTypeDef(e))
      const ids = new Set(entities.map(e => e.id))
      edges = edges.filter(e => ids.has(e.source_id) && ids.has(e.target_id))
    } else {
      // Synthesize INSTANCE_OF edges from data entities to their type-def nodes.
      const typeDefsByName = new Map<string, string>()
      for (const e of entities) {
        if (isEntityTypeDef(e) && e.name) {
          // Key by name — the type this node defines (e.g., "object"),
          // NOT by type which is the parent (e.g., "physical_entity").
          typeDefsByName.set(e.name, e.id)
        }
      }
      const syntheticEdges: CausalEdge[] = []
      for (const e of entities) {
        const typeDefId = typeDefsByName.get(e.type)
        // Connect every entity to the type-def matching its `type` field.
        // Data entities get INSTANCE_OF to their type (e.g., goal → type_goal).
        // Type-def entities get IS_A to their parent (e.g., type_goal → type_intention).
        if (typeDefId && typeDefId !== e.id) {
          syntheticEdges.push({
            id: `synthetic-${isEntityTypeDef(e) ? 'is-a' : 'instance-of'}-${e.id}`,
            source_id: e.id,
            target_id: typeDefId,
            edge_type: isEntityTypeDef(e) ? 'IS_A' : 'INSTANCE_OF',
            properties: {},
            weight: 0.5,
            created_at: new Date().toISOString(),
          })
        }
      }
      edges = [...edges, ...syntheticEdges]
    }

    const snapshot: GraphSnapshot = {
      ...currentSnapshot,
      entities,
      edges,
    }
    return processGraph(snapshot, filterConfig)
  }, [currentSnapshot, filterConfig, hideTypeDefs])

  // Derive entity types from actual data, ordered by known types first
  const entityTypes = useMemo<string[]>(() => {
    if (!currentSnapshot) return KNOWN_ENTITY_TYPES
    let entities = currentSnapshot.entities.filter(e => !isEdgeTypeDef(e))
    if (hideTypeDefs) {
      entities = entities.filter(e => !isEntityTypeDef(e))
    }
    const seen = new Set(entities.map(e => e.type))
    const ordered = KNOWN_ENTITY_TYPES.filter(t => seen.has(t))
    for (const t of seen) {
      if (!ordered.includes(t)) ordered.push(t)
    }
    return ordered
  }, [currentSnapshot, hideTypeDefs])

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

        {/* Type-definition visibility toggle */}
        <div className="hcg-toolbar-group">
          <label>Scope</label>
          <button
            className={`hcg-btn ${hideTypeDefs ? 'hcg-btn--active' : ''}`}
            onClick={() => setHideTypeDefs(h => !h)}
            title="Toggle visibility of ontology type-definition nodes"
          >
            {hideTypeDefs ? 'Data only' : 'All nodes'}
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

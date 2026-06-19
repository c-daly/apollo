/**
 * HCG Explorer - Multi-modal knowledge graph visualization
 *
 * A sophisticated visualization tool for Sophia's Hierarchical Causal Graph
 * with 2D and 3D rendering modes, semantic clustering, and temporal playback.
 */

import { useEffect, useMemo, useCallback, useState, useRef, type ChangeEvent } from 'react'
import {
  useHCGSnapshot,
  useHCGStats,
  useHCGTypes,
  useHCGSearch,
  useHCGNeighborhood,
  type HCGGraphSnapshot,
} from '../../hooks/useHCG'
import { HCGExplorerProvider, useHCGExplorer } from './context'
import { ThreeRenderer } from './renderers/ThreeRenderer'
import { CytoscapeRenderer } from './renderers/CytoscapeRenderer'
import {
  buildGraph,
  computeHighlightSubgraphIds,
  computeTypeMemberIds,
  deriveTypeSummaries,
  isEdgeTypeDef,
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
import { NODE_COLORS } from './types'
import { snapshotFingerprint } from './utils/snapshot-fingerprint'
import {
  DEFAULT_DENSITY,
  DENSITY_RANGES,
  type DensityParams,
} from './utils/layout-density'
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
const LAYOUTS_2D: LayoutType[] = ['dagre', 'fcose', 'circle', 'concentric', 'breadthfirst', 'hierarchical']
const LAYOUTS_3D: LayoutType[] = ['force-3d', 'semantic']

/** Layout display names */
const LAYOUT_NAMES: Record<LayoutType, string> = {
  dagre: 'Hierarchical',
  fcose: 'Force-Directed',
  circle: 'Circle',
  concentric: 'Concentric',
  breadthfirst: 'Tree',
  hierarchical: 'IS_A Tree',
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
    setDataMode,
    mergeNeighborhood,
    resetWorkingSet,
  } = useHCGExplorer()

  const {
    viewMode,
    layout,
    filterConfig,
    dataMode,
    workingSet,
    expandedNodeIds,
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

  // Layout density controls (force layouts + spacing for hierarchical/tree).
  // Passed to both renderers; changing a slider re-lays-out the canvas live.
  const [densityParams, setDensityParams] = useState<DensityParams>(DEFAULT_DENSITY)

  // ---------------------------------------------------------------------------
  // Lazy-load (seed + expand): the canvas starts empty and grows a working set.
  // ---------------------------------------------------------------------------

  // Headline stats for the header (total nodes + typing coverage). Graceful:
  // an error just leaves the header counts blank, it never blocks the canvas.
  const { data: stats } = useHCGStats()

  // Positional type layer for entry chips.
  const { data: typeLayer } = useHCGTypes(40)

  // Seed search box. The enabled-guard in useHCGSearch doubles as a debounce:
  // an empty box issues no request.
  const [seedQuery, setSeedQuery] = useState('')
  const {
    data: searchResults,
    isFetching: isSearching,
    error: searchError,
  } = useHCGSearch(seedQuery)

  // Expand target: the uuid whose neighborhood we want to fetch + merge next.
  // Set by seeding a search result, clicking a type chip, or expanding a node.
  const [expandUuid, setExpandUuid] = useState<string | null>(null)
  const {
    data: neighborhood,
    isFetching: isExpanding,
    error: neighborhoodError,
  } = useHCGNeighborhood(expandUuid, 1, 60)

  // Track the last neighborhood we merged so re-renders / refetches of an
  // identical response don't re-dispatch a merge (the metadata.root + counts
  // form a stable key for one fetch result).
  const lastMergedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    // Guard the whole metadata block: a malformed response missing `metadata`
    // must not crash the merge effect (it just skips this render).
    if (!neighborhood || !neighborhood.metadata || !expandUuid) return
    const { root, node_count, edge_count } = neighborhood.metadata
    const key = `${root}:${node_count}:${edge_count}`
    if (key === lastMergedKeyRef.current) return
    lastMergedKeyRef.current = key
    mergeNeighborhood(neighborhood, expandUuid)
  }, [neighborhood, expandUuid, mergeNeighborhood])

  // Seed the graph with a search result / type chip (plants the node + its
  // neighborhood). Seeding is an intentional "start exploring" action, so it
  // explicitly switches into lazy mode FIRST -- a full-graph view is never
  // silently replaced by a merge (the mode flip is visible: the toolbar button
  // flips to "Lazy mode" and the working-set counts appear).
  const handleSeed = useCallback(
    (uuid: string) => {
      lastMergedKeyRef.current = null
      setDataMode('lazy')
      setExpandUuid(uuid)
    },
    [setDataMode]
  )

  // Expand the currently selected node on demand. Only reachable from the
  // lazy-mode detail panel, but switch explicitly too so the working set is
  // always what grows (never the abandoned full snapshot).
  const handleExpand = useCallback(
    (uuid: string) => {
      lastMergedKeyRef.current = null
      setDataMode('lazy')
      setExpandUuid(uuid)
    },
    [setDataMode]
  )

  // Clear the working set back to an empty canvas.
  const handleResetWorkingSet = useCallback(() => {
    lastMergedKeyRef.current = null
    setExpandUuid(null)
    setSeedQuery('')
    resetWorkingSet()
  }, [resetWorkingSet])

  // ---------------------------------------------------------------------------
  // Full-snapshot path (legacy / small graphs), behind "Load full graph".
  // The query only fires once the user opts in (dataMode === 'full'), so the
  // default lazy mode never pulls the whole graph.
  // ---------------------------------------------------------------------------
  const fullMode = dataMode === 'full'
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
    refetchInterval: fullMode && refreshInterval > 0 ? refreshInterval : false,
    enabled: fullMode,
  })

  // Track whether we've loaded any data (for mock fallback decision).
  // Using a ref avoids including currentSnapshot in the dep array,
  // which would re-trigger the effect every time we add a snapshot.
  const hasDataRef = useRef(false)
  // Content fingerprint of the last applied snapshot. Sophia stamps a fresh
  // top-level timestamp on every /hcg/snapshot response, so React Query hands
  // us a new apiSnapshot reference each 15s poll even when the graph is
  // unchanged. Without this guard every poll rebuilt the whole pipeline.
  const lastSnapshotFpRef = useRef<string | null>(null)

  // Add new snapshots to history (with mock fallback). Full-snapshot path only:
  // in lazy mode the canvas is driven by the working set, never by a snapshot,
  // and there is no mock fallback (an empty canvas with a seed prompt is the
  // correct empty state).
  useEffect(() => {
    if (!fullMode) return
    if (apiSnapshot) {
      setUsingMockData(false)
      hasDataRef.current = true
      // Skip the rebuild when the poll returned identical content (only the
      // server's per-request timestamp changed).
      const fp = snapshotFingerprint(apiSnapshot)
      if (fp === lastSnapshotFpRef.current) return
      lastSnapshotFpRef.current = fp
      addSnapshot(convertSnapshot(apiSnapshot))
    } else if (error && !hasDataRef.current) {
      // Fallback to mock data if API fails and we have no data
      console.log('HCG API unavailable, using mock data')
      setUsingMockData(true)
      hasDataRef.current = true
      addSnapshot(generateMockSnapshot())
    }
  }, [fullMode, apiSnapshot, error, addSnapshot])

  // The snapshot the canvas + panels operate on: the accumulated lazy-load
  // working set by default, or the full snapshot once "Load full graph" is on.
  // workingSet is always a (possibly empty) snapshot, so lazy mode has data as
  // soon as the first seed merges.
  const activeSnapshot: GraphSnapshot | null = fullMode ? currentSnapshot : workingSet
  const hasGraph = !!activeSnapshot && activeSnapshot.entities.length > 0

  // Process graph data for rendering. The chosen view (logical vs reified) is
  // applied by buildGraph; see graph-processor for the two transforms. Expanded
  // node ids are threaded so explored nodes are marked in lazy mode.
  const expandedIdSet = useMemo<Set<string>>(
    () => new Set(expandedNodeIds),
    [expandedNodeIds]
  )
  const processedGraph = useMemo<ProcessedGraph>(() => {
    if (!activeSnapshot) {
      return { nodes: [], edges: [], clusters: [] }
    }
    return buildGraph(activeSnapshot, graphMode, filterConfig, expandedIdSet)
  }, [activeSnapshot, filterConfig, graphMode, expandedIdSet])

  // Derive entity types from the rendered graph, ordered by known types first.
  const entityTypes = useMemo<string[]>(() => {
    if (!activeSnapshot) return KNOWN_ENTITY_TYPES
    // Reflect ALL types present in the current view, independent of the active
    // search / status / property filters — otherwise the type buttons vanish as
    // you type a search. This used to run a SECOND full buildGraph() (transform
    // + processGraph + filters + clustering) on every snapshot just to enumerate
    // node types. We only need the distinct types of the view's entities, so
    // reproduce just the view transform's node set: the logical view drops
    // edge-type-definition nodes; the reified view keeps every entity and adds
    // one 'edge' node type. That is an O(N) pass with no graph rebuild.
    const isReified = graphMode === 'reified'
    const seen = new Set<string>()
    for (const e of activeSnapshot.entities) {
      if (isReified || !isEdgeTypeDef(e)) seen.add(e.type)
    }
    if (isReified && activeSnapshot.edges.length > 0) seen.add('edge')
    const ordered = KNOWN_ENTITY_TYPES.filter(t => seen.has(t))
    for (const t of seen) {
      if (!ordered.includes(t)) ordered.push(t)
    }
    return ordered
  }, [activeSnapshot, graphMode])

  // Flat, IS_A-driven type list for the Types panel. Counts come from IS_A
  // edges (deriveTypeSummaries), independent of the realm-based entityTypes.
  const typeSummaries = useMemo<TypeSummary[]>(
    () => (activeSnapshot ? deriveTypeSummaries(activeSnapshot) : []),
    [activeSnapshot]
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

  // Drop a stale type selection when the active snapshot no longer contains the
  // selected type-definition node (e.g. navigating the timeline to a snapshot
  // that predates the type). Otherwise computeTypeMemberIds would return only
  // the missing id and processGraph would filter every node out, leaving an
  // empty canvas with an active-but-invisible filter. Only clears when the type
  // is truly absent, so valid selections survive timeline navigation.
  useEffect(() => {
    // Only drop the selection when we have a populated type list that genuinely
    // lacks the selected type. An empty list usually means the snapshot is
    // mid-refetch (the 15s poll) or filtered down to no type-definition nodes;
    // clearing then would nuke a still-valid selection on every refresh.
    if (
      filterConfig.selectedTypeId &&
      typeSummaries.length > 0 &&
      !typeSummaries.some(t => t.id === filterConfig.selectedTypeId)
    ) {
      setFilter({ selectedTypeId: null })
    }
  }, [typeSummaries, filterConfig.selectedTypeId, setFilter])

  // Get available layouts based on view mode
  const availableLayouts = viewMode === '3d' ? LAYOUTS_3D : LAYOUTS_2D

  // Find selected node data
  const selectedNode = useMemo<GraphNode | null>(() => {
    if (!selectedNodeId) return null
    return processedGraph.nodes.find(n => n.id === selectedNodeId) || null
  }, [selectedNodeId, processedGraph.nodes])

  // Highlight-subgraph ids for the current focus. A selected emergent type
  // (Types panel) takes precedence over a clicked node. Threaded to both
  // renderers, which keep these nodes/edges bright and dim the rest, preserving
  // context. Null when nothing is focused (no dimming). This is the default
  // interaction; the restrict-style hard filter lives behind the selection mode.
  const highlightedNodeIds = useMemo<Set<string> | null>(() => {
    if (!activeSnapshot) return null
    // Restrict mode already hard-filters the graph to the selection in
    // buildGraph; dimming on top of that is redundant for a selected type and
    // wrongly dims the whole graph when a single node is clicked. Dimming is the
    // highlight-mode affordance only.
    if (filterConfig.selectionMode === 'restrict') return null
    if (filterConfig.selectedTypeId) {
      return computeTypeMemberIds(activeSnapshot, filterConfig.selectedTypeId)
    }
    if (selectedNodeId) {
      return computeHighlightSubgraphIds(activeSnapshot, selectedNodeId)
    }
    return null
  }, [
    activeSnapshot,
    filterConfig.selectedTypeId,
    filterConfig.selectionMode,
    selectedNodeId,
  ])

  // Nodes the camera / viewport should frame. Selecting a type in the Types
  // panel moves the view to that type plus its IS_A members; otherwise a clicked
  // node is framed. Independent of selectionMode (unlike highlightedNodeIds) so
  // framing works in both highlight and restrict.
  const focusNodeIds = useMemo<Set<string> | null>(() => {
    if (!activeSnapshot) return null
    if (filterConfig.selectedTypeId) {
      return computeTypeMemberIds(activeSnapshot, filterConfig.selectedTypeId)
    }
    if (selectedNodeId) return new Set([selectedNodeId])
    return null
  }, [activeSnapshot, filterConfig.selectedTypeId, selectedNodeId])

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

  // Handle a layout-density slider change (live re-layout in both renderers).
  const handleDensityChange = useCallback(
    (key: keyof DensityParams, value: number) => {
      setDensityParams(prev => ({ ...prev, [key]: value }))
    },
    []
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
      {/* Seed / lazy-load bar: stats header, seed search, type chips, mode +
          reset. The canvas starts empty; seeding a node (or a type chip)
          plants its neighborhood, and Expand grows the working set on demand. */}
      <div className="hcg-seedbar">
        {/* Stats header (typing coverage). Blank if /hcg/stats errored. */}
        <div className="hcg-seedbar-stats">
          {stats ? (
            <>
              <span className="hcg-stat" title="Total nodes in the graph">
                {(stats.total_nodes ?? 0).toLocaleString()} nodes
              </span>
              <span className="hcg-stat" title="Content nodes that have been typed">
                {(stats.content_classified ?? 0).toLocaleString()}/
                {(stats.content_nodes ?? 0).toLocaleString()} typed
              </span>
              <span className="hcg-stat" title="Type-definition nodes">
                {stats.type_definitions ?? 0} types
              </span>
            </>
          ) : (
            <span className="hcg-stat hcg-stat--muted">graph stats unavailable</span>
          )}
        </div>

        {/* Seed search */}
        <div className="hcg-seedbar-search">
          <input
            type="text"
            className="hcg-input hcg-input--search"
            placeholder="Seed: search a node to plant on the canvas..."
            value={seedQuery}
            onChange={e => setSeedQuery(e.target.value)}
          />
          {seedQuery.trim() && (
            <div className="hcg-seed-results">
              {isSearching && (
                <div className="hcg-seed-result hcg-seed-result--muted">Searching...</div>
              )}
              {!isSearching && searchResults && searchResults.length === 0 && (
                <div className="hcg-seed-result hcg-seed-result--muted">No matches</div>
              )}
              {!isSearching &&
                searchResults?.slice(0, 12).map(r => (
                  <button
                    key={r.uuid}
                    className="hcg-seed-result"
                    onClick={() => {
                      handleSeed(r.uuid)
                      setSeedQuery('')
                    }}
                    title={r.uuid}
                  >
                    <span className="hcg-seed-result-name">{r.name || r.uuid}</span>
                    <span
                      className="hcg-seed-result-type"
                      style={{ color: NODE_COLORS[r.type] || NODE_COLORS.default }}
                    >
                      {r.type}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Type chips (entry points) */}
        {typeLayer && typeLayer.length > 0 && (
          <div className="hcg-seedbar-chips">
            {typeLayer.slice(0, 12).map(t => (
              <button
                key={t.uuid}
                className="hcg-chip"
                onClick={() => handleSeed(t.uuid)}
                title={`${t.name} — ${t.member_count} members`}
              >
                {t.name}
                <span className="hcg-chip-count">{t.member_count}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Working-set counts (lazy mode) */}
        {!fullMode && (
          <div className="hcg-seedbar-counts">
            <span className="hcg-stat" title="Nodes in the working set">
              {workingSet?.entities?.length ?? 0} nodes
            </span>
            <span className="hcg-stat" title="Edges in the working set">
              {workingSet?.edges?.length ?? 0} edges
            </span>
            {isExpanding && <span className="hcg-stat hcg-stat--muted">expanding...</span>}
          </div>
        )}

        {/* Reset (clear working set) */}
        {!fullMode && hasGraph && (
          <button
            className="hcg-btn"
            onClick={handleResetWorkingSet}
            title="Clear the canvas back to empty"
          >
            Reset
          </button>
        )}

        {/* Data-mode toggle: lazy (seed+expand) vs full snapshot. */}
        <button
          className={`hcg-btn ${fullMode ? 'hcg-btn--active' : ''}`}
          onClick={() => setDataMode(fullMode ? 'lazy' : 'full')}
          title={
            fullMode
              ? 'Switch back to lazy seed + expand'
              : 'Load the entire graph snapshot (small graphs / back-compat)'
          }
        >
          {fullMode ? 'Lazy mode' : 'Load full graph'}
        </button>
      </div>

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

      {/* Lazy-load expand/search error toast (never blocks the canvas) */}
      {!fullMode && (neighborhoodError || searchError) && (
        <div className="hcg-mock-banner hcg-mock-banner--error">
          {neighborhoodError
            ? `Couldn't expand that node: ${neighborhoodError.message}`
            : `Search failed: ${searchError?.message}`}
        </div>
      )}

      {/* Main Content */}
      <div className="hcg-content">
        {/* Canvas */}
        <div className="hcg-canvas">
          {/* Full-mode loading */}
          {fullMode && isLoading && !currentSnapshot && (
            <div className="hcg-loading">
              <div className="hcg-loading-spinner" />
            </div>
          )}

          {/* Full-mode error */}
          {fullMode && error && !currentSnapshot && !usingMockData && (
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

          {/* Lazy-mode empty state: seed the graph from the search box. */}
          {!fullMode && !hasGraph && (
            <div className="hcg-empty">
              <div className="hcg-empty-title">Explore the graph</div>
              <div className="hcg-empty-hint">
                {isExpanding
                  ? 'Loading neighborhood...'
                  : 'Search for a node above and click a result to seed the canvas, or pick a type chip. Click a node and Expand to grow the view.'}
              </div>
            </div>
          )}

          {hasGraph && viewMode === '3d' && (
            <ThreeRenderer
              graph={processedGraph}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onNodeSelect={selectNode}
              onNodeHover={hoverNode}
              layout={layout}
              highlightedNodeIds={highlightedNodeIds}
              focusNodeIds={focusNodeIds}
              densityParams={densityParams}
            />
          )}

          {hasGraph && viewMode === '2d' && (
            <CytoscapeRenderer
              graph={processedGraph}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onNodeSelect={selectNode}
              onNodeHover={hoverNode}
              layout={layout}
              highlightedNodeIds={highlightedNodeIds}
              focusNodeIds={focusNodeIds}
              densityParams={densityParams}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="hcg-sidebar">
          {/* View controls (de-hairball): skeleton scope, edge kinds, selection mode. */}
          <div className="hcg-panel">
            <div className="hcg-panel-header">
              <span className="hcg-panel-title">View</span>
            </div>
            <div className="hcg-panel-content hcg-view-controls">
              <button
                className={`hcg-btn ${filterConfig.skeletonOnly ? 'hcg-btn--active' : ''}`}
                onClick={() => setFilter({ skeletonOnly: !filterConfig.skeletonOnly })}
                title="Skeleton-first: show only the type_definition IS_A skeleton"
              >
                {filterConfig.skeletonOnly ? 'Skeleton only' : 'Full graph'}
              </button>
              <div className="hcg-btn-row">
                <span className="hcg-view-label">Edges</span>
                <button
                  className={`hcg-btn ${(filterConfig.edgeKind ?? 'both') === 'both' ? 'hcg-btn--active' : ''}`}
                  onClick={() => setFilter({ edgeKind: 'both' })}
                >
                  Both
                </button>
                <button
                  className={`hcg-btn ${filterConfig.edgeKind === 'is_a' ? 'hcg-btn--active' : ''}`}
                  onClick={() => setFilter({ edgeKind: 'is_a' })}
                >
                  IS_A
                </button>
                <button
                  className={`hcg-btn ${filterConfig.edgeKind === 'semantic' ? 'hcg-btn--active' : ''}`}
                  onClick={() => setFilter({ edgeKind: 'semantic' })}
                >
                  Semantic
                </button>
              </div>
              <div className="hcg-btn-row">
                <span className="hcg-view-label">Select</span>
                <button
                  className={`hcg-btn ${(filterConfig.selectionMode ?? 'highlight') === 'highlight' ? 'hcg-btn--active' : ''}`}
                  onClick={() => setFilter({ selectionMode: 'highlight' })}
                  title="Selecting dims the rest but keeps context"
                >
                  Highlight
                </button>
                <button
                  className={`hcg-btn ${filterConfig.selectionMode === 'restrict' ? 'hcg-btn--active' : ''}`}
                  onClick={() => setFilter({ selectionMode: 'restrict' })}
                  title="Selecting a type restricts the graph to its members"
                >
                  Restrict
                </button>
              </div>
            </div>
          </div>

          {/* Layout density controls. Force layouts use all three; the
              hierarchical / tree layouts honour spacing (link distance) only. */}
          <div className="hcg-panel">
            <div className="hcg-panel-header">
              <span className="hcg-panel-title">Layout</span>
              <button
                className="hcg-btn hcg-btn--small"
                onClick={() => setDensityParams(DEFAULT_DENSITY)}
                title="Reset layout density to defaults"
              >
                Reset
              </button>
            </div>
            <div className="hcg-panel-content hcg-density-controls">
              <label className="hcg-density-row">
                <span className="hcg-view-label">Repulsion</span>
                <input
                  type="range"
                  min={DENSITY_RANGES.repulsion.min}
                  max={DENSITY_RANGES.repulsion.max}
                  step={DENSITY_RANGES.repulsion.step}
                  value={densityParams.repulsion}
                  onChange={e =>
                    handleDensityChange('repulsion', Number(e.target.value))
                  }
                />
                <span className="hcg-density-value">{densityParams.repulsion}</span>
              </label>
              <label className="hcg-density-row">
                <span className="hcg-view-label">Link distance</span>
                <input
                  type="range"
                  min={DENSITY_RANGES.linkDistance.min}
                  max={DENSITY_RANGES.linkDistance.max}
                  step={DENSITY_RANGES.linkDistance.step}
                  value={densityParams.linkDistance}
                  onChange={e =>
                    handleDensityChange('linkDistance', Number(e.target.value))
                  }
                />
                <span className="hcg-density-value">{densityParams.linkDistance}</span>
              </label>
              <label className="hcg-density-row">
                <span className="hcg-view-label">Gravity</span>
                <input
                  type="range"
                  min={DENSITY_RANGES.gravity.min}
                  max={DENSITY_RANGES.gravity.max}
                  step={DENSITY_RANGES.gravity.step}
                  value={densityParams.gravity}
                  onChange={e =>
                    handleDensityChange('gravity', Number(e.target.value))
                  }
                />
                <span className="hcg-density-value">
                  {densityParams.gravity.toFixed(2)}
                </span>
              </label>
            </div>
          </div>

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
                    {!fullMode && (
                      <button
                        className="hcg-btn hcg-detail-expand"
                        onClick={() => handleExpand(selectedNode.id)}
                        disabled={isExpanding}
                        title="Fetch this node's neighborhood and merge it into the canvas"
                      >
                        {expandedIdSet.has(selectedNode.id)
                          ? 'Re-expand neighborhood'
                          : isExpanding
                            ? 'Expanding...'
                            : 'Expand neighborhood'}
                      </button>
                    )}
                    <div className="hcg-properties">
                      {JSON.stringify(selectedNode.properties, null, 2)}
                    </div>
                  </div>
                ) : (
                  <div className="hcg-node-details-empty">
                    {fullMode
                      ? 'Click a node to view details'
                      : 'Click a node to view details, then Expand to grow the view'}
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
                      aria-pressed={filterConfig.selectedTypeId === t.id}
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
        {activeSnapshot?.timestamp && (
          <div className="hcg-stat">
            <span>Updated:</span>
            <span className="hcg-stat-value">
              {formatTime(activeSnapshot.timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default HCGExplorer

/**
 * Type definitions for HCG Explorer
 */

import type { Entity, CausalEdge, GraphSnapshot } from '../../types/hcg'
import type { DensityParams } from './utils/layout-density'

// Re-export base types
export type { Entity, CausalEdge, GraphSnapshot }

/** View mode for the explorer */
export type ViewMode = '2d' | '3d'

/** Available layout algorithms */
export type LayoutType =
  | 'dagre'      // Hierarchical DAG (default)
  | 'fcose'      // Force-directed (Cytoscape)
  | 'circle'     // Circular layout
  | 'concentric' // Concentric by type
  | 'breadthfirst' // BFS tree
  | 'hierarchical' // Top-down IS_A tree rooted at realm roots (2D only)
  | 'force-3d'   // 3D force simulation
  | 'semantic'   // Embedding-based positioning

/** Edge-kind toggle: IS_A membership only, semantic only, or both. */
export type EdgeKindFilter = 'both' | 'is_a' | 'semantic'

/** How a type/node selection is applied: dim others (highlight) or remove (restrict). */
export type SelectionMode = 'highlight' | 'restrict'

/** Node representation for rendering */
export interface GraphNode {
  id: string
  label: string
  type: string
  status?: string
  position?: {
    x: number
    y: number
    z?: number
  }
  embedding?: number[]
  clusterId?: string
  properties: Record<string, unknown>
  raw: Entity
}

/** Edge representation for rendering */
export interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  label: string
  weight: number
  properties: Record<string, unknown>
  raw: CausalEdge
}

/** Processed graph data ready for rendering */
export interface ProcessedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: ClusterAssignment[]
}

/** Cluster assignment from semantic clustering */
export interface ClusterAssignment {
  id: string
  label: string
  memberIds: string[]
  centroid?: {
    x: number
    y: number
    z?: number
  }
  color: string
}

/** Filter configuration */
export interface FilterConfig {
  /** Entity types to include (empty = all) */
  entityTypes: string[]
  /** Edge types to include (empty = all) */
  edgeTypes: string[]
  /** Status values to include (empty = all) */
  status: string[]
  /** Text search query */
  searchQuery: string
  /** Property-based filters */
  propertyFilters: PropertyFilter[]
  /** Cluster filter (show only specific clusters) */
  clusters: string[]
  /**
   * Selected emergent-type definition node id (the IS_A target). When set, the
   * graph is filtered to that type node plus its IS_A members. Independent of
   * the realm-based `entityTypes` filter. Optional so existing FilterConfig
   * literals keep type-checking; treated as null when absent.
   */
  selectedTypeId?: string | null
  /**
   * De-hairball default: when true (the app default) the rendered graph is
   * restricted to the type_definition skeleton: type nodes plus the type-to-type
   * IS_A hierarchy. Optional so existing FilterConfig literals keep type-checking;
   * treated as off when absent (preserves direct processGraph/buildGraph callers
   * and the existing test fixtures).
   */
  skeletonOnly?: boolean
  /**
   * Which edge kinds to render: both (default), is_a (membership/hierarchy only)
   * or semantic (everything that is not IS_A). Membership is the bulk of the edge
   * density, so semantic noticeably thins the view. Treated as both when absent.
   */
  edgeKind?: EdgeKindFilter
  /**
   * How a type/node selection is applied. highlight (the app default) keeps
   * context and dims the rest in the renderer; restrict is the prior hard filter
   * that removes non-members in buildGraph. Absent is treated as restrict to
   * preserve the original buildGraph type-filter behaviour.
   */
  selectionMode?: SelectionMode
}

/** Property filter definition */
export interface PropertyFilter {
  path: string
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'exists'
  value: unknown
}

/** Timestamped snapshot for history */
export interface TimestampedSnapshot {
  timestamp: string
  data: GraphSnapshot
  index: number
}

/** Embedding configuration */
export interface EmbeddingConfig {
  /** Property field(s) containing embedding vectors */
  fields: string | string[]
  /** Dimensionality reduction method */
  reducer: 'umap' | 'tsne' | 'pca' | 'none'
  /** Target dimensions (2 or 3) */
  targetDimensions: 2 | 3
}

/** Explorer state */
export interface HCGExplorerState {
  // View
  viewMode: ViewMode
  layout: LayoutType

  // Data
  currentSnapshot: GraphSnapshot | null
  snapshotHistory: TimestampedSnapshot[]
  timelineIndex: number

  // Filters
  filterConfig: FilterConfig

  // Clustering
  embeddingConfig: EmbeddingConfig

  // Selection
  selectedNodeId: string | null
  hoveredNodeId: string | null

  // Playback
  isPlaying: boolean
  playbackSpeed: number

  // UI
  showFilterPanel: boolean
  showNodeDetails: boolean
  showClusterLegend: boolean
}

/** Explorer actions */
export type HCGExplorerAction =
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_LAYOUT'; layout: LayoutType }
  | { type: 'SET_FILTER'; config: Partial<FilterConfig> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'HOVER_NODE'; id: string | null }
  | { type: 'SET_TIMELINE_INDEX'; index: number }
  | { type: 'TOGGLE_PLAYBACK' }
  | { type: 'SET_PLAYBACK_SPEED'; speed: number }
  | { type: 'ADD_SNAPSHOT'; snapshot: GraphSnapshot }
  | { type: 'SET_EMBEDDING_CONFIG'; config: Partial<EmbeddingConfig> }
  | { type: 'TOGGLE_FILTER_PANEL' }
  | { type: 'TOGGLE_NODE_DETAILS' }
  | { type: 'TOGGLE_CLUSTER_LEGEND' }

/** Props for renderer components */
export interface RendererProps {
  graph: ProcessedGraph
  selectedNodeId: string | null
  hoveredNodeId: string | null
  onNodeSelect: (id: string | null) => void
  onNodeHover: (id: string | null) => void
  layout: LayoutType
  /**
   * Ids of nodes in the highlighted subgraph. When set (non-null), renderers
   * keep these nodes/edges at full opacity and dim everything else; an edge is
   * highlighted only when both endpoints are in the set. Null = no dimming.
   */
  highlightedNodeIds?: Set<string> | null
  /** Force-layout density controls (repulsion / link distance / gravity). */
  densityParams?: DensityParams
}

/** Color scheme for entity types */
export const NODE_COLORS: Record<string, string> = {
  goal: '#4ade80',
  plan: '#60a5fa',
  step: '#a78bfa',
  state: '#f59e0b',
  process: '#ef4444',
  // NDT realm types — sophia's realm-triage tags HCG nodes ingested via the
  // NLP/media pipeline with one of the three realms {entity, concept, process}
  // as node.type. `process` doubles as a realm and a fine-grained type and
  // already has a color above; `entity` and `concept` are added here so realm-
  // typed nodes color instead of falling back to gray.
  entity: '#2563eb',
  concept: '#9333ea',
  agent: '#38bdf8',
  action: '#f97316',
  object: '#fb923c',
  location: '#2dd4bf',
  workspace: '#14b8a6',
  zone: '#5eead4',
  manipulator: '#818cf8',
  sensor: '#c084fc',
  simulation: '#e879f9',
  imagined_state: '#fbbf24',
  imagined_process: '#f472b6',
  capability: '#a3e635',
  default: '#6b7280',
}

/** Color scheme for status */
export const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  failed: '#ef4444',
  running: '#3b82f6',
  executing: '#3b82f6',
  pending: '#9ca3af',
  active: '#22c55e',
  default: '#6b7280',
}

/** Default filter configuration */
export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  entityTypes: [],
  edgeTypes: [],
  status: [],
  searchQuery: '',
  propertyFilters: [],
  clusters: [],
  selectedTypeId: null,
  // De-hairball defaults: skeleton-first, all edge kinds, highlight-on-select.
  skeletonOnly: true,
  edgeKind: 'both',
  selectionMode: 'highlight',
}

/** Default embedding configuration */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  fields: 'embedding',
  reducer: 'umap',
  targetDimensions: 3,
}

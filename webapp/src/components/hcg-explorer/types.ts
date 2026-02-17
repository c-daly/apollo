/**
 * Type definitions for HCG Explorer
 */

import type { Entity, CausalEdge, GraphSnapshot } from '../../types/hcg'

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
  | 'force-3d'   // 3D force simulation
  | 'semantic'   // Embedding-based positioning

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
}

/** Color scheme for entity types */
export const NODE_COLORS: Record<string, string> = {
  goal: '#4ade80',
  plan: '#60a5fa',
  step: '#a78bfa',
  state: '#f59e0b',
  process: '#ef4444',
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
}

/** Default embedding configuration */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  fields: 'embedding',
  reducer: 'umap',
  targetDimensions: 3,
}

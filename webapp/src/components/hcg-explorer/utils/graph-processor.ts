/**
 * Graph data processing utilities
 *
 * Transforms raw HCG snapshots into renderable graph data
 */

import type {
  GraphSnapshot,
  Entity,
  CausalEdge,
  GraphNode,
  GraphEdge,
  ProcessedGraph,
  FilterConfig,
  ClusterAssignment,
} from '../types'
import { NODE_COLORS } from '../types'

/**
 * How to render the HCG.
 * - 'logical': the graph as it is *meant to be seen* — reified edge-nodes
 *   collapsed into direct labelled edges between content nodes.
 * - 'reified': the graph as it is *stored* — every edge is itself a node,
 *   wired (edge)-[:FROM]->(source) and (edge)-[:TO]->(target). All nodes.
 */
export type GraphMode = 'logical' | 'reified'

/** True for an entity-type-definition node (ontology type, e.g. "object").
 *  Detected by the authoritative `is_type_definition` property; falls back to
 *  the legacy `type_`-id convention only when the property is absent. Edge-type
 *  definitions (ancestors include "edge_type") are excluded — they are edges. */
export function isEntityTypeDef(e: Entity): boolean {
  const p = e.properties || {}
  if (p.is_type_definition === true) {
    const anc = Array.isArray(p.ancestors) ? (p.ancestors as unknown[]) : []
    return !anc.includes('edge_type')
  }
  return e.id.startsWith('type_') && !e.id.startsWith('type_edge_')
}

/** True for an edge-type-definition node (relation metadata, e.g. "IS_A").
 *  These describe edges and must never render as content nodes in the logical
 *  view. Detected by `is_type_definition` + an `edge_type` ancestor; falls back
 *  to the legacy `type_edge_` id convention. */
export function isEdgeTypeDef(e: Entity): boolean {
  const p = e.properties || {}
  if (p.is_type_definition === true) {
    const anc = Array.isArray(p.ancestors) ? (p.ancestors as unknown[]) : []
    return anc.includes('edge_type')
  }
  return e.id.startsWith('type_edge_')
}

/**
 * Logical view — the graph as meant to be seen.
 * Drops edge-type-definition metadata nodes (they ARE edges); keeps content
 * nodes and entity-type-defs (so IS_A has a target). Edges are already
 * collapsed source->target by Sophia's snapshot, so they pass through directly.
 */
export function toLogicalSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    ...snapshot,
    entities: snapshot.entities.filter(e => !isEdgeTypeDef(e)),
    edges: snapshot.edges,
  }
}

/**
 * Reified view — the graph as stored. Every edge becomes a node, re-expanding
 * the (source)<-[:FROM]-(edge)-[:TO]->(target) shape that the snapshot API
 * collapsed. All nodes: content, type-defs, and one node per edge instance.
 */
export function toReifiedSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  const edgeNodes: Entity[] = snapshot.edges.map(e => ({
    id: e.id,
    type: 'edge',
    name: e.edge_type,
    properties: { ...(e.properties || {}), relation: e.edge_type, reified: true },
  }))
  const structural: CausalEdge[] = snapshot.edges.flatMap(e => [
    {
      id: `${e.id}__from`,
      source_id: e.id,
      target_id: e.source_id,
      edge_type: 'FROM',
      properties: {},
    },
    {
      id: `${e.id}__to`,
      source_id: e.id,
      target_id: e.target_id,
      edge_type: 'TO',
      properties: {},
    },
  ])
  return {
    ...snapshot,
    entities: [...snapshot.entities, ...edgeNodes],
    edges: structural,
  }
}

/** Apply the chosen view transform, then the standard render pipeline. */
export function buildGraph(
  snapshot: GraphSnapshot,
  mode: GraphMode,
  filterConfig: FilterConfig
): ProcessedGraph {
  const transformed =
    mode === 'reified' ? toReifiedSnapshot(snapshot) : toLogicalSnapshot(snapshot)
  return processGraph(transformed, filterConfig)
}

/**
 * Process a graph snapshot into renderable format
 */
export function processGraph(
  snapshot: GraphSnapshot,
  filterConfig: FilterConfig
): ProcessedGraph {
  // Convert entities to nodes
  let nodes = snapshot.entities.map(entityToNode)

  // Convert edges
  let edges = snapshot.edges.map(edgeToGraphEdge)

  // Apply filters
  nodes = applyNodeFilters(nodes, filterConfig)

  // Filter edges to only include those with visible nodes
  const nodeIds = new Set(nodes.map(n => n.id))
  edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  // Apply edge type filter
  if (filterConfig.edgeTypes.length > 0) {
    edges = edges.filter(e => filterConfig.edgeTypes.includes(e.type))
  }

  // Generate clusters (simple type-based clustering for now)
  const clusters = generateClusters(nodes)

  return { nodes, edges, clusters }
}

/**
 * Convert an Entity to a GraphNode
 */
function entityToNode(entity: Entity): GraphNode {
  const props = entity.properties || {}

  // Extract label: prefer top-level name (from API), then properties, then ID
  const label =
    entity.name ||
    (props.name as string) ||
    (props.title as string) ||
    (props.description as string)?.slice(0, 30) ||
    entity.id

  // Extract status
  const status =
    typeof props.status === 'string' ? props.status.toLowerCase() : undefined

  // Extract embedding if present
  const embedding = Array.isArray(props.embedding)
    ? (props.embedding as number[])
    : undefined

  return {
    id: entity.id,
    label,
    type: entity.type,
    status,
    embedding,
    properties: props,
    raw: entity,
  }
}

/**
 * Convert a CausalEdge to a GraphEdge
 */
function edgeToGraphEdge(edge: CausalEdge): GraphEdge {
  return {
    id: edge.id,
    source: edge.source_id,
    target: edge.target_id,
    type: edge.edge_type,
    label: edge.edge_type,
    weight: edge.weight,
    properties: edge.properties,
    raw: edge,
  }
}

/**
 * Apply filter configuration to nodes
 */
function applyNodeFilters(
  nodes: GraphNode[],
  filterConfig: FilterConfig
): GraphNode[] {
  let filtered = nodes

  // Entity type filter
  if (filterConfig.entityTypes.length > 0) {
    filtered = filtered.filter(n => filterConfig.entityTypes.includes(n.type))
  }

  // Status filter
  if (filterConfig.status.length > 0) {
    filtered = filtered.filter(
      n => n.status && filterConfig.status.includes(n.status)
    )
  }

  // Search query filter
  if (filterConfig.searchQuery.trim()) {
    const query = filterConfig.searchQuery.toLowerCase()
    filtered = filtered.filter(
      n =>
        n.id.toLowerCase().includes(query) ||
        n.label.toLowerCase().includes(query) ||
        n.type.toLowerCase().includes(query)
    )
  }

  // Property filters
  for (const pf of filterConfig.propertyFilters) {
    filtered = filtered.filter(n => matchPropertyFilter(n, pf))
  }

  // Cluster filter
  if (filterConfig.clusters.length > 0) {
    filtered = filtered.filter(
      n => n.clusterId && filterConfig.clusters.includes(n.clusterId)
    )
  }

  return filtered
}

/**
 * Check if a node matches a property filter
 */
function matchPropertyFilter(
  node: GraphNode,
  filter: { path: string; operator: string; value: unknown }
): boolean {
  const value = getNestedValue(node.properties, filter.path)

  switch (filter.operator) {
    case 'eq':
      return value === filter.value
    case 'ne':
      return value !== filter.value
    case 'gt':
      return typeof value === 'number' && value > (filter.value as number)
    case 'lt':
      return typeof value === 'number' && value < (filter.value as number)
    case 'contains':
      return (
        typeof value === 'string' &&
        value.toLowerCase().includes((filter.value as string).toLowerCase())
      )
    case 'exists':
      return value !== undefined && value !== null
    default:
      return true
  }
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Generate cluster assignments based on node types
 * This is a simple implementation - will be enhanced with embedding-based clustering
 */
function generateClusters(nodes: GraphNode[]): ClusterAssignment[] {
  const typeGroups = new Map<string, GraphNode[]>()

  for (const node of nodes) {
    const type = node.type
    if (!typeGroups.has(type)) {
      typeGroups.set(type, [])
    }
    typeGroups.get(type)!.push(node)
  }

  const clusters: ClusterAssignment[] = []

  for (const [type, members] of typeGroups) {
    if (members.length === 0) continue

    // Assign cluster ID to nodes
    const clusterId = `cluster-${type}`
    for (const node of members) {
      node.clusterId = clusterId
    }

    clusters.push({
      id: clusterId,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      memberIds: members.map(n => n.id),
      color: NODE_COLORS[type] || NODE_COLORS.default,
    })
  }

  return clusters
}

/**
 * Calculate layout positions using a simple force-directed approach
 * Used as fallback when no layout engine is available
 */
export function calculateSimpleLayout(
  nodes: GraphNode[],
  _edges: GraphEdge[],
  width: number,
  height: number,
  is3D: boolean = false
): GraphNode[] {
  // Simple grid layout as starting point
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const cellWidth = width / (cols + 1)
  const cellHeight = height / (Math.ceil(nodes.length / cols) + 1)

  return nodes.map((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols

    return {
      ...node,
      position: {
        x: (col + 1) * cellWidth - width / 2,
        y: (row + 1) * cellHeight - height / 2,
        z: is3D ? (Math.random() - 0.5) * 200 : 0,
      },
    }
  })
}

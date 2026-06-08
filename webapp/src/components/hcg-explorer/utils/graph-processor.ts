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
    labels: ['edge'],
    created_at: e.created_at,
  }))
  const structural: CausalEdge[] = snapshot.edges.flatMap(e => [
    {
      id: `${e.id}__from`,
      source_id: e.id,
      target_id: e.source_id,
      edge_type: 'FROM',
      properties: {},
      weight: e.weight,
      created_at: e.created_at,
    },
    {
      id: `${e.id}__to`,
      source_id: e.id,
      target_id: e.target_id,
      edge_type: 'TO',
      properties: {},
      weight: e.weight,
      created_at: e.created_at,
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
  // Type membership is read from the ORIGINAL snapshot IS_A edges (not the
  // transformed one) so the selected-type filter is correct in both modes:
  // reification rewrites edges into FROM/TO and would otherwise lose IS_A.
  //
  // The selection only RESTRICTS the graph in restrict mode. The default
  // selection mode is highlight (context-preserving): the graph is left intact
  // and the renderer dims non-members instead. When selectionMode is absent we
  // keep the original restrict behaviour so direct buildGraph callers and the
  // existing test fixtures are unaffected.
  const restrict = filterConfig.selectionMode !== 'highlight'
  const typeMemberIds = restrict
    ? computeTypeMemberIds(snapshot, filterConfig.selectedTypeId ?? null)
    : null
  return processGraph(transformed, filterConfig, typeMemberIds)
}

/** A flat (non-hierarchical) summary of one emergent/ontology type. */
export interface TypeSummary {
  /** type-definition node id (the IS_A target) */
  id: string
  /** human-readable type name, e.g. "chemical element" */
  name: string
  /** number of content nodes that IS_A this type */
  count: number
}

/**
 * Flat list of type-definition entities with their IS_A member counts.
 *
 * Post-NDT a node "type" property holds only its realm (entity, concept,
 * process) plus the literal "type_definition", so emergent type NAMES never
 * appear there. The real type of a node is its IS_A edge to a type-definition
 * node, so membership is read from IS_A edges: the count for a type T is the
 * number of edges with edge_type==="IS_A" and target_id===T.id. Source types
 * are every entity with type==="type_definition" (this intentionally includes
 * realm roots and reserved nodes). Sorted by count descending, then name.
 */
export function deriveTypeSummaries(snapshot: GraphSnapshot): TypeSummary[] {
  const counts = new Map<string, number>()
  for (const e of snapshot.edges) {
    if (e.edge_type === 'IS_A') {
      counts.set(e.target_id, (counts.get(e.target_id) ?? 0) + 1)
    }
  }
  return snapshot.entities
    .filter(e => e.type === 'type_definition')
    .map(e => ({
      id: e.id,
      name: String(e.name || e.properties?.name || e.id),
      count: counts.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/**
 * Build the set of node ids that belong to a selected emergent type: the
 * type-definition node itself plus the source_id of every IS_A edge that
 * targets it. Returns null when nothing is selected (no filtering).
 */
export function computeTypeMemberIds(
  snapshot: GraphSnapshot,
  selectedTypeId: string | null
): Set<string> | null {
  if (!selectedTypeId) return null
  const ids = new Set<string>([selectedTypeId])
  for (const e of snapshot.edges) {
    if (e.edge_type === 'IS_A' && e.target_id === selectedTypeId) {
      ids.add(e.source_id)
    }
  }
  return ids
}

/**
 * Build the id set of the highlight subgraph for a focused node (type or
 * instance): the focus node plus its 1-hop neighbourhood across all edge kinds
 * (IS_A members/parents and semantic neighbours alike). Used to emphasise a
 * subgraph in context, where the renderer dims everything outside this set
 * without removing the rest of the graph. Returns null when nothing is focused.
 *
 * For a type-definition focus this yields the type, its IS_A members (edges
 * targeting it), its child types and parent type; for an instance it yields the
 * node, its type(s) and any semantically related nodes.
 */
export function computeHighlightSubgraphIds(
  snapshot: GraphSnapshot,
  focusId: string | null
): Set<string> | null {
  if (!focusId) return null
  const ids = new Set<string>([focusId])
  for (const e of snapshot.edges) {
    // Keep the other endpoint and, in reified mode, the edge-proxy node itself
    // (rendered with id === e.id) so the proxy bridging the focus to its
    // neighbour stays bright. Harmless in logical mode (no node has that id).
    if (e.source_id === focusId) {
      ids.add(e.target_id)
      ids.add(e.id)
    } else if (e.target_id === focusId) {
      ids.add(e.source_id)
      ids.add(e.id)
    }
  }
  return ids
}

/**
 * Process a graph snapshot into renderable format
 */
export function processGraph(
  snapshot: GraphSnapshot,
  filterConfig: FilterConfig,
  typeMemberIds?: Set<string> | null
): ProcessedGraph {
  // Convert entities to nodes
  let nodes = snapshot.entities.map(entityToNode)

  // Convert edges
  let edges = snapshot.edges.map(edgeToGraphEdge)

  // Skeleton-first (de-hairball): restrict to the type-definition skeleton.
  // Keep only type-definition nodes; the type-to-type IS_A edges survive the
  // edge-visibility filter below. This is the primary default for taming the
  // ~3.8k-instance hairball down to the ~214-type IS_A skeleton.
  const skeletonOnly = filterConfig.skeletonOnly === true
  if (skeletonOnly) {
    nodes = nodes.filter(n => n.type === 'type_definition')
  }

  // Apply filters
  nodes = applyNodeFilters(nodes, filterConfig)

  // Restrict to a selected emergent type: keep only the type node and its
  // IS_A members (see buildGraph / computeTypeMemberIds). Membership comes
  // from IS_A edges, not node.type, since post-NDT node.type is just the realm.
  if (typeMemberIds) {
    nodes = nodes.filter(n => typeMemberIds.has(n.id))
  }

  // Filter edges to only include those with visible nodes
  const nodeIds = new Set(nodes.map(n => n.id))
  edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  // In skeleton mode keep only the type-to-type IS_A hierarchy edges (both
  // endpoints are already type-definition nodes after the node restriction).
  if (skeletonOnly) {
    edges = edges.filter(e => e.type === 'IS_A')
  }

  // Edge-kind toggle: IS_A membership only, semantic (non-IS_A) only, or both.
  // Membership (IS_A) is the bulk of the density, so semantic-only thins it out.
  // Skipped in skeleton mode: that already restricted edges to the type-to-type
  // IS_A hierarchy above, so 'semantic' here would strip every edge and leave
  // an edgeless skeleton.
  if (!skeletonOnly) {
    const edgeKind = filterConfig.edgeKind ?? 'both'
    if (edgeKind === 'is_a') {
      edges = edges.filter(e => e.type === 'IS_A')
    } else if (edgeKind === 'semantic') {
      edges = edges.filter(e => e.type !== 'IS_A')
    }
  }

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

  // Extract embedding if present. Sophia returns it as a top-level API field
  // (entity.embedding); fall back to properties.embedding for other sources.
  const embedding = Array.isArray(entity.embedding)
    ? entity.embedding
    : Array.isArray(props.embedding)
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

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

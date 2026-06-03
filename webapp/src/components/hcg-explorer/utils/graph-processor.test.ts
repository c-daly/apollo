/**
 * Tests for graph-processor utility functions
 */

import { describe, it, expect } from 'vitest'
import { processGraph, buildGraph, isEntityTypeDef, isEdgeTypeDef } from './graph-processor'
import type { GraphSnapshot, FilterConfig, Entity, CausalEdge } from '../types'

const createMockSnapshot = (): GraphSnapshot => ({
  entities: [
    {
      id: 'goal-1',
      type: 'goal',
      properties: { name: 'Navigate to kitchen' },
      labels: ['goal'],
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'plan-1',
      type: 'plan',
      properties: { name: 'Kitchen navigation plan' },
      labels: ['plan'],
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'agent-1',
      type: 'agent',
      properties: { name: 'Navigation agent', status: 'active' },
      labels: ['agent'],
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source_id: 'goal-1',
      target_id: 'plan-1',
      edge_type: 'has_plan',
      properties: {},
      weight: 1,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'edge-2',
      source_id: 'plan-1',
      target_id: 'agent-1',
      edge_type: 'assigned_to',
      properties: {},
      weight: 0.8,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  timestamp: '2024-01-01T00:00:00Z',
  metadata: {
    entity_count: 3,
    edge_count: 2,
  },
})

const defaultFilter: FilterConfig = {
  entityTypes: [],
  edgeTypes: [],
  status: [],
  searchQuery: '',
  propertyFilters: [],
  clusters: [],
}

describe('processGraph', () => {
  it('converts snapshot entities to graph nodes', () => {
    const snapshot = createMockSnapshot()
    const result = processGraph(snapshot, defaultFilter)

    expect(result.nodes.length).toBe(3)

    const goalNode = result.nodes.find(n => n.id === 'goal-1')
    expect(goalNode).toBeDefined()
    expect(goalNode!.type).toBe('goal')
    expect(goalNode!.label).toBe('Navigate to kitchen')
  })

  it('extracts a top-level embedding (Sophia API shape) onto the graph node', () => {
    const snapshot = createMockSnapshot()
    snapshot.entities[0].embedding = [0.1, 0.2, 0.3]
    const result = processGraph(snapshot, defaultFilter)

    const goalNode = result.nodes.find(n => n.id === 'goal-1')
    expect(goalNode!.embedding).toEqual([0.1, 0.2, 0.3])
  })

  it('falls back to properties.embedding when no top-level embedding', () => {
    const snapshot = createMockSnapshot()
    snapshot.entities[1].properties.embedding = [0.4, 0.5, 0.6]
    const result = processGraph(snapshot, defaultFilter)

    const planNode = result.nodes.find(n => n.id === 'plan-1')
    expect(planNode!.embedding).toEqual([0.4, 0.5, 0.6])
  })

  it('leaves embedding undefined when neither source provides one', () => {
    const snapshot = createMockSnapshot()
    const result = processGraph(snapshot, defaultFilter)

    const agentNode = result.nodes.find(n => n.id === 'agent-1')
    expect(agentNode!.embedding).toBeUndefined()
  })

  it('converts snapshot edges to graph edges', () => {
    const snapshot = createMockSnapshot()
    const result = processGraph(snapshot, defaultFilter)

    expect(result.edges.length).toBe(2)

    const edge1 = result.edges.find(e => e.id === 'edge-1')
    expect(edge1).toBeDefined()
    expect(edge1!.source).toBe('goal-1')
    expect(edge1!.target).toBe('plan-1')
    expect(edge1!.type).toBe('has_plan')
  })

  it('filters nodes by entity type', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      entityTypes: ['goal', 'plan'],
    }
    const result = processGraph(snapshot, filter)

    // Should include goal and plan, but filter out agent
    const nodeTypes = result.nodes.map(n => n.type)
    expect(nodeTypes).toContain('goal')
    expect(nodeTypes).toContain('plan')
    expect(nodeTypes).not.toContain('agent')
  })

  it('filters edges by type', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      edgeTypes: ['has_plan'],
    }
    const result = processGraph(snapshot, filter)

    // Should only include has_plan edges
    expect(result.edges.every(e => e.type === 'has_plan')).toBe(true)
  })

  it('filters nodes by status', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      status: ['active'],
    }
    const result = processGraph(snapshot, filter)

    // Only agent-1 has status 'active'
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0].id).toBe('agent-1')
  })

  it('filters by search query on node label', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      searchQuery: 'kitchen',
    }
    const result = processGraph(snapshot, filter)

    // Should match nodes with 'kitchen' in label
    expect(result.nodes.length).toBe(2) // goal-1 and plan-1
    expect(result.nodes.every(n => n.label.toLowerCase().includes('kitchen'))).toBe(true)
  })

  it('filters by search query on node type', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      searchQuery: 'agent',
    }
    const result = processGraph(snapshot, filter)

    // Should match 'agent' type and 'Navigation agent' label
    expect(result.nodes.some(n => n.type === 'agent')).toBe(true)
  })

  it('returns empty graph for empty snapshot', () => {
    const snapshot: GraphSnapshot = {
      entities: [],
      edges: [],
      timestamp: '2024-01-01T00:00:00Z',
      metadata: { entity_count: 0, edge_count: 0 },
    }
    const result = processGraph(snapshot, defaultFilter)

    expect(result.nodes.length).toBe(0)
    expect(result.edges.length).toBe(0)
  })

  it('removes edges referencing filtered-out nodes', () => {
    const snapshot = createMockSnapshot()
    const filter: FilterConfig = {
      ...defaultFilter,
      entityTypes: ['goal'], // Only keep goal nodes
    }
    const result = processGraph(snapshot, filter)

    // All edges should be removed since they reference non-goal nodes
    expect(result.edges.length).toBe(0)
  })

  it('preserves edge weight', () => {
    const snapshot = createMockSnapshot()
    const result = processGraph(snapshot, defaultFilter)

    const edge1 = result.edges.find(e => e.id === 'edge-1')
    expect(edge1!.weight).toBe(1)

    const edge2 = result.edges.find(e => e.id === 'edge-2')
    expect(edge2!.weight).toBe(0.8)
  })

  it('extracts label from entity name property', () => {
    const snapshot: GraphSnapshot = {
      entities: [
        {
          id: 'test-1',
          type: 'test',
          properties: { name: 'Test Name' },
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      edges: [],
      timestamp: '2024-01-01T00:00:00Z',
      metadata: { entity_count: 1, edge_count: 0 },
    }
    const result = processGraph(snapshot, defaultFilter)

    expect(result.nodes[0].label).toBe('Test Name')
  })

  it('extracts label from entity title property', () => {
    const snapshot: GraphSnapshot = {
      entities: [
        {
          id: 'test-1',
          type: 'test',
          properties: { title: 'Test Title' },
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      edges: [],
      timestamp: '2024-01-01T00:00:00Z',
      metadata: { entity_count: 1, edge_count: 0 },
    }
    const result = processGraph(snapshot, defaultFilter)

    expect(result.nodes[0].label).toBe('Test Title')
  })

  it('uses entity ID as label when no name/title property', () => {
    const snapshot: GraphSnapshot = {
      entities: [
        {
          id: 'test-123',
          type: 'test',
          properties: {},
          labels: [],
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      edges: [],
      timestamp: '2024-01-01T00:00:00Z',
      metadata: { entity_count: 1, edge_count: 0 },
    }
    const result = processGraph(snapshot, defaultFilter)

    expect(result.nodes[0].label).toBe('test-123')
  })

  it('generates clusters based on node types', () => {
    const snapshot = createMockSnapshot()
    const result = processGraph(snapshot, defaultFilter)

    expect(result.clusters).toBeDefined()
    expect(Array.isArray(result.clusters)).toBe(true)
  })
})

describe('processGraph referential stability', () => {
  it('returns same node references when data is unchanged', () => {
    const snapshot = createMockSnapshot()
    const filter = defaultFilter

    const result1 = processGraph(snapshot, filter)
    const result2 = processGraph(snapshot, filter)

    // Same snapshot + same filter = nodes should have same content
    expect(result1.nodes.length).toBe(result2.nodes.length)
    expect(result1.nodes.map(n => n.id)).toEqual(result2.nodes.map(n => n.id))
  })
})

describe('faithful views (logical vs reified)', () => {
  // A content node, an entity-type-def (UUID id, is_type_definition), an
  // edge-type-def metadata node (ancestors include edge_type), and one real
  // IS_A edge already collapsed by the snapshot API.
  const T = '2024-01-01T00:00:00Z'
  const entities: Entity[] = [
    { id: 'n1', type: 'entity', name: 'dog', properties: {}, labels: [], created_at: T },
    {
      id: 'u-typedef',
      type: 'animal',
      name: 'mammal',
      properties: { is_type_definition: true, ancestors: ['root'] },
      labels: [],
      created_at: T,
    },
    {
      id: 'u-edgedef',
      type: 'IS_A',
      name: 'IS_A',
      properties: { is_type_definition: true, ancestors: ['edge_type'] },
      labels: [],
      created_at: T,
    },
  ]
  const edges: CausalEdge[] = [
    {
      id: 'e1',
      source_id: 'n1',
      target_id: 'u-typedef',
      edge_type: 'IS_A',
      properties: {},
      weight: 1,
      created_at: T,
    },
  ]
  const snapshot: GraphSnapshot = { entities, edges, timestamp: T, metadata: {} }

  it('detects type-defs by property, not id prefix', () => {
    expect(isEntityTypeDef(entities[1])).toBe(true)
    expect(isEdgeTypeDef(entities[1])).toBe(false)
    expect(isEdgeTypeDef(entities[2])).toBe(true) // the IS_A metadata node
    expect(isEntityTypeDef(entities[2])).toBe(false)
    expect(isEntityTypeDef(entities[0])).toBe(false)
  })

  it('logical view: IS_A is an edge, edge-type-def node is gone', () => {
    const g = buildGraph(snapshot, 'logical', defaultFilter)
    // edge-type-def metadata node ('IS_A') must NOT be a node
    expect(g.nodes.find(n => n.id === 'u-edgedef')).toBeUndefined()
    // content node + entity-type-def remain
    expect(g.nodes.map(n => n.id).sort()).toEqual(['n1', 'u-typedef'])
    // the relation renders as a real edge, not a node
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'n1', target: 'u-typedef', type: 'IS_A' })
  })

  it('reified view: every edge becomes a node with FROM/TO links', () => {
    const g = buildGraph(snapshot, 'reified', defaultFilter)
    // the e1 edge is now a node
    const edgeNode = g.nodes.find(n => n.id === 'e1')
    expect(edgeNode).toBeDefined()
    expect(edgeNode!.type).toBe('edge')
    // all original entities still present as nodes (incl. both type-defs)
    expect(g.nodes.find(n => n.id === 'u-edgedef')).toBeDefined()
    // structural links: e1 -FROM-> n1 and e1 -TO-> u-typedef
    const from = g.edges.find(e => e.id === 'e1__from')
    const to = g.edges.find(e => e.id === 'e1__to')
    expect(from).toMatchObject({ source: 'e1', target: 'n1', type: 'FROM' })
    expect(to).toMatchObject({ source: 'e1', target: 'u-typedef', type: 'TO' })
  })
})

/**
 * Tests for the de-hairball viewer improvements (graph-processor pure logic):
 * skeleton-first restriction, edge-kind filtering, highlight-subgraph ids, and
 * the highlight-vs-restrict selection-mode gate in buildGraph.
 */

import { describe, it, expect } from 'vitest'
import {
  processGraph,
  buildGraph,
  computeHighlightSubgraphIds,
} from './graph-processor'
import type { GraphSnapshot, FilterConfig, CausalEdge } from '../types'

const baseFilter: FilterConfig = {
  entityTypes: [],
  edgeTypes: [],
  status: [],
  searchQuery: '',
  propertyFilters: [],
  clusters: [],
  selectedTypeId: null,
}

function edge(
  id: string,
  source: string,
  target: string,
  edgeType: string
): CausalEdge {
  return {
    id,
    source_id: source,
    target_id: target,
    edge_type: edgeType,
    properties: {},
    weight: 1,
    created_at: '',
  }
}

// Post-NDT shape: a realm-root type def (entity), emergent type defs joined by
// type-to-type IS_A, instances joined to types by member-to-type IS_A, plus a
// semantic (non-IS_A) edge between two instances.
const snap = (): GraphSnapshot => ({
  entities: [
    { id: 'type_entity', type: 'type_definition', name: 'entity', properties: {}, labels: [] },
    { id: 'type_elem', type: 'type_definition', name: 'chemical element', properties: {}, labels: [] },
    { id: 'type_metal', type: 'type_definition', name: 'metal', properties: {}, labels: [] },
    { id: 'iron', type: 'entity', name: 'Iron', properties: {}, labels: [] },
    { id: 'gold', type: 'entity', name: 'Gold', properties: {}, labels: [] },
  ],
  edges: [
    edge('te1', 'type_elem', 'type_entity', 'IS_A'),
    edge('te2', 'type_metal', 'type_elem', 'IS_A'),
    edge('me1', 'iron', 'type_metal', 'IS_A'),
    edge('me2', 'gold', 'type_elem', 'IS_A'),
    edge('se1', 'iron', 'gold', 'RELATED'),
  ],
  timestamp: '',
  metadata: {},
})

describe('skeleton-first restriction', () => {
  it('keeps only type_definition nodes when skeletonOnly is true', () => {
    const g = processGraph(snap(), { ...baseFilter, skeletonOnly: true })
    expect(g.nodes.every(n => n.type === 'type_definition')).toBe(true)
    expect(g.nodes.map(n => n.id).sort()).toEqual([
      'type_elem',
      'type_entity',
      'type_metal',
    ])
  })

  it('keeps only type-to-type IS_A edges in the skeleton', () => {
    const g = processGraph(snap(), { ...baseFilter, skeletonOnly: true })
    expect(g.edges.every(e => e.type === 'IS_A')).toBe(true)
    expect(g.edges.map(e => e.id).sort()).toEqual(['te1', 'te2'])
  })

  it('shows the full graph when skeletonOnly is false or absent', () => {
    const g = processGraph(snap(), baseFilter)
    expect(g.nodes).toHaveLength(5)
    expect(g.edges).toHaveLength(5)
  })

  it('buildGraph applies the skeleton restriction too', () => {
    const g = buildGraph(snap(), 'logical', { ...baseFilter, skeletonOnly: true })
    expect(g.nodes.map(n => n.id).sort()).toEqual([
      'type_elem',
      'type_entity',
      'type_metal',
    ])
    expect(g.edges.map(e => e.id).sort()).toEqual(['te1', 'te2'])
  })
})

describe('edge-kind filtering', () => {
  it('keeps every edge for both, the default', () => {
    expect(processGraph(snap(), baseFilter).edges).toHaveLength(5)
    expect(
      processGraph(snap(), { ...baseFilter, edgeKind: 'both' }).edges
    ).toHaveLength(5)
  })

  it('keeps only IS_A edges for is_a', () => {
    const g = processGraph(snap(), { ...baseFilter, edgeKind: 'is_a' })
    expect(g.edges.every(e => e.type === 'IS_A')).toBe(true)
    expect(g.edges).toHaveLength(4)
  })

  it('keeps only non-IS_A edges for semantic', () => {
    const g = processGraph(snap(), { ...baseFilter, edgeKind: 'semantic' })
    expect(g.edges.map(e => e.id)).toEqual(['se1'])
  })
})

describe('computeHighlightSubgraphIds', () => {
  it('returns null when nothing is focused', () => {
    expect(computeHighlightSubgraphIds(snap(), null)).toBeNull()
  })

  it('includes a type plus its members, child types and parent type', () => {
    const ids = computeHighlightSubgraphIds(snap(), 'type_elem')!
    expect([...ids].sort()).toEqual([
      'gold',
      'type_elem',
      'type_entity',
      'type_metal',
    ])
  })

  it('includes an instance plus its type and semantic neighbours', () => {
    const ids = computeHighlightSubgraphIds(snap(), 'iron')!
    expect([...ids].sort()).toEqual(['gold', 'iron', 'type_metal'])
  })
})

describe('selection-mode gate, highlight vs restrict', () => {
  it('restricts to the selected type when selectionMode is absent', () => {
    const g = buildGraph(snap(), 'logical', {
      ...baseFilter,
      selectedTypeId: 'type_elem',
    })
    expect(g.nodes.map(n => n.id).sort()).toEqual([
      'gold',
      'type_elem',
      'type_metal',
    ])
  })

  it('does not restrict in highlight mode, context preserved', () => {
    const g = buildGraph(snap(), 'logical', {
      ...baseFilter,
      selectedTypeId: 'type_elem',
      selectionMode: 'highlight',
    })
    expect(g.nodes).toHaveLength(5)
  })
})

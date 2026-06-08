/**
 * Tests for the flat, IS_A-driven Types filter: deriveTypeSummaries,
 * computeTypeMemberIds, and buildGraph type-member filtering.
 */

import { describe, it, expect } from 'vitest'
import {
  deriveTypeSummaries,
  computeTypeMemberIds,
  buildGraph,
} from './graph-processor'
import type { GraphSnapshot, FilterConfig, CausalEdge } from '../types'

const defaultFilter: FilterConfig = {
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

// Snapshot where the emergent type is defined by IS_A edges, while node.type is
// only the realm (entity/concept) - exactly the post-NDT shape.
const typedSnapshot = (): GraphSnapshot => ({
  entities: [
    {
      id: 'type_elem',
      type: 'type_definition',
      name: 'chemical element',
      properties: {},
      labels: [],
    },
    {
      id: 'type_metal',
      type: 'type_definition',
      name: 'metal',
      properties: {},
      labels: [],
    },
    { id: 'iron', type: 'entity', name: 'Iron', properties: {}, labels: [] },
    { id: 'gold', type: 'entity', name: 'Gold', properties: {}, labels: [] },
    {
      id: 'oxygen',
      type: 'concept',
      name: 'Oxygen',
      properties: {},
      labels: [],
    },
  ],
  edges: [
    edge('e1', 'iron', 'type_elem', 'IS_A'),
    edge('e2', 'gold', 'type_elem', 'IS_A'),
    edge('e3', 'oxygen', 'type_elem', 'IS_A'),
    edge('e4', 'iron', 'type_metal', 'IS_A'),
    edge('e5', 'iron', 'gold', 'RELATED'),
  ],
  timestamp: '',
  metadata: {},
})

describe('deriveTypeSummaries', () => {
  it('lists type_definition entities with IS_A member counts, sorted desc', () => {
    const summaries = deriveTypeSummaries(typedSnapshot())
    expect(summaries.map(t => t.name)).toEqual(['chemical element', 'metal'])
    expect(summaries.find(t => t.id === 'type_elem')!.count).toBe(3)
    expect(summaries.find(t => t.id === 'type_metal')!.count).toBe(1)
  })

  it('counts membership from IS_A edges, not node.type', () => {
    // oxygen has node.type "concept" but IS_A chemical element -> must count
    const summaries = deriveTypeSummaries(typedSnapshot())
    expect(summaries.find(t => t.id === 'type_elem')!.count).toBe(3)
  })

  it('ignores non-IS_A edges when counting', () => {
    const summaries = deriveTypeSummaries(typedSnapshot())
    // the RELATED edge iron->gold must not turn gold into a type
    expect(summaries.find(t => t.id === 'gold')).toBeUndefined()
  })
})

describe('computeTypeMemberIds', () => {
  it('returns null when nothing is selected', () => {
    expect(computeTypeMemberIds(typedSnapshot(), null)).toBeNull()
  })

  it('includes the type node and every IS_A source', () => {
    const ids = computeTypeMemberIds(typedSnapshot(), 'type_elem')!
    expect([...ids].sort()).toEqual(['gold', 'iron', 'oxygen', 'type_elem'])
  })
})

describe('buildGraph type filter', () => {
  it('restricts the graph to the selected type node + its IS_A members', () => {
    const g = buildGraph(typedSnapshot(), 'logical', {
      ...defaultFilter,
      selectedTypeId: 'type_elem',
    })
    expect(g.nodes.map(n => n.id).sort()).toEqual([
      'gold',
      'iron',
      'oxygen',
      'type_elem',
    ])
  })

  it('shows everything when no type is selected', () => {
    const g = buildGraph(typedSnapshot(), 'logical', defaultFilter)
    expect(g.nodes).toHaveLength(5)
  })
})

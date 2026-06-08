import { describe, it, expect } from 'vitest'
import { snapshotFingerprint } from './snapshot-fingerprint'
import type { HCGGraphSnapshot } from '../../../hooks/useHCG'

const snap = (over: Partial<HCGGraphSnapshot> = {}): HCGGraphSnapshot => ({
  entities: [
    { id: 'type_metal', type: 'type_definition', name: 'metal', properties: {}, labels: [] },
    { id: 'iron', type: 'entity', name: 'Iron', properties: {}, labels: [] },
  ],
  edges: [{ id: 'me1', source_id: 'iron', target_id: 'type_metal', edge_type: 'IS_A', properties: {} }],
  entity_count: 2,
  edge_count: 1,
  timestamp: '2026-06-08T15:31:38.166985+00:00',
  ...over,
})

describe('snapshotFingerprint', () => {
  it('is stable when only the server timestamp changes', () => {
    const a = snapshotFingerprint(snap())
    const b = snapshotFingerprint(snap({ timestamp: '2026-06-08T15:31:39.411820+00:00' }))
    expect(a).toBe(b)
  })

  it('changes when an entity is added', () => {
    const base = snapshotFingerprint(snap())
    const withMore = snapshotFingerprint(
      snap({
        entities: [
          ...snap().entities,
          { id: 'gold', type: 'entity', name: 'Gold', properties: {}, labels: [] },
        ],
        entity_count: 3,
      })
    )
    expect(withMore).not.toBe(base)
  })

  it('changes when an entity is renamed', () => {
    const base = snapshotFingerprint(snap())
    const renamed = snapshotFingerprint(
      snap({
        entities: [
          { id: 'type_metal', type: 'type_definition', name: 'metal', properties: {}, labels: [] },
          { id: 'iron', type: 'entity', name: 'Ferrum', properties: {}, labels: [] },
        ],
      })
    )
    expect(renamed).not.toBe(base)
  })

  it('changes when an edge is rewired', () => {
    const base = snapshotFingerprint(snap())
    const rewired = snapshotFingerprint(
      snap({
        edges: [{ id: 'me1', source_id: 'iron', target_id: 'type_other', edge_type: 'IS_A', properties: {} }],
      })
    )
    expect(rewired).not.toBe(base)
  })

  it('is deterministic across repeated calls on equal input', () => {
    expect(snapshotFingerprint(snap())).toBe(snapshotFingerprint(snap()))
  })
})

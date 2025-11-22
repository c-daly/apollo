import { describe, expect, it } from 'vitest'
import type { Entity, GraphSnapshot } from '../types/hcg'
import {
  summarizeSnapshot,
  computeWorldDeltas,
  formatPosition,
} from './world-state'

const makeEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: overrides.id ?? 'entity_1',
  type: overrides.type ?? 'agent',
  properties: overrides.properties ?? { name: 'Test', status: 'idle' },
  labels: overrides.labels ?? [],
  created_at: overrides.created_at,
  updated_at: overrides.updated_at,
})

const makeSnapshot = (entities: Entity[]): GraphSnapshot => ({
  entities,
  edges: [],
  timestamp: new Date().toISOString(),
  metadata: {},
})

describe('world-state helpers', () => {
  it('summarizes entities by id', () => {
    const snapshot = makeSnapshot([
      makeEntity({ id: 'a', properties: { name: 'Alpha', status: 'ready' } }),
      makeEntity({ id: 'b', properties: { description: 'Beta agent' } }),
    ])

    const summaries = summarizeSnapshot(snapshot)
    expect(summaries.size).toBe(2)
    expect(summaries.get('a')?.name).toBe('Alpha')
    expect(summaries.get('b')?.name).toBe('Beta agent')
  })

  it('detects added and removed entities', () => {
    const prev = summarizeSnapshot(makeSnapshot([makeEntity({ id: 'a' })]))
    const next = summarizeSnapshot(
      makeSnapshot([makeEntity({ id: 'b', properties: { name: 'Bravo' } })])
    )

    const deltas = computeWorldDeltas(prev, next)
    expect(deltas).toHaveLength(2)
    expect(deltas.map(d => d.type).sort()).toEqual(['added', 'removed'])
  })

  it('detects status changes', () => {
    const prev = summarizeSnapshot(
      makeSnapshot([
        makeEntity({
          id: 'plan',
          type: 'plan',
          properties: { status: 'pending' },
        }),
      ])
    )
    const next = summarizeSnapshot(
      makeSnapshot([
        makeEntity({
          id: 'plan',
          type: 'plan',
          properties: { status: 'completed' },
        }),
      ])
    )

    const deltas = computeWorldDeltas(prev, next)
    expect(deltas).toHaveLength(1)
    expect(deltas[0]).toMatchObject({
      id: 'plan',
      type: 'status',
    })
  })

  it('detects position changes', () => {
    const prev = summarizeSnapshot(
      makeSnapshot([
        makeEntity({
          id: 'agent',
          properties: { x: 1, y: 1 },
        }),
      ])
    )
    const next = summarizeSnapshot(
      makeSnapshot([
        makeEntity({
          id: 'agent',
          properties: { x: 1.5, y: 1 },
        }),
      ])
    )

    const deltas = computeWorldDeltas(prev, next)
    expect(deltas).toHaveLength(1)
    expect(deltas[0].type).toBe('position')
  })

  it('formats positions gracefully', () => {
    const summary = summarizeSnapshot(
      makeSnapshot([
        makeEntity({
          id: 'agent',
          properties: { x: 1.2345, y: 2.5 },
        }),
      ])
    ).get('agent')

    expect(formatPosition(summary)).toBe('x:1.2 y:2.5')
    expect(formatPosition()).toBe('—')
  })
})

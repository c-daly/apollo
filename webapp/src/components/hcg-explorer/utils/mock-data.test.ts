/**
 * Tests for mock-data generation utilities
 */

import { describe, it, expect } from 'vitest'
import { generateMockSnapshot, generateMockHistory } from './mock-data'

describe('generateMockSnapshot', () => {
  it('generates a snapshot with entities and edges', () => {
    const snapshot = generateMockSnapshot()

    expect(snapshot.entities.length).toBeGreaterThan(0)
    expect(snapshot.edges.length).toBeGreaterThan(0)
    expect(snapshot.timestamp).toBeDefined()
  })

  it('generates entities with required properties', () => {
    const snapshot = generateMockSnapshot()

    for (const entity of snapshot.entities) {
      expect(entity.id).toBeDefined()
      expect(entity.type).toBeDefined()
      expect(entity.properties).toBeDefined()
      expect(entity.labels).toBeDefined()
      expect(Array.isArray(entity.labels)).toBe(true)
    }
  })

  it('generates edges with required properties', () => {
    const snapshot = generateMockSnapshot()

    for (const edge of snapshot.edges) {
      expect(edge.id).toBeDefined()
      expect(edge.source_id).toBeDefined()
      expect(edge.target_id).toBeDefined()
      expect(edge.edge_type).toBeDefined()
      expect(typeof edge.weight).toBe('number')
    }
  })

  it('generates edges that reference existing entities', () => {
    const snapshot = generateMockSnapshot()
    const entityIds = new Set(snapshot.entities.map(e => e.id))

    for (const edge of snapshot.edges) {
      expect(entityIds.has(edge.source_id)).toBe(true)
      expect(entityIds.has(edge.target_id)).toBe(true)
    }
  })

  it('generates diverse entity types', () => {
    const snapshot = generateMockSnapshot()
    const types = new Set(snapshot.entities.map(e => e.type))

    // Should have multiple different types
    expect(types.size).toBeGreaterThan(1)
  })

  it('generates diverse edge types', () => {
    const snapshot = generateMockSnapshot()
    const types = new Set(snapshot.edges.map(e => e.edge_type))

    // Should have multiple different edge types
    expect(types.size).toBeGreaterThan(1)
  })

  it('generates consistent metadata counts', () => {
    const snapshot = generateMockSnapshot()

    expect(snapshot.metadata?.entity_count).toBe(snapshot.entities.length)
    expect(snapshot.metadata?.edge_count).toBe(snapshot.edges.length)
  })

  it('generates unique entity IDs', () => {
    const snapshot = generateMockSnapshot()
    const ids = snapshot.entities.map(e => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })

  it('generates unique edge IDs', () => {
    const snapshot = generateMockSnapshot()
    const ids = snapshot.edges.map(e => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('generateMockHistory', () => {
  it('generates an array of snapshots', () => {
    const history = generateMockHistory(5)

    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBe(5)
  })

  it('generates valid snapshots in history', () => {
    const history = generateMockHistory(3)

    for (const snapshot of history) {
      expect(snapshot.entities).toBeDefined()
      expect(snapshot.edges).toBeDefined()
      expect(snapshot.timestamp).toBeDefined()
    }
  })

  it('generates snapshots with different timestamps', () => {
    const history = generateMockHistory(3)
    const timestamps = history.map(s => s.timestamp)
    const uniqueTimestamps = new Set(timestamps)

    expect(uniqueTimestamps.size).toBe(timestamps.length)
  })

  it('generates chronologically ordered snapshots', () => {
    const history = generateMockHistory(5)

    for (let i = 1; i < history.length; i++) {
      const prevTime = new Date(history[i - 1].timestamp).getTime()
      const currTime = new Date(history[i].timestamp).getTime()
      expect(currTime).toBeGreaterThanOrEqual(prevTime)
    }
  })

  it('defaults to 10 snapshots when count not specified', () => {
    const history = generateMockHistory()

    expect(history.length).toBe(10)
  })

  it('handles count of 0', () => {
    const history = generateMockHistory(0)

    expect(history.length).toBe(0)
  })

  it('handles count of 1', () => {
    const history = generateMockHistory(1)

    expect(history.length).toBe(1)
    expect(history[0].entities).toBeDefined()
  })
})

/**
 * Tests for embedding-service functions
 */

import { describe, it, expect } from 'vitest'
import {
  projectTo3D,
  projectNodesTo3D,
} from './embedding-service'
import type { GraphNode } from '../types'

describe('projectTo3D', () => {
  it('returns empty map for empty input', () => {
    const embeddings = new Map<string, number[]>()
    const positions = projectTo3D(embeddings)
    expect(positions.size).toBe(0)
  })

  it('returns positions for each input node', () => {
    const embeddings = new Map<string, number[]>([
      ['node1', [1, 0, 0, 0, 0]],
      ['node2', [0, 1, 0, 0, 0]],
      ['node3', [0, 0, 1, 0, 0]],
    ])
    const positions = projectTo3D(embeddings)

    expect(positions.size).toBe(3)
    expect(positions.has('node1')).toBe(true)
    expect(positions.has('node2')).toBe(true)
    expect(positions.has('node3')).toBe(true)
  })

  it('returns positions with x, y, z coordinates', () => {
    const embeddings = new Map<string, number[]>([
      ['node1', [1, 2, 3, 4, 5]],
    ])
    const positions = projectTo3D(embeddings)
    const pos = positions.get('node1')!

    expect(pos).toHaveProperty('x')
    expect(pos).toHaveProperty('y')
    expect(pos).toHaveProperty('z')
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
    expect(typeof pos.z).toBe('number')
  })

  it('separates dissimilar embeddings in 3D space', () => {
    // Create embeddings that are very different
    const embeddings = new Map<string, number[]>([
      ['node1', [10, 0, 0, 0, 0, 0, 0, 0]],
      ['node2', [0, 0, 0, 0, 10, 0, 0, 0]],
    ])
    const positions = projectTo3D(embeddings)

    const pos1 = positions.get('node1')!
    const pos2 = positions.get('node2')!

    // Calculate Euclidean distance
    const distance = Math.sqrt(
      (pos1.x - pos2.x) ** 2 +
      (pos1.y - pos2.y) ** 2 +
      (pos1.z - pos2.z) ** 2
    )

    // Dissimilar embeddings should be far apart
    expect(distance).toBeGreaterThan(0)
  })
})

describe(projectNodesTo3D, () => {
  function node(id: string, embedding?: number[]): GraphNode {
    return {
      id,
      label: id,
      type: 'entity',
      properties: {},
      embedding,
      raw: {},
    } as unknown as GraphNode
  }

  it('projects embedded nodes and reports the embedded count', () => {
    const nodes = [
      node('a', [1, 0, 0, 0]),
      node('b', [0, 1, 0, 0]),
      node('c', [0, 0, 1, 0]),
    ]
    const { positions, embeddedCount } = projectNodesTo3D(nodes)
    expect(embeddedCount).toBe(3)
    expect(positions.size).toBe(3)
    for (const id of ['a', 'b', 'c']) {
      const p = positions.get(id)!
      expect(p).toBeDefined()
      expect(p.every(c => Number.isFinite(c))).toBe(true)
    }
    // Distinct embeddings must not collapse to a single point.
    expect(positions.get('a')).not.toEqual(positions.get('b'))
  })

  it('places nodes without embeddings on a visible off-origin shell', () => {
    const nodes = [
      node('a', [1, 0, 0, 0]),
      node('b', [0, 1, 0, 0]),
      node('c'),
    ]
    const { positions, embeddedCount } = projectNodesTo3D(nodes)
    expect(embeddedCount).toBe(2)
    expect(positions.size).toBe(3)
    const c = positions.get('c')!
    expect(Math.hypot(c[0], c[1], c[2])).toBeGreaterThan(150)
    expect(c).not.toEqual([0, 0, 0])
  })

  it('reports embeddedCount 0 when no node carries an embedding', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const { positions, embeddedCount } = projectNodesTo3D(nodes)
    expect(embeddedCount).toBe(0)
    expect(positions.size).toBe(3)
    for (const id of ['a', 'b', 'c']) {
      const p = positions.get(id)!
      expect(Math.hypot(p[0], p[1], p[2])).toBeGreaterThan(150)
    }
  })
})

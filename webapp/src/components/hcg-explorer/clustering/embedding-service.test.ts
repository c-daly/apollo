/**
 * Tests for embedding-service functions
 */

import { describe, it, expect } from 'vitest'
import {
  projectTo3D,
  projectNodesTo3D,
  cosineSimilarity,
  clusterByEmbedding,
} from './embedding-service'
import type { GraphNode } from '../types'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    const a = [1, 2, 3]
    const b = [-1, -2, -3]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1)
  })

  it('returns 0 for mismatched dimensions', () => {
    const a = [1, 2, 3]
    const b = [1, 2]
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    const a = [0, 0, 0]
    const b = [1, 2, 3]
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('handles normalized vectors correctly', () => {
    const a = [0.6, 0.8, 0]
    const b = [0.8, 0.6, 0]
    // dot product = 0.48 + 0.48 = 0.96
    // both vectors already have norm 1
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96)
  })
})

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

describe('clusterByEmbedding', () => {
  it('returns empty map for empty input', () => {
    const embeddings = new Map<string, number[]>()
    const clusters = clusterByEmbedding(embeddings, 3)
    expect(clusters.size).toBe(0)
  })

  it('assigns each node to a cluster', () => {
    const embeddings = new Map<string, number[]>([
      ['node1', [1, 0, 0]],
      ['node2', [0, 1, 0]],
      ['node3', [0, 0, 1]],
      ['node4', [1, 1, 0]],
      ['node5', [0, 1, 1]],
    ])
    const clusters = clusterByEmbedding(embeddings, 2)

    expect(clusters.size).toBe(5)
    for (const nodeId of embeddings.keys()) {
      expect(clusters.has(nodeId)).toBe(true)
    }
  })

  it('assigns own cluster when nodes <= numClusters', () => {
    const embeddings = new Map<string, number[]>([
      ['node1', [1, 0, 0]],
      ['node2', [0, 1, 0]],
    ])
    const clusters = clusterByEmbedding(embeddings, 5)

    expect(clusters.size).toBe(2)
    // Each node should have a unique cluster
    const clusterIds = new Set(clusters.values())
    expect(clusterIds.size).toBe(2)
  })

  it('groups similar embeddings together', () => {
    // Create two clear groups of similar embeddings
    const embeddings = new Map<string, number[]>([
      ['a1', [1, 0, 0, 0]],
      ['a2', [0.9, 0.1, 0, 0]],
      ['a3', [0.95, 0.05, 0, 0]],
      ['b1', [0, 0, 1, 0]],
      ['b2', [0, 0, 0.9, 0.1]],
      ['b3', [0, 0, 0.95, 0.05]],
    ])
    const clusters = clusterByEmbedding(embeddings, 2)

    // All 'a' nodes should be in the same cluster
    const aCluster = clusters.get('a1')!
    expect(clusters.get('a2')).toBe(aCluster)
    expect(clusters.get('a3')).toBe(aCluster)

    // All 'b' nodes should be in the same cluster
    const bCluster = clusters.get('b1')!
    expect(clusters.get('b2')).toBe(bCluster)
    expect(clusters.get('b3')).toBe(bCluster)

    // 'a' and 'b' groups should be in different clusters
    expect(aCluster).not.toBe(bCluster)
  })

  it('returns cluster IDs as non-negative integers', () => {
    const embeddings = new Map<string, number[]>([
      ['node1', [1, 2, 3]],
      ['node2', [4, 5, 6]],
      ['node3', [7, 8, 9]],
    ])
    const clusters = clusterByEmbedding(embeddings, 2)

    for (const clusterId of clusters.values()) {
      expect(Number.isInteger(clusterId)).toBe(true)
      expect(clusterId).toBeGreaterThanOrEqual(0)
    }
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

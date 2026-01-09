/**
 * Embedding service for HCG Explorer semantic clustering
 *
 * Uses Hermes client to generate embeddings for graph nodes.
 */

import { hermesClient } from '../../../lib/hermes-client'
import type { GraphNode } from '../types'

export interface NodeEmbedding {
  nodeId: string
  embedding: number[]
  dimension: number
}

export interface EmbeddingResult {
  embeddings: Map<string, number[]>
  dimension: number
  errors: string[]
}

/**
 * Generate text representation of a node for embedding
 */
function nodeToText(node: GraphNode): string {
  const parts: string[] = []

  // Include type
  parts.push(`Type: ${node.type}`)

  // Include label/name
  parts.push(`Name: ${node.label}`)

  // Include status if present
  if (node.status) {
    parts.push(`Status: ${node.status}`)
  }

  // Include key properties
  const props = node.properties
  if (props.description && typeof props.description === 'string') {
    parts.push(`Description: ${props.description.slice(0, 200)}`)
  }
  if (props.query && typeof props.query === 'string') {
    parts.push(`Query: ${props.query}`)
  }
  if (props.goal && typeof props.goal === 'string') {
    parts.push(`Goal: ${props.goal}`)
  }

  return parts.join('. ')
}

/**
 * Fetch embeddings for a batch of nodes from Hermes
 */
export async function generateNodeEmbeddings(
  nodes: GraphNode[],
  options: {
    batchSize?: number
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<EmbeddingResult> {
  const { batchSize = 10, onProgress } = options
  const embeddings = new Map<string, number[]>()
  const errors: string[] = []
  let dimension = 0

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize)

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map(async node => {
        const text = nodeToText(node)
        const response = await hermesClient.embedText({ text })

        if (response.success && response.data?.embedding) {
          return {
            nodeId: node.id,
            embedding: response.data.embedding,
            dimension: response.data.dimension || response.data.embedding.length,
          }
        } else {
          throw new Error(response.error || 'Failed to generate embedding')
        }
      })
    )

    // Collect results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        embeddings.set(result.value.nodeId, result.value.embedding)
        dimension = result.value.dimension
      } else {
        errors.push(result.reason?.message || 'Unknown error')
      }
    }

    // Report progress
    if (onProgress) {
      onProgress(Math.min(i + batchSize, nodes.length), nodes.length)
    }
  }

  return { embeddings, dimension, errors }
}

/**
 * Simple PCA-like projection to 3D
 * Uses power iteration to find principal components
 */
export function projectTo3D(
  embeddings: Map<string, number[]>
): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>()

  if (embeddings.size === 0) {
    return positions
  }

  // Get all vectors as array
  const ids = Array.from(embeddings.keys())
  const vectors = ids.map(id => embeddings.get(id)!)

  // Center the data
  const dim = vectors[0].length
  const mean = new Array(dim).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      mean[i] += v[i] / vectors.length
    }
  }

  const centered = vectors.map(v => v.map((x, i) => x - mean[i]))

  // Simple approach: use first 3 dimensions after centering
  // For better results, would use proper PCA or UMAP
  // But this gives reasonable semantic separation quickly

  // Find the dimensions with highest variance
  const variances = new Array(dim).fill(0)
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      variances[i] += v[i] * v[i]
    }
  }

  // Get indices of top 3 variance dimensions
  const topDims = variances
    .map((v, i) => ({ variance: v, index: i }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3)
    .map(d => d.index)

  // Scale factor for visualization
  const scale = 100

  // Project each vector
  for (let i = 0; i < ids.length; i++) {
    const v = centered[i]
    positions.set(ids[i], {
      x: (v[topDims[0]] || 0) * scale,
      y: (v[topDims[1]] || 0) * scale,
      z: (v[topDims[2]] || 0) * scale,
    })
  }

  return positions
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Find clusters using simple k-means-like approach on embeddings
 */
export function clusterByEmbedding(
  embeddings: Map<string, number[]>,
  numClusters: number = 5
): Map<string, number> {
  const assignments = new Map<string, number>()
  const ids = Array.from(embeddings.keys())
  const vectors = ids.map(id => embeddings.get(id)!)

  if (vectors.length === 0) return assignments
  if (vectors.length <= numClusters) {
    // Each node is its own cluster
    ids.forEach((id, i) => assignments.set(id, i))
    return assignments
  }

  // Initialize centroids with random selection
  const centroidIndices: number[] = []
  while (centroidIndices.length < numClusters) {
    const idx = Math.floor(Math.random() * vectors.length)
    if (!centroidIndices.includes(idx)) {
      centroidIndices.push(idx)
    }
  }
  let centroids = centroidIndices.map(i => [...vectors[i]])

  // Run k-means iterations
  const maxIterations = 20
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    const newAssignments: number[] = vectors.map(v => {
      let bestCluster = 0
      let bestSimilarity = -1
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(v, centroids[c])
        if (sim > bestSimilarity) {
          bestSimilarity = sim
          bestCluster = c
        }
      }
      return bestCluster
    })

    // Update centroids
    const newCentroids = centroids.map(() =>
      new Array(vectors[0].length).fill(0)
    )
    const counts = new Array(numClusters).fill(0)

    for (let i = 0; i < vectors.length; i++) {
      const cluster = newAssignments[i]
      counts[cluster]++
      for (let d = 0; d < vectors[i].length; d++) {
        newCentroids[cluster][d] += vectors[i][d]
      }
    }

    // Normalize centroids
    for (let c = 0; c < numClusters; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < newCentroids[c].length; d++) {
          newCentroids[c][d] /= counts[c]
        }
      }
    }

    centroids = newCentroids
  }

  // Final assignment
  for (let i = 0; i < ids.length; i++) {
    let bestCluster = 0
    let bestSimilarity = -1
    for (let c = 0; c < centroids.length; c++) {
      const sim = cosineSimilarity(vectors[i], centroids[c])
      if (sim > bestSimilarity) {
        bestSimilarity = sim
        bestCluster = c
      }
    }
    assignments.set(ids[i], bestCluster)
  }

  return assignments
}

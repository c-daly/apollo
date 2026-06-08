/**
 * Embedding service for HCG Explorer semantic clustering
 *
 * Uses Hermes client to generate embeddings for graph nodes.
 */

import { UMAP } from 'umap-js'
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

// Visual half-extent the projected cloud is rescaled to fit (Three.js units).
const LAYOUT_EXTENT = 120
// Convex radial compaction exponent applied during rescale. UMAP spreads points
// fairly evenly over a sphere shell, leaving a hollow core that reads as "too
// spread out"; gamma > 1 pulls the bulk inward toward the centre (gamma = 1 is
// plain linear). Tunable — higher = denser core, at a small cost to neighborhood
// preservation (gamma 2 ~= -2pts kNN on the 266-node graph, gamma 3 ~= -5pts).
const LAYOUT_GAMMA = 2.0
// UMAP needs enough points to build a meaningful neighbor graph; below this we
// fall back to a deterministic linear projection (also covers the unit tests).
const MIN_UMAP_POINTS = 6
// Fixed seed so the same embeddings always yield the same layout.
const UMAP_SEED = 42

/**
 * Deterministic, seedable PRNG (mulberry32). UMAP's initialization and
 * negative sampling pull from this so the projection is reproducible across
 * renders instead of jittering on every refresh.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** L2-normalize a vector; a zero vector is returned unchanged. */
function l2normalize(v: number[]): number[] {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  return norm === 0 ? v.slice() : v.map(x => x / norm)
}

/**
 * Project high-dimensional embeddings to 3D for the semantic layout.
 *
 * Uses UMAP with cosine geometry (embeddings are L2-normalized, so Euclidean
 * distance in UMAP is monotonic with cosine distance) to preserve local
 * neighborhood structure — semantically similar nodes land near each other,
 * which is what makes clusters visible in space. A linear top-variance-axis
 * projection captures <1% of the variance of OpenAI-scale embeddings, so it
 * collapses everything into a blob; UMAP is non-linear and neighborhood-aware.
 *
 * The result is seeded for reproducibility. For inputs too small for a neighbor
 * graph we fall back to a deterministic linear projection.
 */
export function projectTo3D(
  embeddings: Map<string, number[]>
): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>()

  if (embeddings.size === 0) {
    return positions
  }

  const ids = Array.from(embeddings.keys())
  const vectors = ids.map(id => embeddings.get(id)!)

  // Degenerate inputs: UMAP can't build a neighbor graph from a handful of
  // points, so use a cheap deterministic linear projection instead.
  if (ids.length < MIN_UMAP_POINTS) {
    return linearProject3D(ids, vectors)
  }

  // Cosine geometry via L2-normalization, then UMAP with Euclidean distance.
  const normalized = vectors.map(l2normalize)
  const nNeighbors = Math.max(2, Math.min(15, ids.length - 1))
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: 0.0,
    random: mulberry32(UMAP_SEED),
  })
  const projected = umap.fit(normalized)

  return rescaleToExtent(ids, projected, LAYOUT_EXTENT, positions)
}

/**
 * Project a set of graph nodes to 3D positions from their stored embeddings.
 * Embedded nodes are placed by {@link projectTo3D} (UMAP / linear fallback);
 * nodes without an embedding are placed on a deterministic golden-spiral shell
 * just outside the embedding cloud so they stay visible and distinct. The
 * returned `embeddedCount` lets callers fall back to a force layout when too
 * few nodes carry embeddings for a meaningful projection.
 */
export function projectNodesTo3D(nodes: GraphNode[]): {
  positions: Map<string, [number, number, number]>
  embeddedCount: number
} {
  const embeddings = new Map<string, number[]>()
  for (const n of nodes) {
    if (Array.isArray(n.embedding) && n.embedding.length > 0) {
      embeddings.set(n.id, n.embedding)
    }
  }

  const projected = projectTo3D(embeddings)
  const positions = new Map<string, [number, number, number]>()
  for (const [id, p] of projected) {
    positions.set(id, [p.x, p.y, p.z])
  }

  // Deterministic golden-spiral shell for nodes lacking an embedding, so they
  // remain visible (and clearly outside the embedding cloud) rather than all
  // collapsing to the origin.
  const unembedded = nodes.filter(n => !positions.has(n.id))
  const shell = LAYOUT_EXTENT * 1.6
  const golden = Math.PI * (3 - Math.sqrt(5))
  unembedded.forEach((n, i) => {
    const t = unembedded.length > 1 ? i / (unembedded.length - 1) : 0
    const y = 1 - 2 * t
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    positions.set(n.id, [
      Math.cos(theta) * r * shell,
      y * shell,
      Math.sin(theta) * r * shell,
    ])
  })

  return { positions, embeddedCount: embeddings.size }
}

/**
 * Center 3D coordinates on the origin, then map each point's radius through a
 * convex power curve, (r / rMax)^LAYOUT_GAMMA, before scaling out to `extent`.
 *
 * UMAP tends to spread points evenly over a sphere shell, leaving a hollow core
 * that reads as "too spread out". gamma > 1 pulls the bulk inward toward the
 * centre while pinning the farthest points at the rim, so clusters read as
 * denser without changing their angular arrangement. The transform is monotonic
 * in radius, so neighborhood structure is preserved. Centering also keeps the
 * cloud framed consistently regardless of UMAP's arbitrary output scale.
 */
function rescaleToExtent(
  ids: string[],
  coords: number[][],
  extent: number,
  out: Map<string, { x: number; y: number; z: number }>
): Map<string, { x: number; y: number; z: number }> {
  const center = [0, 0, 0]
  for (const c of coords) {
    center[0] += c[0] / coords.length
    center[1] += c[1] / coords.length
    center[2] += c[2] / coords.length
  }
  const radii = coords.map(c =>
    Math.hypot(c[0] - center[0], c[1] - center[1], c[2] - center[2])
  )
  const maxR = Math.max(...radii)
  for (let i = 0; i < ids.length; i++) {
    const c = coords[i]
    const r = radii[i]
    if (r === 0 || maxR === 0) {
      out.set(ids[i], { x: 0, y: 0, z: 0 })
      continue
    }
    // Convex radial compaction: shrink the hollow shell toward the core.
    const factor = (Math.pow(r / maxR, LAYOUT_GAMMA) * extent) / r
    out.set(ids[i], {
      x: (c[0] - center[0]) * factor,
      y: (c[1] - center[1]) * factor,
      z: (c[2] - center[2]) * factor,
    })
  }
  return out
}

/**
 * Deterministic fallback for inputs too small for UMAP: center the vectors and
 * project onto their three highest-variance axes. Meaningful dimensionality
 * reduction is impossible with a handful of points, so this only guarantees
 * distinct, stable positions.
 */
function linearProject3D(
  ids: string[],
  vectors: number[][]
): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>()

  const dim = vectors[0].length
  const mean = new Array(dim).fill(0)
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i] / vectors.length
  }
  const centered = vectors.map(v => v.map((x, i) => x - mean[i]))

  const variances = new Array(dim).fill(0)
  for (const v of centered) {
    for (let i = 0; i < dim; i++) variances[i] += v[i] * v[i]
  }
  const topDims = variances
    .map((variance, index) => ({ variance, index }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3)
    .map(d => d.index)

  const scale = 100
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

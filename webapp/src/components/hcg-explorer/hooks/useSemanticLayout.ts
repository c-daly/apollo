/**
 * Hook for semantic layout using Hermes embeddings
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { GraphNode, ClusterAssignment } from '../types'
import {
  generateNodeEmbeddings,
  projectTo3D,
  clusterByEmbedding,
} from '../clustering/embedding-service'

export interface SemanticLayoutState {
  isLoading: boolean
  progress: number
  error: string | null
  positions: Map<string, { x: number; y: number; z: number }>
  clusters: ClusterAssignment[]
  hasEmbeddings: boolean
}

export interface UseSemanticLayoutResult extends SemanticLayoutState {
  generateLayout: (nodes: GraphNode[]) => Promise<void>
  clearLayout: () => void
}

const CLUSTER_COLORS = [
  '#4ade80', // green
  '#60a5fa', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#a78bfa', // purple
  '#38bdf8', // cyan
  '#f472b6', // pink
  '#84cc16', // lime
]

/**
 * Hook to generate semantic layout from node embeddings
 */
export function useSemanticLayout(): UseSemanticLayoutResult {
  const [state, setState] = useState<SemanticLayoutState>({
    isLoading: false,
    progress: 0,
    error: null,
    positions: new Map(),
    clusters: [],
    hasEmbeddings: false,
  })

  // Cache embeddings to avoid re-fetching
  const embeddingCacheRef = useRef<Map<string, number[]>>(new Map())
  const abortRef = useRef<boolean>(false)

  const generateLayout = useCallback(async (nodes: GraphNode[]) => {
    if (nodes.length === 0) return

    abortRef.current = false
    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: 0,
      error: null,
    }))

    try {
      // Check which nodes need embeddings
      const nodesToEmbed = nodes.filter(
        n => !embeddingCacheRef.current.has(n.id) && !n.embedding
      )

      // Use existing embeddings from nodes or cache
      const embeddings = new Map<string, number[]>()
      for (const node of nodes) {
        if (node.embedding) {
          embeddings.set(node.id, node.embedding)
          embeddingCacheRef.current.set(node.id, node.embedding)
        } else if (embeddingCacheRef.current.has(node.id)) {
          embeddings.set(node.id, embeddingCacheRef.current.get(node.id)!)
        }
      }

      // Generate missing embeddings
      if (nodesToEmbed.length > 0) {
        const result = await generateNodeEmbeddings(nodesToEmbed, {
          batchSize: 5,
          onProgress: (completed, total) => {
            if (abortRef.current) return
            setState(prev => ({
              ...prev,
              progress: (completed / total) * 100,
            }))
          },
        })

        if (abortRef.current) return

        // Merge new embeddings
        for (const [id, embedding] of result.embeddings) {
          embeddings.set(id, embedding)
          embeddingCacheRef.current.set(id, embedding)
        }

        if (result.errors.length > 0) {
          console.warn('Some embeddings failed:', result.errors)
        }
      }

      if (abortRef.current) return

      // Project to 3D positions
      const positions = projectTo3D(embeddings)

      // Generate clusters
      const clusterAssignments = clusterByEmbedding(
        embeddings,
        Math.min(6, Math.ceil(nodes.length / 3))
      )

      // Build cluster objects
      const clusterMap = new Map<number, string[]>()
      for (const [nodeId, clusterId] of clusterAssignments) {
        if (!clusterMap.has(clusterId)) {
          clusterMap.set(clusterId, [])
        }
        clusterMap.get(clusterId)!.push(nodeId)
      }

      const clusters: ClusterAssignment[] = []
      for (const [clusterId, memberIds] of clusterMap) {
        // Find dominant type in cluster for labeling
        const typeCounts = new Map<string, number>()
        for (const id of memberIds) {
          const node = nodes.find(n => n.id === id)
          if (node) {
            typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1)
          }
        }
        let dominantType = 'mixed'
        let maxCount = 0
        for (const [type, count] of typeCounts) {
          if (count > maxCount) {
            maxCount = count
            dominantType = type
          }
        }

        // Calculate centroid
        let cx = 0, cy = 0, cz = 0
        for (const id of memberIds) {
          const pos = positions.get(id)
          if (pos) {
            cx += pos.x
            cy += pos.y
            cz += pos.z
          }
        }
        const n = memberIds.length
        const centroid = n > 0 ? { x: cx / n, y: cy / n, z: cz / n } : undefined

        clusters.push({
          id: `cluster-${clusterId}`,
          label: `${dominantType} cluster`,
          memberIds,
          centroid,
          color: CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length],
        })
      }

      setState({
        isLoading: false,
        progress: 100,
        error: null,
        positions,
        clusters,
        hasEmbeddings: embeddings.size > 0,
      })
    } catch (err) {
      if (abortRef.current) return
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to generate layout',
      }))
    }
  }, [])

  const clearLayout = useCallback(() => {
    abortRef.current = true
    setState({
      isLoading: false,
      progress: 0,
      error: null,
      positions: new Map(),
      clusters: [],
      hasEmbeddings: false,
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true
    }
  }, [])

  return {
    ...state,
    generateLayout,
    clearLayout,
  }
}

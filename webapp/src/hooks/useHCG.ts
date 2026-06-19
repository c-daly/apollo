/**
 * React hooks for HCG and Persona data fetching with TanStack Query.
 *
 * These hooks call Sophia's API endpoints via sophia-client.
 */

import { useEffect, useState } from 'react'
import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { sophiaClient } from '../lib/sophia-client'
import type {
  PersonaEntryFull,
  PersonaListFilters,
  SentimentResponse,
  HCGEntity,
  HCGEdge,
  HCGGraphSnapshot,
  HCGStats,
  HCGTypeSummary,
  HCGNeighborhood,
  HCGSearchResult,
} from '../lib/sophia-client'
import type { Process, PlanHistory } from '../types/hcg'

// Re-export types for consumers
export type {
  PersonaEntryFull,
  HCGEntity,
  HCGEdge,
  HCGGraphSnapshot,
  HCGStats,
  HCGTypeSummary,
  HCGNeighborhood,
  HCGSearchResult,
}

/**
 * Helper to unwrap sophia-client response and throw on error.
 */
function unwrapResponse<T>(response: { success: boolean; data?: T; error?: string }): T {
  if (!response.success) {
    throw new Error(response.error || 'Unknown API error')
  }
  if (response.data === undefined) {
    throw new Error('Response data is undefined')
  }
  return response.data
}

// ---------------------------------------------------------------------------
// HCG Hooks (migrated from hcg-client to sophia-client)
// ---------------------------------------------------------------------------

/**
 * Hook to fetch HCG entities with optional type filter.
 */
export function useHCGEntities(
  entityType?: string,
  limit: number = 100,
  offset: number = 0
): UseQueryResult<HCGEntity[], Error> {
  return useQuery({
    queryKey: ['hcg', 'entities', entityType, limit, offset],
    queryFn: async () => {
      const response = await sophiaClient.getHCGEntities(entityType, limit, offset)
      return unwrapResponse(response)
    },
    staleTime: 5000,
  })
}

/**
 * Hook to fetch a specific HCG entity by ID.
 */
export function useHCGEntity(entityId: string): UseQueryResult<HCGEntity | null, Error> {
  return useQuery({
    queryKey: ['hcg', 'entity', entityId],
    queryFn: async () => {
      const response = await sophiaClient.getHCGEntity(entityId)
      return unwrapResponse(response)
    },
    staleTime: 5000,
    enabled: !!entityId,
  })
}

/**
 * Hook to fetch HCG edges with optional filters.
 */
export function useHCGEdges(
  entityId?: string,
  edgeType?: string,
  limit: number = 100
): UseQueryResult<HCGEdge[], Error> {
  return useQuery({
    queryKey: ['hcg', 'edges', entityId, edgeType, limit],
    queryFn: async () => {
      const response = await sophiaClient.getHCGEdges(entityId, edgeType, limit)
      return unwrapResponse(response)
    },
    staleTime: 5000,
  })
}

/**
 * Hook to fetch complete HCG graph snapshot.
 */
export interface GraphSnapshotOptions {
  entityTypes?: string[]
  limit?: number
  refetchInterval?: number | false
  /**
   * Request stored embedding vectors so the explorer can lay nodes out by
   * embedding. Defaults to true to preserve explorer behavior; callers that
   * don't need vectors (e.g. 2D-only views) can disable it to avoid fetching
   * ~3MB of float data on every refetch.
   */
  includeEmbeddings?: boolean
  /**
   * Gate the (potentially large) snapshot fetch. Defaults to true to preserve
   * existing callers; the lazy-load explorer sets this false so the full-graph
   * query only fires once the user opts into "Load full graph".
   */
  enabled?: boolean
}

export function useHCGSnapshot(
  options: GraphSnapshotOptions = {}
): UseQueryResult<HCGGraphSnapshot, Error> {
  const {
    entityTypes,
    limit = 200,
    refetchInterval,
    includeEmbeddings = true,
    enabled = true,
  } = options
  return useQuery({
    // includeEmbeddings is part of the key so toggling it never serves a
    // cached response with the wrong payload shape.
    queryKey: ['hcg', 'snapshot', entityTypes, limit, includeEmbeddings],
    queryFn: async () => {
      const response = await sophiaClient.getHCGSnapshot(
        entityTypes,
        limit,
        includeEmbeddings
      )
      return unwrapResponse(response)
    },
    staleTime: 5000,
    refetchInterval,
    enabled,
  })
}

// ---------------------------------------------------------------------------
// HCG scoped / lazy-load hooks (seed + expand)
//
// These back the lazy-load explorer: stats for the header, the type layer for
// entry chips, search for seeding, and neighborhood for on-demand expansion.
// ---------------------------------------------------------------------------

/**
 * Hook to fetch headline HCG statistics (counts + typing coverage).
 */
export function useHCGStats(): UseQueryResult<HCGStats, Error> {
  return useQuery({
    queryKey: ['hcg', 'stats'],
    queryFn: async () => {
      const response = await sophiaClient.getHCGStats()
      return unwrapResponse(response)
    },
    staleTime: 10000,
  })
}

/**
 * Hook to fetch the positional type layer (entry chips for seeding).
 */
export function useHCGTypes(
  limit: number = 50
): UseQueryResult<HCGTypeSummary[], Error> {
  return useQuery({
    queryKey: ['hcg', 'types', limit],
    queryFn: async () => {
      const response = await sophiaClient.getHCGTypes(limit)
      return unwrapResponse(response)
    },
    staleTime: 30000,
  })
}

/**
 * Hook to fetch the de-reified neighborhood of a node, enabled only when a
 * uuid is provided (so it never fires for the empty initial canvas).
 */
export function useHCGNeighborhood(
  uuid: string | null | undefined,
  depth: number = 1,
  limit: number = 50
): UseQueryResult<HCGNeighborhood, Error> {
  return useQuery({
    queryKey: ['hcg', 'neighborhood', uuid, depth, limit],
    queryFn: async () => {
      // The enabled-guard below normally prevents this from running without a
      // uuid, but guard explicitly so a stale/forced fetch surfaces a clear
      // error instead of building a request against `/hcg/neighborhood/null`.
      if (!uuid) throw new Error('useHCGNeighborhood: uuid is required')
      const response = await sophiaClient.getHCGNeighborhood(uuid, depth, limit)
      return unwrapResponse(response)
    },
    staleTime: 30000,
    enabled: !!uuid,
  })
}

/** Debounce interval (ms) for the seed search query. */
export const HCG_SEARCH_DEBOUNCE_MS = 300

/**
 * Hook to search HCG nodes for seeding.
 *
 * The query term is debounced ({@link HCG_SEARCH_DEBOUNCE_MS}) before it reaches
 * react-query, so typing "entity" issues a single request once typing settles
 * rather than one per keystroke. The enabled-guard additionally suppresses
 * requests for an empty/blank query. `q` is tolerant of null/undefined.
 */
export function useHCGSearch(
  q: string | null | undefined,
  limit: number = 20
): UseQueryResult<HCGSearchResult[], Error> {
  const query = (q ?? '').trim()

  // Debounce: only let the query reach react-query once it has been stable for
  // HCG_SEARCH_DEBOUNCE_MS. The debounced value starts empty and is only ever
  // advanced by the timer, so even the first non-empty term waits out the
  // window -- each keystroke resets the timer, so the queryKey (and therefore
  // the request) only changes after typing pauses.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    if (query === debouncedQuery) return
    const id = setTimeout(() => setDebouncedQuery(query), HCG_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query, debouncedQuery])

  return useQuery({
    queryKey: ['hcg', 'search', debouncedQuery, limit],
    queryFn: async () => {
      const response = await sophiaClient.searchHCG(debouncedQuery, limit)
      return unwrapResponse(response)
    },
    staleTime: 5000,
    enabled: debouncedQuery.length > 0,
  })
}

/**
 * Hook to check HCG health status.
 */
export function useHCGHealth(): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: ['hcg', 'health'],
    queryFn: () => sophiaClient.hcgHealthCheck(),
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

// ---------------------------------------------------------------------------
// Persona Hooks (migrated from hcg-client to sophia-client)
// ---------------------------------------------------------------------------

/**
 * Hook to fetch persona diary entries with optional filters.
 */
export function usePersonaEntries(
  filters: PersonaListFilters = {}
): UseQueryResult<PersonaEntryFull[], Error> {
  return useQuery({
    queryKey: ['persona', 'entries', filters],
    queryFn: async () => {
      const response = await sophiaClient.getPersonaEntries(filters)
      const data = unwrapResponse(response)
      return data.entries
    },
    staleTime: 5000,
  })
}

/**
 * Hook to fetch a specific persona entry by ID.
 */
export function usePersonaEntry(
  entryId: string
): UseQueryResult<PersonaEntryFull | null, Error> {
  return useQuery({
    queryKey: ['persona', 'entry', entryId],
    queryFn: async () => {
      const response = await sophiaClient.getPersonaEntry(entryId)
      return unwrapResponse(response)
    },
    staleTime: 5000,
    enabled: !!entryId,
  })
}

/**
 * Hook to fetch aggregated sentiment data.
 */
export function usePersonaSentiment(
  filters: { limit?: number; after_timestamp?: string } = {}
): UseQueryResult<SentimentResponse, Error> {
  return useQuery({
    queryKey: ['persona', 'sentiment', filters],
    queryFn: async () => {
      const response = await sophiaClient.getPersonaSentiment(filters)
      return unwrapResponse(response)
    },
    staleTime: 5000,
  })
}

/**
 * Hook to fetch processes from HCG
 */
export function useProcesses(
  status?: string,
  limit: number = 100,
  offset: number = 0
): UseQueryResult<Process[], Error> {
  return useQuery({
    queryKey: ['hcg', 'processes', status, limit, offset],
    queryFn: async () => {
      const response = await sophiaClient.getProcesses(status, limit, offset)
      return unwrapResponse(response)
    },
    staleTime: 5000,
  })
}

/**
 * Hook to fetch plan history from HCG
 */
export function usePlanHistory(
  goalId?: string,
  limit: number = 10
): UseQueryResult<PlanHistory[], Error> {
  return useQuery({
    queryKey: ['hcg', 'plans', goalId, limit],
    queryFn: async () => {
      const response = await sophiaClient.getPlanHistory(goalId, limit)
      return unwrapResponse(response)
    },
    staleTime: 5000,
  })
}

// ---------------------------------------------------------------------------
// Legacy hook names (deprecated - use new names above)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use useHCGEntities instead
 */
export const useEntities = useHCGEntities

/**
 * @deprecated Use useHCGEntity instead
 */
export const useEntity = useHCGEntity

/**
 * @deprecated Use useHCGEdges instead
 */
export const useCausalEdges = useHCGEdges

/**
 * @deprecated Use useHCGSnapshot instead
 */
export const useGraphSnapshot = useHCGSnapshot

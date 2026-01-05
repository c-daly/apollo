/**
 * React hooks for HCG and Persona data fetching with TanStack Query.
 *
 * These hooks call Sophia's API endpoints via sophia-client.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { sophiaClient } from '../lib/sophia-client'
import type {
  PersonaEntryFull,
  PersonaListFilters,
  SentimentResponse,
  HCGEntity,
  HCGEdge,
  HCGGraphSnapshot,
} from '../lib/sophia-client'
import type { Process, PlanHistory } from '../types/hcg'

// Re-export types for consumers
export type { PersonaEntryFull, HCGEntity, HCGEdge, HCGGraphSnapshot }

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
}

export function useHCGSnapshot(
  options: GraphSnapshotOptions = {}
): UseQueryResult<HCGGraphSnapshot, Error> {
  const { entityTypes, limit = 200, refetchInterval } = options
  return useQuery({
    queryKey: ['hcg', 'snapshot', entityTypes, limit],
    queryFn: async () => {
      const response = await sophiaClient.getHCGSnapshot(entityTypes, limit)
      return unwrapResponse(response)
    },
    staleTime: 5000,
    refetchInterval,
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

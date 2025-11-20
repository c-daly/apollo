/**
 * React hooks for HCG data fetching with TanStack Query
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query'
import { hcgClient } from '../lib/hcg-client'
import type {
  Entity,
  State,
  Process,
  CausalEdge,
  PlanHistory,
  StateHistory,
  GraphSnapshot,
} from '../types/hcg'

/**
 * Hook to fetch entities from HCG
 */
export function useEntities(
  entityType?: string,
  limit: number = 100,
  offset: number = 0
): UseQueryResult<Entity[], Error> {
  return useQuery({
    queryKey: ['hcg', 'entities', entityType, limit, offset],
    queryFn: () => hcgClient.getEntities(entityType, limit, offset),
    staleTime: 5000,
  })
}

/**
 * Hook to fetch a specific entity by ID
 */
export function useEntity(
  entityId: string
): UseQueryResult<Entity | null, Error> {
  return useQuery({
    queryKey: ['hcg', 'entity', entityId],
    queryFn: () => hcgClient.getEntityById(entityId),
    staleTime: 5000,
    enabled: !!entityId,
  })
}

/**
 * Hook to fetch states from HCG
 */
export function useStates(
  limit: number = 100,
  offset: number = 0
): UseQueryResult<State[], Error> {
  return useQuery({
    queryKey: ['hcg', 'states', limit, offset],
    queryFn: () => hcgClient.getStates(limit, offset),
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
    queryFn: () => hcgClient.getProcesses(status, limit, offset),
    staleTime: 5000,
  })
}

/**
 * Hook to fetch causal edges from HCG
 */
export function useCausalEdges(
  entityId?: string,
  edgeType?: string,
  limit: number = 100
): UseQueryResult<CausalEdge[], Error> {
  return useQuery({
    queryKey: ['hcg', 'edges', entityId, edgeType, limit],
    queryFn: () => hcgClient.getCausalEdges(entityId, edgeType, limit),
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
    queryFn: () => hcgClient.getPlanHistory(goalId, limit),
    staleTime: 5000,
  })
}

/**
 * Hook to fetch state history from HCG
 */
export function useStateHistory(
  stateId?: string,
  limit: number = 50
): UseQueryResult<StateHistory[], Error> {
  return useQuery({
    queryKey: ['hcg', 'history', stateId, limit],
    queryFn: () => hcgClient.getStateHistory(stateId, limit),
    staleTime: 5000,
  })
}

/**
 * Hook to fetch complete graph snapshot from HCG
 */
export function useGraphSnapshot(
  entityTypes?: string[],
  limit: number = 200
): UseQueryResult<GraphSnapshot, Error> {
  return useQuery({
    queryKey: ['hcg', 'snapshot', entityTypes, limit],
    queryFn: () => hcgClient.getGraphSnapshot(entityTypes, limit),
    staleTime: 5000,
  })
}

/**
 * Hook to check HCG health status
 */
export function useHCGHealth(): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: ['hcg', 'health'],
    queryFn: () => hcgClient.healthCheck(),
    staleTime: 10000,
    refetchInterval: 30000,
  })
}

/**
 * Hook to fetch persona diary entries
 */
export function usePersonaEntries(
  filters: {
    entry_type?: string
    sentiment?: string
    related_process_id?: string
    related_goal_id?: string
    limit?: number
    offset?: number
  } = {}
): UseQueryResult<import('../types/hcg').PersonaEntry[], Error> {
  return useQuery({
    queryKey: ['persona', 'entries', filters],
    queryFn: () => hcgClient.getPersonaEntries(filters),
    staleTime: 5000,
  })
}

/**
 * Hook to fetch a specific persona entry by ID
 */
export function usePersonaEntry(
  entryId: string
): UseQueryResult<import('../types/hcg').PersonaEntry | null, Error> {
  return useQuery({
    queryKey: ['persona', 'entry', entryId],
    queryFn: () => hcgClient.getPersonaEntry(entryId),
    staleTime: 5000,
    enabled: !!entryId,
  })
}

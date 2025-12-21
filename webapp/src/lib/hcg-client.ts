/**
 * API client for HCG data layer
 * Provides functions to fetch HCG data via REST API
 */

import { getHCGConfig } from './config'
import type {
  Entity,
  State,
  Process,
  CausalEdge,
  PlanHistory,
  StateHistory,
  GraphSnapshot,
} from '../types/hcg'

export interface HCGClientConfig {
  baseUrl?: string
  timeout?: number
}

export class HCGAPIClient {
  private baseUrl: string
  private timeout: number

  constructor(config: HCGClientConfig = {}) {
    const hcgConfig = getHCGConfig()
    this.baseUrl = config.baseUrl || hcgConfig.apiUrl || 'http://localhost:27000'
    this.timeout = config.timeout || hcgConfig.timeout || 30000
  }

  private async fetchWithTimeout(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeout)
      return response
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
  }

  async getEntities(
    entityType?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Entity[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    if (entityType) {
      params.append('type', entityType)
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/entities?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch entities: ${response.statusText}`)
    }

    return response.json()
  }

  async getEntityById(entityId: string): Promise<Entity | null> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/entities/${entityId}`
    )

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch entity: ${response.statusText}`)
    }

    return response.json()
  }

  async getStates(limit: number = 100, offset: number = 0): Promise<State[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/states?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch states: ${response.statusText}`)
    }

    return response.json()
  }

  async getProcesses(
    status?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Process[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    if (status) {
      params.append('status', status)
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/processes?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch processes: ${response.statusText}`)
    }

    return response.json()
  }

  async getCausalEdges(
    entityId?: string,
    edgeType?: string,
    limit: number = 100
  ): Promise<CausalEdge[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    })
    if (entityId) {
      params.append('entity_id', entityId)
    }
    if (edgeType) {
      params.append('edge_type', edgeType)
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/edges?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch causal edges: ${response.statusText}`)
    }

    return response.json()
  }

  async getPlanHistory(
    goalId?: string,
    limit: number = 10
  ): Promise<PlanHistory[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    })
    if (goalId) {
      params.append('goal_id', goalId)
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/plans?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch plan history: ${response.statusText}`)
    }

    return response.json()
  }

  async getStateHistory(
    stateId?: string,
    limit: number = 50
  ): Promise<StateHistory[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    })
    if (stateId) {
      params.append('state_id', stateId)
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/history?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch state history: ${response.statusText}`)
    }

    return response.json()
  }

  async getGraphSnapshot(
    entityTypes?: string[],
    limit: number = 200
  ): Promise<GraphSnapshot> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    })
    if (entityTypes && entityTypes.length > 0) {
      params.append('entity_types', entityTypes.join(','))
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/hcg/snapshot?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch graph snapshot: ${response.statusText}`)
    }

    return response.json()
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/hcg/health`
      )
      return response.ok
    } catch {
      return false
    }
  }

  // Persona Entry API methods
  async createPersonaEntry(
    request: import('../types/hcg').CreatePersonaEntryRequest
  ): Promise<import('../types/hcg').PersonaEntry> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/persona/entries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to create persona entry: ${response.statusText}`)
    }

    return response.json()
  }

  async getPersonaEntries(
    filters: {
      entry_type?: string
      sentiment?: string
      related_process_id?: string
      related_goal_id?: string
      limit?: number
      offset?: number
    } = {}
  ): Promise<import('../types/hcg').PersonaEntry[]> {
    const params = new URLSearchParams()

    if (filters.entry_type) params.append('entry_type', filters.entry_type)
    if (filters.sentiment) params.append('sentiment', filters.sentiment)
    if (filters.related_process_id)
      params.append('related_process_id', filters.related_process_id)
    if (filters.related_goal_id)
      params.append('related_goal_id', filters.related_goal_id)
    params.append('limit', (filters.limit || 100).toString())
    params.append('offset', (filters.offset || 0).toString())

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/persona/entries?${params}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch persona entries: ${response.statusText}`)
    }

    return response.json()
  }

  async getPersonaEntry(
    entryId: string
  ): Promise<import('../types/hcg').PersonaEntry | null> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/persona/entries/${entryId}`
    )

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch persona entry: ${response.statusText}`)
    }

    return response.json()
  }
}

// Default client instance
export const hcgClient = new HCGAPIClient()

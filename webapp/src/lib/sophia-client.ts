/**
 * Sophia client that wraps the generated @logos/sophia-sdk library.
 *
 * The class keeps the legacy API surface that the webapp already uses
 * (e.g., createGoal, getState, sendCommand) but executes the calls via
 * the shared SDK. When the SDK endpoints are not available (older mock
 * services still expose /api/* routes), the client automatically falls
 * back to those legacy endpoints so local mocks and tests continue to work.
 */

import {
  Configuration,
  PlanningApi,
  PlanRequest,
  PlanResponse,
  ResponseError,
  SimulationRequest,
  SimulationResponse,
  StateResponse as SophiaStateResponse,
  SystemApi,
  WorldModelApi,
  GetStateModelTypeEnum,
} from '@logos/sophia-sdk'
import type { HealthResponse } from '@logos/sophia-sdk'

export interface SophiaClientConfig {
  baseUrl?: string
  apiKey?: string
  timeout?: number
}

export interface SophiaResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

interface SophiaClientDependencies {
  planningApi: PlanningApi
  systemApi: SystemApi
  worldModelApi: WorldModelApi
}

const DEFAULT_TIMEOUT_MS = 30_000
type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

export class SophiaClient {
  private readonly planningApi: PlanningApi
  private readonly systemApi: SystemApi
  private readonly worldModelApi: WorldModelApi
  private readonly timeout: number
  private readonly baseUrl: string
  private readonly apiKey?: string

  constructor(
    config: SophiaClientConfig = {},
    deps?: Partial<SophiaClientDependencies>
  ) {
    this.baseUrl = config.baseUrl || 'http://localhost:8080'
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS

    const configuration = new Configuration({
      basePath: this.baseUrl,
      accessToken: this.apiKey ? async () => this.apiKey as string : undefined,
      fetchApi: (input, init) => this.fetchWithTimeout(input, init),
    })

    this.planningApi = deps?.planningApi ?? new PlanningApi(configuration)
    this.systemApi = deps?.systemApi ?? new SystemApi(configuration)
    this.worldModelApi = deps?.worldModelApi ?? new WorldModelApi(configuration)
  }

  async sendCommand(command: string): Promise<SophiaResponse<PlanResponse>> {
    if (!command.trim()) {
      return {
        success: false,
        error: 'Command cannot be empty',
      }
    }

    const payload: PlanRequest = {
      goal: command,
      metadata: { source: 'apollo-webapp' },
    }

    try {
      const response = await this.planningApi.createPlan({
        planRequest: payload,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacySendCommand(command)
      }
      return this.failure('sending command', error)
    }
  }

  async getState(
    limit = 10,
    cursor?: string,
    modelType?: GetStateModelTypeEnum
  ): Promise<SophiaResponse<SophiaStateResponse>> {
    try {
      const response = await this.worldModelApi.getState({
        cursor,
        limit,
        modelType,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacyGetState(limit)
      }
      return this.failure('retrieving state', error)
    }
  }

  async getPlans(limit = 10): Promise<SophiaResponse<SophiaStateResponse>> {
    try {
      const response = await this.worldModelApi.getState({
        limit,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacyGetPlans(limit)
      }
      return this.failure('retrieving plans', error)
    }
  }

  async createGoal(request: {
    goal: string
    priority?: string
    metadata?: Record<string, unknown>
  }): Promise<SophiaResponse<PlanResponse>> {
    if (!request.goal.trim()) {
      return {
        success: false,
        error: 'Goal description cannot be empty',
      }
    }

    const payload: PlanRequest = {
      goal: request.goal,
      priority: request.priority,
      metadata: request.metadata,
    }

    try {
      const response = await this.planningApi.createPlan({
        planRequest: payload,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacyCreateGoal(payload)
      }
      return this.failure('creating goal', error)
    }
  }

  async invokePlanner(goalId: string): Promise<SophiaResponse<PlanResponse>> {
    if (!goalId.trim()) {
      return {
        success: false,
        error: 'Goal identifier cannot be empty',
      }
    }

    const payload: PlanRequest = { goal: goalId }

    try {
      const response = await this.planningApi.createPlan({
        planRequest: payload,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacyInvokePlanner(goalId)
      }
      return this.failure('invoking planner', error)
    }
  }

  async simulatePlan(
    planId: string,
    context?: Record<string, unknown>,
    horizonSteps?: number
  ): Promise<SophiaResponse<SimulationResponse>> {
    if (!planId.trim()) {
      return {
        success: false,
        error: 'Plan identifier is required for simulation',
      }
    }

    const request: SimulationRequest = {
      capabilityId: planId,
      context: context ?? {},
      horizonSteps: horizonSteps,
    }

    try {
      const response = await this.planningApi.runSimulation({
        simulationRequest: request,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacySimulatePlan(planId, context)
      }
      return this.failure('running simulation', error)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.systemApi.healthCheck()
      return true
    } catch (error) {
      if (this.isNotFound(error)) {
        const legacyHealth = await this.performLegacyRequest<HealthResponse>({
          action: 'checking health',
          method: 'GET',
          path: '/health',
        })
        return legacyHealth.success
      }
      return false
    }
  }

  async getHealth(): Promise<SophiaResponse<HealthResponse>> {
    try {
      const response = await this.systemApi.healthCheck()
      return this.success(response)
    } catch (error) {
      return this.failure('retrieving health status', error)
    }
  }

  async executeStep(): Promise<SophiaResponse<never>> {
    return {
      success: false,
      error:
        'Plan execution is handled by Talos; use the executor service to run individual steps.',
    }
  }

  /**
   * Get CWM states from Sophia's /cwm endpoint.
   *
   * Queries persisted CWM (Cognitive World Model) states from Neo4j.
   */
  async getCWMStates(
    options?: GetCWMStatesOptions
  ): Promise<SophiaResponse<CWMStateListResponse>> {
    const params: Record<string, string> = {}
    if (options?.types) params.types = options.types
    if (options?.afterTimestamp) params.after_timestamp = options.afterTimestamp
    if (options?.limit !== undefined) params.limit = String(options.limit)

    try {
      const url = new URL('/cwm', this.baseUrl)
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })

      const response = await this.fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          success: false,
          error: text || `Sophia API error: ${response.statusText}`,
        }
      }

      const data = (await response.json()) as CWMStateListResponse
      return this.success(data)
    } catch (error) {
      return this.failure('retrieving CWM states', error)
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------
  private success<T>(data: T): SophiaResponse<T> {
    return {
      success: true,
      data,
    }
  }

  private async failure(
    action: string,
    error: unknown
  ): Promise<SophiaResponse<never>> {
    if (this.isAbortError(error)) {
      return {
        success: false,
        error: `Request timed out after ${this.timeout}ms while ${action}`,
      }
    }

    if (error instanceof ResponseError) {
      let details: string | undefined
      try {
        details = await error.response.text()
      } catch {
        details = error.message
      }

      return {
        success: false,
        error: `Sophia API error while ${action}: ${details}`,
      }
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: `Unexpected error while ${action}: ${error.message}`,
      }
    }

    return {
      success: false,
      error: `Unknown error while ${action}`,
    }
  }

  private isAbortError(error: unknown): error is DOMException {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private isNotFound(error: unknown): boolean {
    return error instanceof ResponseError && error.response.status === 404
  }

  private async fetchWithTimeout(
    input: FetchInput,
    init: FetchInit = {}
  ): Promise<Response> {
    const requestInput = input instanceof URL ? input.toString() : input

    if (this.timeout <= 0 || init.signal) {
      return fetch(requestInput, init)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(requestInput, {
        ...init,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) {
      return {}
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  // ---------------------------------------------------------------------------
  // Legacy fallbacks
  // ---------------------------------------------------------------------------
  private legacySendCommand(
    command: string
  ): Promise<SophiaResponse<PlanResponse>> {
    return this.performLegacyRequest<PlanResponse>({
      action: 'sending command',
      method: 'POST',
      path: '/api/command',
      body: { command },
    })
  }

  private async legacyGetState(
    limit: number
  ): Promise<SophiaResponse<SophiaStateResponse>> {
    const response = await this.performLegacyRequest<unknown>({
      action: 'retrieving state',
      method: 'GET',
      path: '/api/state',
      params: { limit: String(limit) },
    })
    return this.normalizeLegacyStateResponse(response)
  }

  private async legacyGetPlans(
    limit: number
  ): Promise<SophiaResponse<SophiaStateResponse>> {
    const response = await this.performLegacyRequest<unknown>({
      action: 'retrieving plans',
      method: 'GET',
      path: '/api/plans',
      params: { limit: String(limit) },
    })
    return this.normalizeLegacyStateResponse(response)
  }

  private legacyCreateGoal(
    payload: PlanRequest
  ): Promise<SophiaResponse<PlanResponse>> {
    return this.performLegacyRequest({
      action: 'creating goal',
      method: 'POST',
      path: '/api/goals',
      body: payload,
    })
  }

  private legacyInvokePlanner(
    goalId: string
  ): Promise<SophiaResponse<PlanResponse>> {
    return this.performLegacyRequest({
      action: 'invoking planner',
      method: 'POST',
      path: '/api/planner/invoke',
      body: { goal_id: goalId },
    })
  }

  private legacySimulatePlan(
    planId: string,
    context?: Record<string, unknown>
  ): Promise<SophiaResponse<SimulationResponse>> {
    return this.performLegacyRequest({
      action: 'running simulation',
      method: 'POST',
      path: '/api/simulate',
      body: {
        plan_id: planId,
        initial_state: context,
      },
    })
  }

  private async performLegacyRequest<T>({
    action,
    method,
    path,
    body,
    params,
  }: {
    action: string
    method: 'GET' | 'POST'
    path: string
    body?: unknown
    params?: Record<string, string>
  }): Promise<SophiaResponse<T>> {
    try {
      const url = new URL(path, this.baseUrl)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, value)
        })
      }

      const response = await this.fetchWithTimeout(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          success: false,
          error:
            text ||
            `Sophia legacy request failed while ${action}: ${response.statusText}`,
        }
      }

      if (response.status === 204) {
        return { success: true }
      }

      const data = (await response.json()) as T
      return {
        success: true,
        data,
      }
    } catch (error) {
      if (this.isAbortError(error)) {
        return {
          success: false,
          error: `Request timed out after ${this.timeout}ms while ${action}`,
        }
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: `Legacy request failed while ${action}: ${error.message}`,
        }
      }

      return {
        success: false,
        error: `Legacy request failed while ${action}`,
      }
    }
  }

  private normalizeLegacyStateResponse(
    response: SophiaResponse<unknown>
  ): SophiaResponse<SophiaStateResponse> {
    if (!response.success) {
      return response as SophiaResponse<SophiaStateResponse>
    }

    const payload = response.data
    if (this.payloadHasStates(payload)) {
      return response as SophiaResponse<SophiaStateResponse>
    }

    if (this.isRecord(payload)) {
      const merged = {
        states: [],
        cursor: undefined,
        nextPollAfterMs: undefined,
        ...payload,
      } as SophiaStateResponse & Record<string, unknown>

      return {
        success: true,
        data: merged,
      }
    }

    return {
      success: true,
      data: {
        states: [],
        cursor: undefined,
        nextPollAfterMs: undefined,
        legacyPayload: payload,
      } as SophiaStateResponse & { legacyPayload: unknown },
    }
  }

  private payloadHasStates(payload: unknown): payload is {
    states: SophiaStateResponse['states']
  } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'states' in (payload as Record<string, unknown>)
    )
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  // ---------------------------------------------------------------------------
  // Generic request helper (for new endpoints)
  // ---------------------------------------------------------------------------
  private async performRequest<T>({
    action,
    method,
    path,
    body,
    params,
  }: {
    action: string
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    path: string
    body?: unknown
    params?: Record<string, string>
  }): Promise<SophiaResponse<T>> {
    try {
      const url = new URL(path, this.baseUrl)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.set(key, value)
        })
      }

      const response = await this.fetchWithTimeout(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          success: false,
          error: text || `Sophia API error while ${action}: ${response.statusText}`,
        }
      }

      if (response.status === 204) {
        return { success: true } as SophiaResponse<T>
      }

      const data = (await response.json()) as T
      return {
        success: true,
        data,
      }
    } catch (error) {
      if (this.isAbortError(error)) {
        return {
          success: false,
          error: `Request timed out after ${this.timeout}ms while ${action}`,
        }
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: `Request failed while ${action}: ${error.message}`,
        }
      }

      return {
        success: false,
        error: `Request failed while ${action}`,
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Persona Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new persona diary entry.
   */
  async createPersonaEntry(
    entry: PersonaEntryCreate
  ): Promise<SophiaResponse<PersonaEntryResponse>> {
    return this.performRequest<PersonaEntryResponse>({
      action: 'creating persona entry',
      method: 'POST',
      path: '/persona/entries',
      body: entry,
    })
  }

  /**
   * List persona entries with optional filters.
   */
  async getPersonaEntries(
    filters: PersonaListFilters = {}
  ): Promise<SophiaResponse<PersonaListResponse>> {
    const params: Record<string, string> = {}
    if (filters.entry_type) params.entry_type = filters.entry_type
    if (filters.sentiment) params.sentiment = filters.sentiment
    if (filters.related_process_id) params.related_process_id = filters.related_process_id
    if (filters.related_goal_id) params.related_goal_id = filters.related_goal_id
    if (filters.after_timestamp) params.after_timestamp = filters.after_timestamp
    if (filters.limit !== undefined) params.limit = String(filters.limit)
    if (filters.offset !== undefined) params.offset = String(filters.offset)

    return this.performRequest<PersonaListResponse>({
      action: 'listing persona entries',
      method: 'GET',
      path: '/persona/entries',
      params,
    })
  }

  /**
   * Get a single persona entry by ID.
   * Returns null if not found.
   */
  async getPersonaEntry(
    entryId: string
  ): Promise<SophiaResponse<PersonaEntryFull | null>> {
    const response = await this.performRequest<PersonaEntryFull>({
      action: 'fetching persona entry',
      method: 'GET',
      path: `/persona/entries/${entryId}`,
    })

    if (!response.success && response.error?.includes('404')) {
      return { success: true, data: null }
    }
    return response
  }

  /**
   * Update a persona entry (creates new CWM state, preserving history).
   */
  async updatePersonaEntry(
    entryId: string,
    update: Partial<
      Pick<PersonaEntryFull, 'summary' | 'sentiment' | 'confidence' | 'emotion_tags' | 'metadata'>
    >
  ): Promise<SophiaResponse<PersonaEntryFull>> {
    return this.performRequest<PersonaEntryFull>({
      action: 'updating persona entry',
      method: 'PATCH',
      path: `/persona/entries/${entryId}`,
      body: update,
    })
  }

  /**
   * Soft-delete a persona entry (creates tombstone).
   */
  async deletePersonaEntry(entryId: string): Promise<SophiaResponse<void>> {
    return this.performRequest<void>({
      action: 'deleting persona entry',
      method: 'DELETE',
      path: `/persona/entries/${entryId}`,
    })
  }

  /**
   * Get aggregated sentiment from recent persona entries.
   */
  async getPersonaSentiment(
    filters: SentimentFilters = {}
  ): Promise<SophiaResponse<SentimentResponse>> {
    const params: Record<string, string> = {}
    if (filters.limit !== undefined) params.limit = String(filters.limit)
    if (filters.after_timestamp) params.after_timestamp = filters.after_timestamp

    return this.performRequest<SentimentResponse>({
      action: 'fetching persona sentiment',
      method: 'GET',
      path: '/persona/sentiment',
      params,
    })
  }

  // ---------------------------------------------------------------------------
  // HCG Methods (migrated from hcg-client.ts)
  // ---------------------------------------------------------------------------

  /**
   * Get a snapshot of the HCG graph with entities and edges.
   */
  async getHCGSnapshot(
    entityTypes?: string[],
    limit: number = 200
  ): Promise<SophiaResponse<HCGGraphSnapshot>> {
    const params: Record<string, string> = { limit: String(limit) }
    if (entityTypes && entityTypes.length > 0) {
      params.entity_types = entityTypes.join(',')
    }

    return this.performRequest<HCGGraphSnapshot>({
      action: 'fetching HCG snapshot',
      method: 'GET',
      path: '/hcg/snapshot',
      params,
    })
  }

  /**
   * Get HCG entities with optional type filter.
   */
  async getHCGEntities(
    entityType?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<SophiaResponse<HCGEntity[]>> {
    const params: Record<string, string> = {
      limit: String(limit),
      offset: String(offset),
    }
    if (entityType) params.type = entityType

    return this.performRequest<HCGEntity[]>({
      action: 'fetching HCG entities',
      method: 'GET',
      path: '/hcg/entities',
      params,
    })
  }

  /**
   * Get a single HCG entity by ID.
   * Returns null if not found.
   */
  async getHCGEntity(entityId: string): Promise<SophiaResponse<HCGEntity | null>> {
    const response = await this.performRequest<HCGEntity>({
      action: 'fetching HCG entity',
      method: 'GET',
      path: `/hcg/entities/${entityId}`,
    })

    if (!response.success && response.error?.includes('404')) {
      return { success: true, data: null }
    }
    return response
  }

  /**
   * Get HCG edges with optional filters.
   */
  async getHCGEdges(
    entityId?: string,
    edgeType?: string,
    limit: number = 100
  ): Promise<SophiaResponse<HCGEdge[]>> {
    const params: Record<string, string> = { limit: String(limit) }
    if (entityId) params.entity_id = entityId
    if (edgeType) params.edge_type = edgeType

    return this.performRequest<HCGEdge[]>({
      action: 'fetching HCG edges',
      method: 'GET',
      path: '/hcg/edges',
      params,
    })
  }

  /**
   * Check HCG endpoint health.
   */
  async hcgHealthCheck(): Promise<boolean> {
    try {
      const response = await this.performRequest<{ status: string }>({
        action: 'checking HCG health',
        method: 'GET',
        path: '/hcg/health',
      })
      return response.success
    } catch {
      return false
    }
  }
}

export function createSophiaClient(config?: SophiaClientConfig): SophiaClient {
  return new SophiaClient({
    baseUrl: config?.baseUrl ?? import.meta.env.VITE_SOPHIA_API_URL,
    apiKey: config?.apiKey ?? import.meta.env.VITE_SOPHIA_API_KEY,
    timeout: config?.timeout,
  })
}

export const sophiaClient = createSophiaClient()

// ---------------------------------------------------------------------------
// CWM State types (for /cwm endpoint)
// ---------------------------------------------------------------------------

/**
 * Individual CWM state record from Sophia.
 * Matches CWMStateResponse in sophia/api/models.py
 */
export interface CWMState {
  state_id: string
  model_type: 'CWM_A' | 'CWM_G' | 'CWM_E' | string
  source: string
  timestamp: string // ISO 8601
  confidence: number
  status: 'observed' | 'imagined' | 'reflected' | string
  links: Record<string, unknown>
  tags: string[]
  data: Record<string, unknown>
}

/**
 * Response from Sophia /cwm endpoint.
 * Matches CWMStateListResponse in sophia/api/models.py
 */
export interface CWMStateListResponse {
  states: CWMState[]
  total: number
  model_type?: string
}

export interface GetCWMStatesOptions {
  /** Comma-separated CWM types (cwm_a, cwm_g, cwm_e) */
  types?: string
  /** Only return states after this ISO timestamp */
  afterTimestamp?: string
  /** Maximum states to return (1-100, default 20) */
  limit?: number
}

// ---------------------------------------------------------------------------
// Persona Types
// ---------------------------------------------------------------------------

export type PersonaEntryType = 'belief' | 'decision' | 'observation' | 'reflection'
export type PersonaSentiment = 'positive' | 'negative' | 'neutral' | 'mixed'

export interface PersonaEntryCreate {
  entry_type: PersonaEntryType
  content: string
  summary?: string
  trigger?: string
  sentiment?: PersonaSentiment
  confidence?: number
  related_process_ids?: string[]
  related_goal_ids?: string[]
  emotion_tags?: string[]
  metadata?: Record<string, unknown>
}

export interface PersonaEntryResponse {
  entry_id: string
  cwm_state_id: string
  timestamp: string
}

export interface PersonaEntryFull {
  entry_id: string
  timestamp: string
  entry_type: PersonaEntryType
  content: string
  summary?: string
  trigger?: string
  sentiment?: PersonaSentiment
  confidence?: number
  related_process_ids: string[]
  related_goal_ids: string[]
  emotion_tags: string[]
  metadata: Record<string, unknown>
}

export interface PersonaListResponse {
  entries: PersonaEntryFull[]
  total: number
  limit: number
  offset: number
}

export interface PersonaListFilters {
  entry_type?: PersonaEntryType
  sentiment?: PersonaSentiment
  related_process_id?: string
  related_goal_id?: string
  after_timestamp?: string
  limit?: number
  offset?: number
}

export interface SentimentResponse {
  sentiment: string | null
  confidence_avg: number | null
  recent_sentiment_trend: 'rising' | 'falling' | 'stable' | null
  emotion_distribution: Record<string, number>
  entry_count: number
  last_updated: string | null
}

export interface SentimentFilters {
  limit?: number
  after_timestamp?: string
}

// ---------------------------------------------------------------------------
// HCG Types (migrated from hcg-client.ts)
// ---------------------------------------------------------------------------

export interface HCGEntity {
  id: string
  type: string
  name: string
  properties: Record<string, unknown>
  labels: string[]
  created_at?: string
}

export interface HCGEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: string
  properties: Record<string, unknown>
}

export interface HCGGraphSnapshot {
  entities: HCGEntity[]
  edges: HCGEdge[]
  entity_count: number
  edge_count: number
}

export type {
  PlanRequest,
  PlanResponse,
  SimulationResponse,
  SophiaStateResponse,
  HealthResponse,
}

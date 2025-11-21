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
    if (
      payload &&
      typeof payload === 'object' &&
      'states' in (payload as Record<string, unknown>)
    ) {
      return response as SophiaResponse<SophiaStateResponse>
    }

    return {
      success: true,
      data: {
        states: [],
        cursor: undefined,
        nextPollAfterMs: undefined,
      },
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

export type {
  PlanRequest,
  PlanResponse,
  SimulationResponse,
  SophiaStateResponse,
  HealthResponse,
}

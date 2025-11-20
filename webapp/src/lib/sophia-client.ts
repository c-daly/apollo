/**
 * TypeScript client for Sophia Cognitive Core API
 * 
 * Provides type-safe interface to Sophia's planning, state management,
 * and execution capabilities. Matches Python CLI client functionality.
 */

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

// Response types based on Sophia OpenAPI spec
export interface HealthResponse {
  status: string
  version?: string
}

export interface StateResponse {
  state: {
    beliefs: Record<string, unknown>
    goals: Array<{
      id: string
      description: string
      priority?: string
      status?: string
    }>
    plans: Array<{
      id: string
      goal_id: string
      steps: unknown[]
      status?: string
    }>
  }
  timestamp: string
}

export interface GoalResponse {
  goal_id: string
  description: string
  priority?: string
  status: string
  created_at: string
}

export interface CreateGoalRequest {
  goal: string
  priority?: string
  metadata?: Record<string, unknown>
}

export interface PlanResponse {
  plan_id: string
  goal_id: string
  steps: Array<{
    step_id: string
    action: string
    parameters?: Record<string, unknown>
    preconditions?: string[]
    effects?: string[]
  }>
  status: string
  created_at: string
}

export interface PlansResponse {
  plans: Array<{
    plan_id: string
    goal_id: string
    status: string
    created_at: string
  }>
}

export interface CreatePlanRequest {
  goal_id: string
}

export interface ExecuteStepRequest {
  plan_id: string
  step_index: number
}

export interface ExecuteStepResponse {
  success: boolean
  step_id: string
  result: Record<string, unknown>
  new_state?: Record<string, unknown>
}

export interface SimulatePlanRequest {
  plan_id: string
  initial_state?: Record<string, unknown>
}

export interface SimulatePlanResponse {
  success: boolean
  final_state: Record<string, unknown>
  execution_trace: Array<{
    step_id: string
    state_before: Record<string, unknown>
    state_after: Record<string, unknown>
  }>
}

/**
 * Client for Sophia Cognitive Core API
 * 
 * Provides methods for:
 * - Health checks
 * - State management
 * - Goal creation
 * - Plan generation
 * - Plan execution
 * - Plan simulation
 */
export class SophiaClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number

  constructor(config: SophiaClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:8080'
    this.apiKey = config.apiKey
    this.timeout = config.timeout || 30000
  }

  /**
   * Internal fetch with timeout and error handling
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      }

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Wrap API calls with consistent error handling
   */
  private async handleRequest<T>(
    requestFn: () => Promise<Response>
  ): Promise<SophiaResponse<T>> {
    try {
      const response = await requestFn()
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.error || `Request failed: ${response.statusText}`,
        }
      }

      const data = await response.json()
      return {
        success: true,
        data: data as T,
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: `Request timed out after ${this.timeout}ms`,
          }
        }
        return {
          success: false,
          error: `Request failed: ${error.message}`,
        }
      }
      return {
        success: false,
        error: 'Unknown error occurred',
      }
    }
  }

  /**
   * Health check - verify Sophia service is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get detailed health information
   */
  async getHealth(): Promise<SophiaResponse<HealthResponse>> {
    return this.handleRequest<HealthResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/health`)
    )
  }

  /**
   * Get current agent state including beliefs, goals, and plans
   */
  async getState(): Promise<SophiaResponse<StateResponse>> {
    return this.handleRequest<StateResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/state`)
    )
  }

  /**
   * Create a new goal for the agent
   */
  async createGoal(
    request: CreateGoalRequest
  ): Promise<SophiaResponse<GoalResponse>> {
    return this.handleRequest<GoalResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/goals`, {
        method: 'POST',
        body: JSON.stringify(request),
      })
    )
  }

  /**
   * Get list of recent plans
   */
  async getPlans(limit: number = 10): Promise<SophiaResponse<PlansResponse>> {
    const params = new URLSearchParams({ limit: limit.toString() })
    return this.handleRequest<PlansResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/plans?${params}`)
    )
  }

  /**
   * Generate a plan for a goal (alias for createPlan)
   */
  async invokePlanner(goalId: string): Promise<SophiaResponse<PlanResponse>> {
    return this.handleRequest<PlanResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/planner/invoke`, {
        method: 'POST',
        body: JSON.stringify({ goal_id: goalId }),
      })
    )
  }

  /**
   * Create a plan for a goal
   */
  async createPlan(
    request: CreatePlanRequest
  ): Promise<SophiaResponse<PlanResponse>> {
    return this.handleRequest<PlanResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/plan`, {
        method: 'POST',
        body: JSON.stringify(request),
      })
    )
  }

  /**
   * Execute a single step from a plan
   */
  async executeStep(
    request: ExecuteStepRequest
  ): Promise<SophiaResponse<ExecuteStepResponse>> {
    return this.handleRequest<ExecuteStepResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/executor/step`, {
        method: 'POST',
        body: JSON.stringify(request),
      })
    )
  }

  /**
   * Simulate plan execution without committing changes
   */
  async simulatePlan(
    request: SimulatePlanRequest
  ): Promise<SophiaResponse<SimulatePlanResponse>> {
    return this.handleRequest<SimulatePlanResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/simulate`, {
        method: 'POST',
        body: JSON.stringify(request),
      })
    )
  }

  /**
   * Send a natural language command to Sophia
   */
  async sendCommand(
    command: string
  ): Promise<SophiaResponse<Record<string, unknown>>> {
    return this.handleRequest<Record<string, unknown>>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/command`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      })
    )
  }
}

/**
 * Create a Sophia client from environment variables
 */
export function createSophiaClient(): SophiaClient {
  return new SophiaClient({
    baseUrl: import.meta.env.VITE_SOPHIA_API_URL,
    apiKey: import.meta.env.VITE_SOPHIA_API_KEY,
  })
}

// Default client instance for convenience
export const sophiaClient = createSophiaClient()

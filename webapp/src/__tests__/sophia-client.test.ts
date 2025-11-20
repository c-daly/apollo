import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SophiaClient } from '../lib/sophia-client'

describe('SophiaClient', () => {
  let client: SophiaClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new SophiaClient({
      baseUrl: 'http://test-sophia:8080',
      apiKey: 'test-key',
      timeout: 5000,
    })

    // Mock global fetch
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use provided config', () => {
      const customClient = new SophiaClient({
        baseUrl: 'http://custom:9090',
        apiKey: 'custom-key',
        timeout: 10000,
      })
      expect(customClient).toBeDefined()
    })

    it('should use defaults when config not provided', () => {
      const defaultClient = new SophiaClient()
      expect(defaultClient).toBeDefined()
    })
  })

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const result = await client.healthCheck()
      expect(result).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        })
      )
    })

    it('should return false when service is unhealthy', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await client.healthCheck()
      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const result = await client.healthCheck()
      expect(result).toBe(false)
    })
  })

  describe('getHealth', () => {
    it('should return health response with data', async () => {
      const healthData = { status: 'ok', version: '0.2.0' }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => healthData,
      })

      const result = await client.getHealth()
      expect(result.success).toBe(true)
      expect(result.data).toEqual(healthData)
      expect(result.error).toBeUndefined()
    })

    it('should handle error responses', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Service unavailable' }),
      })

      const result = await client.getHealth()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Service unavailable')
      expect(result.data).toBeUndefined()
    })
  })

  describe('getState', () => {
    it('should fetch current agent state', async () => {
      const stateData = {
        state: {
          beliefs: { location: 'kitchen' },
          goals: [{ id: 'g1', description: 'test goal', status: 'active' }],
          plans: [],
        },
        timestamp: '2024-01-01T00:00:00Z',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => stateData,
      })

      const result = await client.getState()
      expect(result.success).toBe(true)
      expect(result.data).toEqual(stateData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/state',
        expect.any(Object)
      )
    })
  })

  describe('createGoal', () => {
    it('should create a goal with required fields', async () => {
      const goalResponse = {
        goal_id: 'g1',
        description: 'Navigate to kitchen',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => goalResponse,
      })

      const result = await client.createGoal({
        goal: 'Navigate to kitchen',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(goalResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/goals',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ goal: 'Navigate to kitchen' }),
        })
      )
    })

    it('should create a goal with priority and metadata', async () => {
      const goalResponse = {
        goal_id: 'g1',
        description: 'Pick up red block',
        priority: 'high',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => goalResponse,
      })

      const result = await client.createGoal({
        goal: 'Pick up red block',
        priority: 'high',
        metadata: { object: 'red_block' },
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(goalResponse)
    })
  })

  describe('getPlans', () => {
    it('should fetch plans with default limit', async () => {
      const plansData = {
        plans: [
          {
            plan_id: 'p1',
            goal_id: 'g1',
            status: 'completed',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => plansData,
      })

      const result = await client.getPlans()
      expect(result.success).toBe(true)
      expect(result.data).toEqual(plansData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/plans?limit=10',
        expect.any(Object)
      )
    })

    it('should fetch plans with custom limit', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ plans: [] }),
      })

      await client.getPlans(25)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/plans?limit=25',
        expect.any(Object)
      )
    })
  })

  describe('invokePlanner', () => {
    it('should invoke planner for a goal', async () => {
      const planResponse = {
        plan_id: 'p1',
        goal_id: 'g1',
        steps: [
          { step_id: 's1', action: 'move', parameters: { target: 'kitchen' } },
        ],
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => planResponse,
      })

      const result = await client.invokePlanner('g1')
      expect(result.success).toBe(true)
      expect(result.data).toEqual(planResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/planner/invoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ goal_id: 'g1' }),
        })
      )
    })
  })

  describe('createPlan', () => {
    it('should create a plan for a goal', async () => {
      const planResponse = {
        plan_id: 'p1',
        goal_id: 'g1',
        steps: [],
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => planResponse,
      })

      const result = await client.createPlan({ goal_id: 'g1' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual(planResponse)
    })
  })

  describe('executeStep', () => {
    it('should execute a plan step', async () => {
      const executeResponse = {
        success: true,
        step_id: 's1',
        result: { moved: true },
        new_state: { location: 'kitchen' },
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => executeResponse,
      })

      const result = await client.executeStep({
        plan_id: 'p1',
        step_index: 0,
      })
      expect(result.success).toBe(true)
      expect(result.data).toEqual(executeResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/executor/step',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ plan_id: 'p1', step_index: 0 }),
        })
      )
    })
  })

  describe('simulatePlan', () => {
    it('should simulate plan execution', async () => {
      const simulateResponse = {
        success: true,
        final_state: { location: 'kitchen' },
        execution_trace: [
          {
            step_id: 's1',
            state_before: { location: 'living_room' },
            state_after: { location: 'kitchen' },
          },
        ],
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => simulateResponse,
      })

      const result = await client.simulatePlan({ plan_id: 'p1' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual(simulateResponse)
    })

    it('should simulate with initial state', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          final_state: {},
          execution_trace: [],
        }),
      })

      const result = await client.simulatePlan({
        plan_id: 'p1',
        initial_state: { location: 'bedroom' },
      })
      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/simulate',
        expect.objectContaining({
          body: JSON.stringify({
            plan_id: 'p1',
            initial_state: { location: 'bedroom' },
          }),
        })
      )
    })
  })

  describe('sendCommand', () => {
    it('should send a natural language command', async () => {
      const commandResponse = { acknowledged: true, command_id: 'c1' }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => commandResponse,
      })

      const result = await client.sendCommand('Pick up the red block')
      expect(result.success).toBe(true)
      expect(result.data).toEqual(commandResponse)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/api/command',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ command: 'Pick up the red block' }),
        })
      )
    })
  })

  describe('error handling', () => {
    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      const result = await client.getState()
      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    })

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await client.getState()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })

    it('should handle JSON parsing errors in error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      const result = await client.getState()
      expect(result.success).toBe(false)
      expect(result.error).toContain('Internal Server Error')
    })
  })

  describe('authentication', () => {
    it('should include API key in request headers when provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      await client.getHealth()
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      )
    })

    it('should not include Authorization header when API key not provided', async () => {
      const noAuthClient = new SophiaClient({
        baseUrl: 'http://test-sophia:8080',
      })

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      await noAuthClient.getHealth()

      const callArgs = fetchMock.mock.calls[0][1]
      expect(callArgs.headers).not.toHaveProperty('Authorization')
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SophiaClient } from '../lib/sophia-client'

describe('SophiaClient', () => {
  let client: SophiaClient
  let fetchMock: ReturnType<typeof vi.fn>

  const jsonResponse = (
    data: unknown,
    init?: ConstructorParameters<typeof Response>[1]
  ) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })

  beforeEach(() => {
    client = new SophiaClient({
      baseUrl: 'http://test-sophia:8080',
      apiKey: 'test-key',
      timeout: 1000,
    })

    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  it('checks health via the SDK endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))

    const healthy = await client.healthCheck()

    expect(healthy).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-sophia:8080/health',
      expect.any(Object)
    )
  })

  it('fetches agent state via /state', async () => {
    const stateResponse = {
      states: [],
      cursor: 'next',
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(stateResponse))

    const result = await client.getState()

    expect(result.success).toBe(true)
    expect(result.data).toEqual(stateResponse)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-sophia:8080/state?limit=10',
      expect.objectContaining({
        method: 'GET',
      })
    )
  })

  it('creates a goal by calling /plan', async () => {
    const planResponse = {
      plan_id: 'plan-123',
      status: 'accepted',
      states: [],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(planResponse))

    const result = await client.createGoal({ goal: 'Inspect the kitchen' })

    expect(result.success).toBe(true)
    expect(result.data?.planId).toBe('plan-123')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-sophia:8080/plan',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('falls back to legacy /api/command when /plan is unavailable', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'missing' },
          { status: 404, statusText: 'Not Found' }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({ plan_id: 'legacy-plan', status: 'completed' })
      )

    const result = await client.sendCommand('Pick up the block')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://test-sophia:8080/plan',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://test-sophia:8080/api/command',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('falls back to legacy simulation endpoint on 404', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'missing' },
          { status: 404, statusText: 'Not Found' }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, final_state: { status: 'ok' } })
      )

    const result = await client.simulatePlan('plan-1')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://test-sophia:8080/simulate',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://test-sophia:8080/api/simulate',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns friendly message for executeStep', async () => {
    const result = await client.executeStep()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Talos/)
  })
})

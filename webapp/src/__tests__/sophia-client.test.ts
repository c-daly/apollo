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

  // --- Persona Methods Tests ---

  describe('Persona Methods', () => {
    it('creates a persona entry', async () => {
      const createResponse = {
        entry_id: 'persona_abc123',
        cwm_state_id: 'cwm_e_xyz789',
        timestamp: '2026-01-04T12:00:00Z',
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(createResponse, { status: 201 }))

      const result = await client.createPersonaEntry({
        entry_type: 'decision',
        content: 'Test decision content',
        sentiment: 'positive',
        confidence: 0.85,
      })

      expect(result.success).toBe(true)
      expect(result.data?.entry_id).toBe('persona_abc123')
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/persona/entries',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('lists persona entries with filters', async () => {
      const listResponse = {
        entries: [
          { entry_id: 'persona_1', entry_type: 'decision', content: 'Test 1' },
          { entry_id: 'persona_2', entry_type: 'decision', content: 'Test 2' },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(listResponse))

      const result = await client.getPersonaEntries({
        entry_type: 'decision',
        limit: 20,
      })

      expect(result.success).toBe(true)
      expect(result.data?.entries).toHaveLength(2)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/persona/entries'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('gets a single persona entry by ID', async () => {
      const entryResponse = {
        entry_id: 'persona_abc123',
        entry_type: 'belief',
        content: 'Test belief content',
        timestamp: '2026-01-04T12:00:00Z',
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(entryResponse))

      const result = await client.getPersonaEntry('persona_abc123')

      expect(result.success).toBe(true)
      expect(result.data?.entry_id).toBe('persona_abc123')
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/persona/entries/persona_abc123',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('returns null for nonexistent persona entry', async () => {
      // The client checks if error includes "404" to return null instead of error
      fetchMock.mockResolvedValueOnce(
        new Response('404 Not Found', { status: 404, statusText: 'Not Found' })
      )

      const result = await client.getPersonaEntry('persona_nonexistent')

      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
    })

    it('updates a persona entry', async () => {
      const updateResponse = {
        entry_id: 'persona_abc123',
        entry_type: 'belief',
        content: 'Test content',
        sentiment: 'positive',
        confidence: 0.9,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(updateResponse))

      const result = await client.updatePersonaEntry('persona_abc123', {
        sentiment: 'positive',
        confidence: 0.9,
      })

      expect(result.success).toBe(true)
      expect(result.data?.sentiment).toBe('positive')
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/persona/entries/persona_abc123',
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    it('deletes a persona entry', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

      const result = await client.deletePersonaEntry('persona_abc123')

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/persona/entries/persona_abc123',
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('gets sentiment aggregation', async () => {
      const sentimentResponse = {
        sentiment: 'positive',
        confidence_avg: 0.78,
        recent_sentiment_trend: 'rising',
        emotion_distribution: { decisive: 5, analytical: 3 },
        entry_count: 15,
        last_updated: '2026-01-04T12:00:00Z',
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(sentimentResponse))

      const result = await client.getPersonaSentiment({ limit: 15 })

      expect(result.success).toBe(true)
      expect(result.data?.sentiment).toBe('positive')
      expect(result.data?.entry_count).toBe(15)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/persona/sentiment'),
        expect.objectContaining({ method: 'GET' })
      )
    })
  })

  // --- HCG Methods Tests ---

  describe('HCG Methods', () => {
    it('gets HCG snapshot', async () => {
      const snapshotResponse = {
        entities: [{ id: 'entity-1', type: 'state', name: 'test' }],
        edges: [{ id: 'edge-1', source_id: 'a', target_id: 'b', edge_type: 'CAUSES' }],
        entity_count: 1,
        edge_count: 1,
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(snapshotResponse))

      const result = await client.getHCGSnapshot(['state'], 100)

      expect(result.success).toBe(true)
      expect(result.data?.entities).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/hcg/snapshot'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('gets HCG entities', async () => {
      const entitiesResponse = [
        { id: 'entity-1', type: 'state', name: 'Test State', properties: {}, labels: [] },
      ]
      fetchMock.mockResolvedValueOnce(jsonResponse(entitiesResponse))

      const result = await client.getHCGEntities('state', 50, 0)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/hcg/entities'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('gets a single HCG entity by ID', async () => {
      const entityResponse = {
        id: 'entity-1',
        type: 'state',
        name: 'Test State',
        properties: {},
        labels: [],
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(entityResponse))

      const result = await client.getHCGEntity('entity-1')

      expect(result.success).toBe(true)
      expect(result.data?.id).toBe('entity-1')
    })

    it('returns null for nonexistent HCG entity', async () => {
      // The client checks if error includes "404" to return null instead of error
      fetchMock.mockResolvedValueOnce(
        new Response('404 Not Found', { status: 404, statusText: 'Not Found' })
      )

      const result = await client.getHCGEntity('nonexistent')

      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
    })

    it('gets HCG edges', async () => {
      const edgesResponse = [
        { id: 'edge-1', source_id: 'a', target_id: 'b', edge_type: 'CAUSES', properties: {} },
      ]
      fetchMock.mockResolvedValueOnce(jsonResponse(edgesResponse))

      const result = await client.getHCGEdges('a', 'CAUSES', 50)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/hcg/edges'),
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('checks HCG health', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))

      const result = await client.hcgHealthCheck()

      expect(result).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/hcg/health',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('returns false for HCG health check on error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const result = await client.hcgHealthCheck()

      expect(result).toBe(false)
    })

    // --- Lazy-load (seed + expand) scoped endpoints ---

    it('fetches HCG stats from /hcg/stats', async () => {
      const statsResponse = {
        total_nodes: 7006,
        content_nodes: 2313,
        edge_nodes: 4693,
        type_definitions: 16,
        content_classified: 965,
        content_parked: 1311,
        by_realm: { entity: 2109, process: 94 },
        top_predicates: { IS_A: 2276 },
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(statsResponse))

      const result = await client.getHCGStats()

      expect(result.success).toBe(true)
      expect(result.data?.total_nodes).toBe(7006)
      expect(result.data?.by_realm.entity).toBe(2109)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-sophia:8080/hcg/stats',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('fetches the HCG type layer from /hcg/types with a limit', async () => {
      const typesResponse = [
        { uuid: 't-1', name: 'entity', member_count: 1235, parent: 'node' },
        { uuid: 't-2', name: 'chemical substance', member_count: 78, parent: 'agent' },
      ]
      fetchMock.mockResolvedValueOnce(jsonResponse(typesResponse))

      const result = await client.getHCGTypes(40)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0].member_count).toBe(1235)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/hcg/types')
      expect(url).toContain('limit=40')
    })

    it('fetches a de-reified neighborhood from /hcg/neighborhood/{uuid}', async () => {
      const neighborhoodResponse = {
        nodes: [
          { uuid: 'n-1', name: 'social plant', type: 'entity', properties: {} },
          { uuid: 'n-2', name: 'mutual aid', type: 'entity', properties: {} },
        ],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-2', relation: 'IS_A' },
        ],
        metadata: {
          root: 'n-1',
          depth: 1,
          reified: false,
          node_count: 2,
          edge_count: 1,
        },
      }
      fetchMock.mockResolvedValueOnce(jsonResponse(neighborhoodResponse))

      const result = await client.getHCGNeighborhood('n-1', 1, 60)

      expect(result.success).toBe(true)
      expect(result.data?.nodes).toHaveLength(2)
      expect(result.data?.edges[0].relation).toBe('IS_A')
      expect(result.data?.metadata.reified).toBe(false)
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/hcg/neighborhood/n-1')
      expect(url).toContain('depth=1')
      expect(url).toContain('limit=60')
    })

    it('url-encodes the neighborhood uuid', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          nodes: [],
          edges: [],
          metadata: { root: 'a/b', depth: 1, reified: false, node_count: 0, edge_count: 0 },
        })
      )

      await client.getHCGNeighborhood('a/b')

      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/hcg/neighborhood/a%2Fb')
    })

    it('searches HCG nodes via /hcg/search', async () => {
      const searchResponse = [
        { uuid: 's-1', name: 'Plan: Blue Block to Bin', type: 'plan' },
        { uuid: 's-2', name: 'social plant', type: 'entity' },
      ]
      fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse))

      const result = await client.searchHCG('plan', 20)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data?.[0].type).toBe('plan')
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('/hcg/search')
      expect(url).toContain('q=plan')
      expect(url).toContain('limit=20')
    })

    it('surfaces a failed stats request as an error result', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('boom', { status: 500, statusText: 'Server Error' })
      )

      const result = await client.getHCGStats()

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })
})

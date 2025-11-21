import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HermesClient } from '../lib/hermes-client'

describe('HermesClient', () => {
  let client: HermesClient
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
    client = new HermesClient({
      baseUrl: 'http://test-hermes:8081',
      apiKey: 'test-hermes-key',
    })

    fetchMock = vi.fn()
    globalThis.fetch = fetchMock
  })

  it('performs a health check via /health', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const healthy = await client.healthCheck()
    expect(healthy).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-hermes:8081/health',
      expect.objectContaining({})
    )
  })

  it('retrieves health metadata', async () => {
    const payload = { status: 'ok', models: ['default'] }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))
    const result = await client.getHealth()
    expect(result.success).toBe(true)
    expect(result.data).toEqual(payload)
  })

  it('generates an embedding via the SDK endpoint', async () => {
    const embeddingPayload = {
      embedding: [0.1, 0.2],
      model: 'default',
      dimension: 2,
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(embeddingPayload))

    const result = await client.embedText({ text: 'Hello world' })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-hermes:8081/embed_text',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('falls back to /api/embed_text when the SDK endpoint does not exist', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ error: 'not found' }, { status: 404, statusText: 'Not Found' })
      )
      .mockResolvedValueOnce(
        jsonResponse({ embedding: [0.3], model: 'legacy', dimension: 1 })
      )

    const result = await client.embedText({ text: 'Fallback' })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://test-hermes:8081/embed_text',
      expect.objectContaining({ method: 'POST' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://test-hermes:8081/api/embed_text',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('runs simple NLP operations', async () => {
    const nlpPayload = { tokens: ['hello'] }
    fetchMock.mockResolvedValueOnce(jsonResponse(nlpPayload))

    const result = await client.simpleNlp({ text: 'hello' })
    expect(result.success).toBe(true)
  })

  it('invokes the LLM gateway', async () => {
    const llmResponse = {
      id: 'chatcmpl-123',
      provider: 'echo',
      model: 'echo',
      created: 1_700_000_000,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'pong' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(llmResponse))

    const result = await client.llmGenerate({
      messages: [{ role: 'user', content: 'ping' }],
      model: 'echo',
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test-hermes:8081/llm',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HermesClient } from '../lib/hermes-client'

describe('HermesClient', () => {
  let client: HermesClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new HermesClient({
      baseUrl: 'http://test-hermes:8081',
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
      const customClient = new HermesClient({
        baseUrl: 'http://custom:9091',
        apiKey: 'custom-key',
        timeout: 10000,
      })
      expect(customClient).toBeDefined()
    })

    it('should use defaults when config not provided', () => {
      const defaultClient = new HermesClient()
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
        'http://test-hermes:8081/health',
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
    it('should return health response with available models', async () => {
      const healthData = {
        status: 'ok',
        version: '0.2.0',
        models: ['sentence-transformers', 'all-MiniLM-L6-v2'],
      }
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

  describe('embedText', () => {
    it('should generate embedding for text with defaults', async () => {
      const embeddingData = {
        embedding: [0.1, 0.2, 0.3],
        model: 'sentence-transformers',
        dimensions: 3,
        normalized: true,
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => embeddingData,
      })

      const result = await client.embedText({
        text: 'Navigate to the kitchen',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(embeddingData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/embed_text',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            text: 'Navigate to the kitchen',
            model: 'sentence-transformers',
            normalize: true,
          }),
        })
      )
    })

    it('should use custom model and normalization', async () => {
      const embeddingData = {
        embedding: [0.1, 0.2, 0.3],
        model: 'all-MiniLM-L6-v2',
        dimensions: 3,
        normalized: false,
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => embeddingData,
      })

      const result = await client.embedText({
        text: 'Test text',
        model: 'all-MiniLM-L6-v2',
        normalize: false,
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(embeddingData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/embed_text',
        expect.objectContaining({
          body: JSON.stringify({
            text: 'Test text',
            model: 'all-MiniLM-L6-v2',
            normalize: false,
          }),
        })
      )
    })

    it('should handle embedding generation errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Text too long' }),
      })

      const result = await client.embedText({
        text: 'a'.repeat(10000),
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Text too long')
    })
  })

  describe('embedBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const batchData = {
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
        model: 'sentence-transformers',
        dimensions: 3,
        normalized: true,
        count: 2,
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => batchData,
      })

      const result = await client.embedBatch({
        texts: ['First text', 'Second text'],
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(batchData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/embed_batch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            texts: ['First text', 'Second text'],
            model: 'sentence-transformers',
            normalize: true,
          }),
        })
      )
    })

    it('should use custom model for batch', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [[0.1], [0.2]],
          model: 'custom-model',
          dimensions: 1,
          normalized: false,
          count: 2,
        }),
      })

      const result = await client.embedBatch({
        texts: ['Text 1', 'Text 2'],
        model: 'custom-model',
        normalize: false,
      })

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/embed_batch',
        expect.objectContaining({
          body: JSON.stringify({
            texts: ['Text 1', 'Text 2'],
            model: 'custom-model',
            normalize: false,
          }),
        })
      )
    })

    it('should handle empty text array', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [],
          model: 'sentence-transformers',
          dimensions: 0,
          normalized: true,
          count: 0,
        }),
      })

      const result = await client.embedBatch({ texts: [] })
      expect(result.success).toBe(true)
      expect(result.data?.count).toBe(0)
    })
  })

  describe('search', () => {
    it('should perform semantic search with defaults', async () => {
      const searchData = {
        results: [
          { id: 'doc1', score: 0.95, text: 'Relevant document' },
          { id: 'doc2', score: 0.85, text: 'Another document' },
        ],
        query_embedding: [0.1, 0.2, 0.3],
        model: 'sentence-transformers',
        total_results: 2,
      }
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => searchData,
      })

      const result = await client.search({
        query: 'Find relevant documents',
      })

      expect(result.success).toBe(true)
      expect(result.data).toEqual(searchData)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'Find relevant documents',
            k: 10,
            model: 'sentence-transformers',
            filter: undefined,
          }),
        })
      )
    })

    it('should use custom k and model', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          model: 'custom-model',
          total_results: 0,
        }),
      })

      const result = await client.search({
        query: 'Test query',
        k: 5,
        model: 'custom-model',
      })

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/search',
        expect.objectContaining({
          body: JSON.stringify({
            query: 'Test query',
            k: 5,
            model: 'custom-model',
            filter: undefined,
          }),
        })
      )
    })

    it('should include filter in search request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          model: 'sentence-transformers',
          total_results: 0,
        }),
      })

      const result = await client.search({
        query: 'Test',
        filter: { category: 'goals', status: 'active' },
      })

      expect(result.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://test-hermes:8081/api/search',
        expect.objectContaining({
          body: JSON.stringify({
            query: 'Test',
            k: 10,
            model: 'sentence-transformers',
            filter: { category: 'goals', status: 'active' },
          }),
        })
      )
    })

    it('should handle search errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid query' }),
      })

      const result = await client.search({ query: '' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid query')
    })
  })

  describe('error handling', () => {
    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      const result = await client.embedText({ text: 'test' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    })

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await client.embedText({ text: 'test' })
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

      const result = await client.embedText({ text: 'test' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Internal Server Error')
    })

    it('should handle unknown errors', async () => {
      fetchMock.mockRejectedValueOnce('Unknown error')

      const result = await client.embedText({ text: 'test' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unknown error occurred')
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
      const noAuthClient = new HermesClient({
        baseUrl: 'http://test-hermes:8081',
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

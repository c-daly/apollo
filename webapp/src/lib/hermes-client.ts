/**
 * TypeScript client for Hermes Language & Embedding API
 *
 * Provides type-safe interface to Hermes's text embedding and semantic search
 * capabilities. Matches Python CLI client functionality.
 */

export interface HermesClientConfig {
  baseUrl?: string
  apiKey?: string
  timeout?: number
}

export interface HermesResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Response types based on Hermes OpenAPI spec
export interface HealthResponse {
  status: string
  version?: string
  models?: string[]
}

export interface EmbeddingResponse {
  embedding: number[]
  model: string
  dimensions: number
  normalized: boolean
}

export interface EmbedTextRequest {
  text: string
  model?: string
  normalize?: boolean
}

export interface BatchEmbeddingResponse {
  embeddings: number[][]
  model: string
  dimensions: number
  normalized: boolean
  count: number
}

export interface EmbedBatchRequest {
  texts: string[]
  model?: string
  normalize?: boolean
}

export interface SearchResult {
  id: string
  score: number
  text?: string
  metadata?: Record<string, unknown>
}

export interface SearchResponse {
  results: SearchResult[]
  query_embedding?: number[]
  model: string
  total_results: number
}

export interface SearchRequest {
  query: string
  k?: number
  model?: string
  filter?: Record<string, unknown>
}

/**
 * Client for Hermes Language & Embedding API
 *
 * Provides methods for:
 * - Health checks
 * - Text embedding (single and batch)
 * - Semantic search
 */
export class HermesClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number

  constructor(config: HermesClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:8081'
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
  ): Promise<HermesResponse<T>> {
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
   * Health check - verify Hermes service is running
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
   * Get detailed health information including available models
   */
  async getHealth(): Promise<HermesResponse<HealthResponse>> {
    return this.handleRequest<HealthResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/health`)
    )
  }

  /**
   * Generate embedding for a single text
   */
  async embedText(
    request: EmbedTextRequest
  ): Promise<HermesResponse<EmbeddingResponse>> {
    const payload = {
      text: request.text,
      model: request.model || 'sentence-transformers',
      normalize: request.normalize !== undefined ? request.normalize : true,
    }

    return this.handleRequest<EmbeddingResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/embed_text`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
  }

  /**
   * Generate embeddings for multiple texts in a batch
   */
  async embedBatch(
    request: EmbedBatchRequest
  ): Promise<HermesResponse<BatchEmbeddingResponse>> {
    const payload = {
      texts: request.texts,
      model: request.model || 'sentence-transformers',
      normalize: request.normalize !== undefined ? request.normalize : true,
    }

    return this.handleRequest<BatchEmbeddingResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/embed_batch`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
  }

  /**
   * Perform semantic search using query text
   */
  async search(
    request: SearchRequest
  ): Promise<HermesResponse<SearchResponse>> {
    const payload = {
      query: request.query,
      k: request.k || 10,
      model: request.model || 'sentence-transformers',
      filter: request.filter,
    }

    return this.handleRequest<SearchResponse>(() =>
      this.fetchWithTimeout(`${this.baseUrl}/api/search`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
  }
}

/**
 * Create a Hermes client from environment variables
 */
export function createHermesClient(): HermesClient {
  return new HermesClient({
    baseUrl: import.meta.env.VITE_HERMES_API_URL,
    apiKey: import.meta.env.VITE_HERMES_API_KEY,
  })
}

// Default client instance for convenience
export const hermesClient = createHermesClient()

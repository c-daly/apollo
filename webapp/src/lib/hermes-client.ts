/**
 * Hermes client backed by the generated @logos/hermes-sdk package.
 *
 * Provides a minimal wrapper that keeps the existing response envelope
 * (`HermesResponse`) while delegating transport details to the shared SDK.
 * A lightweight legacy fallback is retained for environments that still
 * expose the older /api/* endpoints.
 */

import {
  Configuration,
  DefaultApi,
  EmbedText200Response,
  EmbedTextRequest as HermesEmbedTextRequest,
  LLMRequest,
  LLMResponse,
  ResponseError,
  SimpleNlp200Response,
  SimpleNlpRequest,
} from '@logos/hermes-sdk'

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

export interface HermesHealthResponse {
  status: string
  version?: string
  models?: string[]
}

export interface EmbedTextRequest {
  text: string
  model?: string
}

export interface SimpleNlpOptions {
  text: string
  operations?: Array<'tokenize' | 'pos_tag' | 'lemmatize' | 'ner'>
}

interface HermesClientDependencies {
  defaultApi: DefaultApi
}

const DEFAULT_TIMEOUT_MS = 30_000
type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

export class HermesClient {
  private readonly defaultApi: DefaultApi
  private readonly timeout: number
  private readonly baseUrl: string
  private readonly apiKey?: string

  constructor(
    config: HermesClientConfig = {},
    deps?: Partial<HermesClientDependencies>
  ) {
    this.baseUrl = config.baseUrl || 'http://localhost:8081'
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS

    const configuration = new Configuration({
      basePath: this.baseUrl,
      accessToken: this.apiKey ? async () => this.apiKey as string : undefined,
      fetchApi: (input, init) => this.fetchWithTimeout(input, init),
    })

    this.defaultApi = deps?.defaultApi ?? new DefaultApi(configuration)
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  async getHealth(): Promise<HermesResponse<HermesHealthResponse>> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/health`, {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
      })

      if (!response.ok) {
        const text = await response.text()
        return {
          success: false,
          error: text || response.statusText,
        }
      }

      const data = (await response.json()) as HermesHealthResponse
      return { success: true, data }
    } catch (error) {
      if (this.isAbortError(error)) {
        return {
          success: false,
          error: `Request timed out after ${this.timeout}ms while retrieving Hermes health`,
        }
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: `Failed to retrieve Hermes health: ${error.message}`,
        }
      }

      return {
        success: false,
        error: 'Failed to retrieve Hermes health',
      }
    }
  }

  async embedText(
    request: EmbedTextRequest
  ): Promise<HermesResponse<EmbedText200Response>> {
    if (!request.text.trim()) {
      return { success: false, error: 'Text is required for embedding' }
    }

    const payload: HermesEmbedTextRequest = {
      text: request.text,
      model: request.model || 'default',
    }

    try {
      const response = await this.defaultApi.embedText({
        embedTextRequest: payload,
      })
      return this.success(response)
    } catch (error) {
      if (this.isNotFound(error)) {
        return this.legacyEmbedText(payload)
      }
      return this.failure('generating embedding', error)
    }
  }

  async simpleNlp(
    request: SimpleNlpOptions
  ): Promise<HermesResponse<SimpleNlp200Response>> {
    if (!request.text.trim()) {
      return { success: false, error: 'Text is required for NLP processing' }
    }

    const payload: SimpleNlpRequest = {
      text: request.text,
      operations: request.operations,
    }

    try {
      const response = await this.defaultApi.simpleNlp({
        simpleNlpRequest: payload,
      })
      return this.success(response)
    } catch (error) {
      return this.failure('running simple NLP', error)
    }
  }

  async llmGenerate(request: LLMRequest): Promise<HermesResponse<LLMResponse>> {
    try {
      const response = await this.defaultApi.llmGenerate({
        lLMRequest: request,
      })
      return this.success(response)
    } catch (error) {
      return this.failure('calling the LLM gateway', error)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private success<T>(data: T): HermesResponse<T> {
    return { success: true, data }
  }

  private async failure(
    action: string,
    error: unknown
  ): Promise<HermesResponse<never>> {
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
        error: `Hermes API error while ${action}: ${details}`,
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

  private async legacyEmbedText(
    payload: HermesEmbedTextRequest
  ): Promise<HermesResponse<EmbedText200Response>> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/embed_text`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders(),
          },
          body: JSON.stringify({
            text: payload.text,
            model: payload.model,
          }),
        }
      )

      if (!response.ok) {
        const text = await response.text()
        return {
          success: false,
          error: text || `Hermes legacy request failed: ${response.statusText}`,
        }
      }

      const data = (await response.json()) as EmbedText200Response
      return { success: true, data }
    } catch (error) {
      if (this.isAbortError(error)) {
        return {
          success: false,
          error: `Request timed out after ${this.timeout}ms while generating embedding`,
        }
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: `Legacy embedding failed: ${error.message}`,
        }
      }

      return {
        success: false,
        error: 'Legacy embedding failed',
      }
    }
  }
}

export function createHermesClient(config?: HermesClientConfig): HermesClient {
  return new HermesClient({
    baseUrl: config?.baseUrl ?? import.meta.env.VITE_HERMES_API_URL,
    apiKey: config?.apiKey ?? import.meta.env.VITE_HERMES_API_KEY,
    timeout: config?.timeout,
  })
}

export const hermesClient = createHermesClient()

export type {
  EmbedText200Response,
  LLMRequest,
  LLMResponse,
  SimpleNlp200Response,
  SimpleNlpRequest,
}

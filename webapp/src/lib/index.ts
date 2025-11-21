/**
 * Apollo API Client Library
 *
 * Centralized exports for all API clients and configuration
 */

// Configuration
export {
  loadConfig,
  getSophiaConfig,
  getHermesConfig,
  getFeatureFlags,
  validateConfig,
  isConfigValid,
  config,
} from './config'
export type {
  SophiaConfig,
  HermesConfig,
  FeatureFlags,
  ApolloConfig,
} from './config'

// Sophia Client
export { SophiaClient, createSophiaClient, sophiaClient } from './sophia-client'
export type {
  SophiaClientConfig,
  SophiaResponse,
  PlanRequest,
  PlanResponse,
  SimulationResponse,
  SophiaStateResponse as StateResponse,
  HealthResponse as SophiaHealthResponse,
} from './sophia-client'

// Hermes Client
export { HermesClient, createHermesClient, hermesClient } from './hermes-client'
export type {
  HermesClientConfig,
  HermesResponse,
  EmbedTextRequest,
  SimpleNlpOptions,
  EmbedText200Response as EmbeddingResponse,
  SimpleNlp200Response,
  LLMRequest,
  LLMResponse,
} from './hermes-client'
export type { HermesHealthResponse } from './hermes-client'

// HCG Client (existing)
export { HCGAPIClient, hcgClient } from './hcg-client'
export type { HCGClientConfig } from './hcg-client'

// WebSocket Client (existing)
export { HCGWebSocketClient } from './websocket-client'
export type { WebSocketClientConfig } from './websocket-client'

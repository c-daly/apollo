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
  getHCGConfig,
  getFeatureFlags,
  validateConfig,
  isConfigValid,
  config,
} from './config'
export type {
  SophiaConfig,
  HermesConfig,
  HermesLLMConfig,
  HCGConfig,
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
  // Persona types
  PersonaEntryType,
  PersonaSentiment,
  PersonaEntryCreate,
  PersonaEntryResponse,
  PersonaEntryFull,
  PersonaListResponse,
  PersonaListFilters,
  SentimentResponse,
  SentimentFilters,
  // HCG types
  HCGEntity,
  HCGEdge,
  HCGGraphSnapshot,
  // CWM types
  CWMState,
  CWMStateListResponse,
  GetCWMStatesOptions,
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

// WebSocket Client (existing)
export { HCGWebSocketClient } from './websocket-client'
export type { WebSocketClientConfig } from './websocket-client'

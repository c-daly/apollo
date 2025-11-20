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
  HealthResponse as SophiaHealthResponse,
  StateResponse,
  GoalResponse,
  CreateGoalRequest,
  PlanResponse,
  PlansResponse,
  CreatePlanRequest,
  ExecuteStepRequest,
  ExecuteStepResponse,
  SimulatePlanRequest,
  SimulatePlanResponse,
} from './sophia-client'

// Hermes Client
export { HermesClient, createHermesClient, hermesClient } from './hermes-client'
export type {
  HermesClientConfig,
  HermesResponse,
  HealthResponse as HermesHealthResponse,
  EmbeddingResponse,
  EmbedTextRequest,
  BatchEmbeddingResponse,
  EmbedBatchRequest,
  SearchResult,
  SearchResponse,
  SearchRequest,
} from './hermes-client'

// HCG Client (existing)
export { HCGAPIClient, hcgClient } from './hcg-client'
export type { HCGClientConfig } from './hcg-client'

// WebSocket Client (existing)
export { HCGWebSocketClient } from './websocket-client'
export type { WebSocketClientConfig } from './websocket-client'

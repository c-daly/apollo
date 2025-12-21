/**
 * Configuration management for Apollo webapp
 *
 * Provides centralized access to environment variables and configuration
 * with sensible defaults. Matches Python CLI config structure.
 */

export interface SophiaConfig {
  baseUrl: string
  apiKey?: string
  timeout: number
}

export interface HermesLLMConfig {
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface HermesConfig {
  baseUrl: string
  apiKey?: string
  timeout: number
  llm: HermesLLMConfig
}

export interface HCGConfig {
  apiUrl: string
  wsUrl: string
  timeout: number
}

export interface FeatureFlags {
  enableChat: boolean
  enableDiagnostics: boolean
}

export interface ApolloConfig {
  sophia: SophiaConfig
  hermes: HermesConfig
  hcg: HCGConfig
  features: FeatureFlags
}

/**
 * Parse boolean from environment variable
 * Handles various string representations of true/false
 */
function parseBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Parse timeout from environment variable with validation
 */
function parseTimeout(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) || parsed <= 0 ? defaultValue : parsed
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return undefined
  }
  return parsed
}

/**
 * Load Apollo configuration from environment variables
 *
 * Environment variables:
 * - VITE_SOPHIA_API_URL: Sophia API base URL (default: http://localhost:47000)
 * - VITE_SOPHIA_API_KEY: Optional API key for Sophia authentication
 * - VITE_SOPHIA_TIMEOUT: Request timeout in milliseconds (default: 30000)
 * - VITE_HERMES_API_URL: Hermes API base URL (default: http://localhost:17000)
 * - VITE_HERMES_API_KEY: Optional API key for Hermes authentication
 * - VITE_HERMES_TIMEOUT: Request timeout in milliseconds (default: 30000)
 * - VITE_HCG_API_URL: HCG REST API base URL (default: http://localhost:27000)
 * - VITE_HCG_WS_URL: HCG WebSocket URL (default: ws://localhost:8765)
 * - VITE_HCG_TIMEOUT: HCG REST timeout in milliseconds (default: 30000)
 * - VITE_ENABLE_CHAT: Enable chat panel (default: true)
 * - VITE_ENABLE_DIAGNOSTICS: Enable diagnostics panel (default: true)
 */
export function loadConfig(): ApolloConfig {
  return {
    sophia: {
      baseUrl: import.meta.env.VITE_SOPHIA_API_URL || 'http://localhost:47000',
      apiKey: import.meta.env.VITE_SOPHIA_API_KEY || undefined,
      timeout: parseTimeout(import.meta.env.VITE_SOPHIA_TIMEOUT, 30000),
    },
    hermes: {
      baseUrl: import.meta.env.VITE_HERMES_API_URL || 'http://localhost:17000',
      apiKey: import.meta.env.VITE_HERMES_API_KEY || undefined,
      timeout: parseTimeout(import.meta.env.VITE_HERMES_TIMEOUT, 30000),
      llm: {
        provider: import.meta.env.VITE_HERMES_LLM_PROVIDER || undefined,
        model: import.meta.env.VITE_HERMES_LLM_MODEL || undefined,
        temperature: parseOptionalNumber(
          import.meta.env.VITE_HERMES_LLM_TEMPERATURE
        ),
        maxTokens: parseOptionalNumber(
          import.meta.env.VITE_HERMES_LLM_MAX_TOKENS
        ),
        systemPrompt: import.meta.env.VITE_HERMES_SYSTEM_PROMPT || undefined,
      },
    },
    hcg: {
      apiUrl: import.meta.env.VITE_HCG_API_URL || 'http://localhost:27000',
      wsUrl: import.meta.env.VITE_HCG_WS_URL || 'ws://localhost:8765',
      timeout: parseTimeout(import.meta.env.VITE_HCG_TIMEOUT, 30000),
    },
    features: {
      enableChat: parseBoolean(import.meta.env.VITE_ENABLE_CHAT, true),
      enableDiagnostics: parseBoolean(
        import.meta.env.VITE_ENABLE_DIAGNOSTICS,
        true
      ),
    },
  }
}

/**
 * Get Sophia configuration
 */
export function getSophiaConfig(): SophiaConfig {
  return loadConfig().sophia
}

/**
 * Get Hermes configuration
 */
export function getHermesConfig(): HermesConfig {
  return loadConfig().hermes
}

/**
 * Get HCG configuration
 */
export function getHCGConfig(): HCGConfig {
  return loadConfig().hcg
}

/**
 * Get feature flags
 */
export function getFeatureFlags(): FeatureFlags {
  return loadConfig().features
}

/**
 * Validate that required configuration is present
 * Returns array of missing configuration items
 */
export function validateConfig(): string[] {
  const missing: string[] = []
  const config = loadConfig()

  if (!config.sophia.baseUrl) {
    missing.push('VITE_SOPHIA_API_URL')
  }

  if (!config.hermes.baseUrl) {
    missing.push('VITE_HERMES_API_URL')
  }

  if (!config.hcg.apiUrl) {
    missing.push('VITE_HCG_API_URL')
  }

  if (!config.hcg.wsUrl) {
    missing.push('VITE_HCG_WS_URL')
  }

  return missing
}

/**
 * Check if configuration is valid
 */
export function isConfigValid(): boolean {
  return validateConfig().length === 0
}

// Default config instance for convenience
export const config = loadConfig()

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HCG_API_URL: string
  readonly VITE_HCG_WS_URL: string
  readonly VITE_HCG_TIMEOUT: string
  readonly VITE_SOPHIA_API_URL: string
  readonly VITE_SOPHIA_API_KEY: string
  readonly VITE_SOPHIA_TIMEOUT: string
  readonly VITE_HERMES_API_URL: string
  readonly VITE_HERMES_API_KEY: string
  readonly VITE_HERMES_TIMEOUT: string
  readonly VITE_HERMES_LLM_PROVIDER: string
  readonly VITE_HERMES_LLM_MODEL: string
  readonly VITE_HERMES_LLM_TEMPERATURE: string
  readonly VITE_HERMES_LLM_MAX_TOKENS: string
  readonly VITE_HERMES_SYSTEM_PROMPT: string
  readonly VITE_APP_VERSION: string
  readonly VITE_ENABLE_CHAT: string
  readonly VITE_ENABLE_DIAGNOSTICS: string
  readonly VITE_MOCK_DATA_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

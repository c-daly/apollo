/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOPHIA_API_URL: string
  readonly VITE_SOPHIA_API_KEY: string
  readonly VITE_SOPHIA_TIMEOUT: string
  readonly VITE_HERMES_API_URL: string
  readonly VITE_HERMES_API_KEY: string
  readonly VITE_HERMES_TIMEOUT: string
  readonly VITE_ENABLE_CHAT: string
  readonly VITE_ENABLE_DIAGNOSTICS: string
  readonly VITE_MOCK_DATA_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

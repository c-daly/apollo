import { describe, it, expect } from 'vitest'
import {
  loadConfig,
  getSophiaConfig,
  getHermesConfig,
  getHCGConfig,
  getFeatureFlags,
  validateConfig,
  isConfigValid,
  config,
} from '../lib/config'

describe('Config', () => {
  describe('loadConfig', () => {
    it('should load config from environment', () => {
      const loadedConfig = loadConfig()

      // Config should have proper structure
      expect(loadedConfig).toBeDefined()
      expect(loadedConfig.sophia).toBeDefined()
      expect(loadedConfig.hermes).toBeDefined()
      expect(loadedConfig.hcg).toBeDefined()
      expect(loadedConfig.features).toBeDefined()
    })

    it('should have valid Sophia config', () => {
      const loadedConfig = loadConfig()

      expect(loadedConfig.sophia.baseUrl).toBeDefined()
      expect(typeof loadedConfig.sophia.baseUrl).toBe('string')
      expect(loadedConfig.sophia.timeout).toBeGreaterThan(0)
    })

    it('should have valid Hermes config', () => {
      const loadedConfig = loadConfig()

      expect(loadedConfig.hermes.baseUrl).toBeDefined()
      expect(typeof loadedConfig.hermes.baseUrl).toBe('string')
      expect(loadedConfig.hermes.timeout).toBeGreaterThan(0)
      expect(loadedConfig.hermes.llm).toBeDefined()
    })

    it('should have valid HCG config', () => {
      const loadedConfig = loadConfig()

      expect(loadedConfig.hcg.apiUrl).toBeDefined()
      expect(typeof loadedConfig.hcg.apiUrl).toBe('string')
      expect(typeof loadedConfig.hcg.wsUrl).toBe('string')
      expect(loadedConfig.hcg.timeout).toBeGreaterThan(0)
    })

    it('should have valid feature flags', () => {
      const loadedConfig = loadConfig()

      expect(typeof loadedConfig.features.enableChat).toBe('boolean')
      expect(typeof loadedConfig.features.enableDiagnostics).toBe('boolean')
    })
  })

  describe('getSophiaConfig', () => {
    it('should return Sophia config', () => {
      const sophiaConfig = getSophiaConfig()

      expect(sophiaConfig.baseUrl).toBeDefined()
      expect(typeof sophiaConfig.baseUrl).toBe('string')
      expect(sophiaConfig.timeout).toBeGreaterThan(0)
    })
  })

  describe('getHermesConfig', () => {
    it('should return Hermes config', () => {
      const hermesConfig = getHermesConfig()

      expect(hermesConfig.baseUrl).toBeDefined()
      expect(typeof hermesConfig.baseUrl).toBe('string')
      expect(hermesConfig.timeout).toBeGreaterThan(0)
      expect(hermesConfig.llm).toBeDefined()
    })
  })

  describe('getHCGConfig', () => {
    it('should return HCG config', () => {
      const hcgConfig = getHCGConfig()

      expect(hcgConfig.apiUrl).toBeDefined()
      expect(typeof hcgConfig.apiUrl).toBe('string')
      expect(typeof hcgConfig.wsUrl).toBe('string')
      expect(hcgConfig.timeout).toBeGreaterThan(0)
    })
  })

  describe('getFeatureFlags', () => {
    it('should return feature flags', () => {
      const features = getFeatureFlags()

      expect(typeof features.enableChat).toBe('boolean')
      expect(typeof features.enableDiagnostics).toBe('boolean')
    })
  })

  describe('validateConfig', () => {
    it('should return array of missing config items', () => {
      const missing = validateConfig()

      expect(Array.isArray(missing)).toBe(true)
      // In test environment, we expect valid config to be loaded
    })
  })

  describe('isConfigValid', () => {
    it('should return boolean indicating config validity', () => {
      const valid = isConfigValid()

      expect(typeof valid).toBe('boolean')
    })
  })

  describe('config instance', () => {
    it('should export default config instance', () => {
      expect(config).toBeDefined()
      expect(config.sophia).toBeDefined()
      expect(config.hermes).toBeDefined()
      expect(config.hcg).toBeDefined()
      expect(config.features).toBeDefined()
    })

    it('should have consistent values with loadConfig', () => {
      const freshConfig = loadConfig()

      expect(config.sophia.baseUrl).toBe(freshConfig.sophia.baseUrl)
      expect(config.hermes.baseUrl).toBe(freshConfig.hermes.baseUrl)
      expect(config.hcg.apiUrl).toBe(freshConfig.hcg.apiUrl)
    })
  })

  describe('timeout parsing', () => {
    it('should have positive timeout values', () => {
      const loadedConfig = loadConfig()

      expect(loadedConfig.sophia.timeout).toBeGreaterThan(0)
      expect(loadedConfig.hermes.timeout).toBeGreaterThan(0)
      expect(loadedConfig.hcg.timeout).toBeGreaterThan(0)
    })

    it('should use reasonable default timeouts', () => {
      const loadedConfig = loadConfig()

      // Timeouts should be at least 1 second
      expect(loadedConfig.sophia.timeout).toBeGreaterThanOrEqual(1000)
      expect(loadedConfig.hermes.timeout).toBeGreaterThanOrEqual(1000)
      expect(loadedConfig.hcg.timeout).toBeGreaterThanOrEqual(1000)
    })
  })
})

/**
 * Vitest setup file for React component tests.
 * Provides global test utilities and mocks.
 */

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Mock fetch globally
globalThis.fetch = vi.fn()

// Helper to reset fetch mock between tests
export const resetFetchMock = () => {
  vi.mocked(fetch).mockReset()
}

// Helper to mock successful fetch response
export const mockFetchSuccess = (data: any, status = 200) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    statusText: 'OK',
  } as Response)
}

// Helper to mock fetch error
export const mockFetchError = (message: string, status = 500) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ detail: message }),
    text: async () => JSON.stringify({ detail: message }),
    statusText: message,
  } as Response)
}

// Mock WebSocket globally
class MockWebSocket {
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  readyState: number = 0

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = 1 // OPEN
      this.onopen?.(new Event('open'))
    }, 0)
  }

  send(_data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3 // CLOSED
    this.onclose?.(new CloseEvent('close'))
  }
}

globalThis.WebSocket = MockWebSocket as any

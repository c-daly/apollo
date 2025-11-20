/**
 * Mock data service for serving CWMState fixtures
 * 
 * Provides an in-memory mock service that simulates streaming CWMState data
 * and JEPA outputs. Can be toggled between live and mock modes.
 */

import type {
  CWMStateStream,
  CWMEnvelope,
  CWMActionPayload,
  CWMGoalPayload,
  CWMEventPayload,
  JEPAOutput,
} from './cwm-types'

import {
  mockCWMStateStream,
  mockCWMStateStreamShort,
  mockCWMStateStreamFailures,
} from './cwm-fixtures'

export type MockDataMode = 'live' | 'mock'

export interface MockServiceConfig {
  mode: MockDataMode
  streamDelay?: number // Delay between records in ms (default: 100)
  randomize?: boolean // Add random jitter to timing (default: false)
}

/**
 * Mock CWMState data service
 */
export class MockCWMStateService {
  private config: Required<MockServiceConfig>
  private currentStream: CWMStateStream | null = null
  private streamPosition = 0
  private subscribers: Set<
    (
      record: CWMEnvelope<
        CWMActionPayload | CWMGoalPayload | CWMEventPayload
      > | null,
    ) => void
  > = new Set()

  constructor(config: MockServiceConfig) {
    this.config = {
      mode: config.mode,
      streamDelay: config.streamDelay ?? 100,
      randomize: config.randomize ?? false,
    }
  }

  /**
   * Get current mode
   */
  getMode(): MockDataMode {
    return this.config.mode
  }

  /**
   * Set mode (live or mock)
   */
  setMode(mode: MockDataMode): void {
    this.config.mode = mode
    if (mode === 'mock') {
      this.loadDefaultStream()
    } else {
      this.stopStream()
    }
  }

  /**
   * Load a specific fixture stream
   */
  loadStream(stream: CWMStateStream): void {
    this.currentStream = stream
    this.streamPosition = 0
  }

  /**
   * Load default fixture stream
   */
  loadDefaultStream(): void {
    this.loadStream(mockCWMStateStream)
  }

  /**
   * Get full stream (for testing/debugging)
   */
  getFullStream(streamType: 'default' | 'short' | 'failures' = 'default'): CWMStateStream {
    switch (streamType) {
      case 'short':
        return mockCWMStateStreamShort
      case 'failures':
        return mockCWMStateStreamFailures
      default:
        return mockCWMStateStream
    }
  }

  /**
   * Get next record from stream
   */
  getNextRecord(): CWMEnvelope<CWMActionPayload | CWMGoalPayload | CWMEventPayload> | null {
    if (this.config.mode === 'live' || !this.currentStream) {
      return null
    }

    if (this.streamPosition >= this.currentStream.records.length) {
      return null
    }

    return this.currentStream.records[this.streamPosition++]
  }

  /**
   * Get records by type
   */
  getRecordsByType(
    recordType: 'CWM-A' | 'CWM-G' | 'CWM-E',
  ): Array<CWMEnvelope<CWMActionPayload | CWMGoalPayload | CWMEventPayload>> {
    if (this.config.mode === 'live' || !this.currentStream) {
      return []
    }

    return this.currentStream.records.filter((r) => r.record_type === recordType)
  }

  /**
   * Get JEPA outputs
   */
  getJEPAOutputs(): JEPAOutput[] {
    if (this.config.mode === 'live' || !this.currentStream) {
      return []
    }

    return this.currentStream.jepa_outputs || []
  }

  /**
   * Subscribe to stream updates (for real-time streaming)
   */
  subscribe(
    callback: (
      record: CWMEnvelope<
        CWMActionPayload | CWMGoalPayload | CWMEventPayload
      > | null,
    ) => void,
  ): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Start streaming records to subscribers
   */
  startStream(): void {
    if (this.config.mode === 'live' || !this.currentStream) {
      return
    }

    this.streamPosition = 0
    this.streamRecords()
  }

  /**
   * Stop streaming
   */
  stopStream(): void {
    this.streamPosition = 0
  }

  /**
   * Reset stream to beginning
   */
  resetStream(): void {
    this.streamPosition = 0
  }

  /**
   * Internal method to stream records
   */
  private streamRecords(): void {
    if (
      this.config.mode === 'live' ||
      !this.currentStream ||
      this.streamPosition >= this.currentStream.records.length
    ) {
      // Stream complete, notify subscribers
      this.subscribers.forEach((callback) => callback(null))
      return
    }

    const record = this.currentStream.records[this.streamPosition++]
    this.subscribers.forEach((callback) => callback(record))

    // Schedule next record
    const delay = this.config.randomize
      ? this.config.streamDelay * (0.8 + Math.random() * 0.4)
      : this.config.streamDelay

    setTimeout(() => this.streamRecords(), delay)
  }

  /**
   * Get stream statistics
   */
  getStreamStats(): {
    mode: MockDataMode
    streamId: string | null
    totalRecords: number
    currentPosition: number
    recordCounts: { actions: number; goals: number; events: number }
  } {
    return {
      mode: this.config.mode,
      streamId: this.currentStream?.stream_id || null,
      totalRecords: this.currentStream?.metadata.total_records || 0,
      currentPosition: this.streamPosition,
      recordCounts: this.currentStream?.metadata.record_counts || {
        actions: 0,
        goals: 0,
        events: 0,
      },
    }
  }
}

/**
 * Default mock service instance
 */
export const mockCWMStateService = new MockCWMStateService({
  mode: import.meta.env.VITE_MOCK_DATA_MODE === 'true' ? 'mock' : 'live',
  streamDelay: 100,
  randomize: false,
})

/**
 * Utility function to check if mock mode is enabled
 */
export const isMockMode = (): boolean => {
  return mockCWMStateService.getMode() === 'mock'
}

/**
 * Utility function to toggle between modes
 */
export const toggleMockMode = (): MockDataMode => {
  const newMode = mockCWMStateService.getMode() === 'live' ? 'mock' : 'live'
  mockCWMStateService.setMode(newMode)
  return newMode
}

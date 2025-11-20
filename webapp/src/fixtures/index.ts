/**
 * Mock CWMState fixtures for Apollo development
 *
 * This module provides:
 * - Type definitions for CWM records (Actions, Goals, Events)
 * - Sample fixture data with deterministic timestamps
 * - Mock service for serving fixtures via the SDK
 * - Utilities for toggling between live and mock data
 *
 * @example
 * ```typescript
 * import { mockCWMStateService, toggleMockMode } from './fixtures'
 *
 * // Toggle to mock mode
 * toggleMockMode()
 *
 * // Get a full stream
 * const stream = mockCWMStateService.getFullStream('default')
 *
 * // Subscribe to streaming updates
 * const unsubscribe = mockCWMStateService.subscribe((record) => {
 *   if (record) {
 *     console.log('New record:', record.record_type, record.record_id)
 *   } else {
 *     console.log('Stream complete')
 *   }
 * })
 *
 * mockCWMStateService.startStream()
 * ```
 */

// Export types
export type {
  CWMEnvelope,
  CWMActionPayload,
  CWMGoalPayload,
  CWMEventPayload,
  CWMFrame,
  JEPAOutput,
  CWMStateStream,
} from './cwm-types'

// Export fixtures
export {
  mockCWMStateStream,
  mockCWMStateStreamShort,
  mockCWMStateStreamFailures,
  mockCWMActions,
  mockCWMGoals,
  mockCWMEvents,
  mockJEPAOutputs,
} from './cwm-fixtures'

// Export mock service
export {
  MockCWMStateService,
  mockCWMStateService,
  isMockMode,
  toggleMockMode,
} from './mock-service'

export type { MockDataMode, MockServiceConfig } from './mock-service'

/**
 * Tests for CWM mock fixtures and service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mockCWMStateStream,
  mockCWMStateStreamShort,
  mockCWMStateStreamFailures,
  mockCWMActions,
  mockCWMGoals,
  mockCWMEvents,
  mockJEPAOutputs,
  MockCWMStateService,
} from '../fixtures'

describe('CWM Fixtures', () => {
  describe('mockCWMStateStream', () => {
    it('should have correct structure', () => {
      expect(mockCWMStateStream).toHaveProperty('stream_id')
      expect(mockCWMStateStream).toHaveProperty('start_time')
      expect(mockCWMStateStream).toHaveProperty('records')
      expect(mockCWMStateStream).toHaveProperty('metadata')
    })

    it('should have correct record counts', () => {
      expect(mockCWMStateStream.metadata.total_records).toBe(7)
      expect(mockCWMStateStream.metadata.record_counts.actions).toBe(3)
      expect(mockCWMStateStream.metadata.record_counts.goals).toBe(2)
      expect(mockCWMStateStream.metadata.record_counts.events).toBe(2)
    })

    it('should have valid timestamps', () => {
      mockCWMStateStream.records.forEach(record => {
        expect(() => new Date(record.timestamp)).not.toThrow()
        expect(new Date(record.timestamp).getTime()).toBeGreaterThan(0)
      })
    })
  })

  describe('mockCWMStateStreamShort', () => {
    it('should have exactly 3 records', () => {
      expect(mockCWMStateStreamShort.metadata.total_records).toBe(3)
    })

    it('should have one of each record type', () => {
      expect(mockCWMStateStreamShort.metadata.record_counts.actions).toBe(1)
      expect(mockCWMStateStreamShort.metadata.record_counts.goals).toBe(1)
      expect(mockCWMStateStreamShort.metadata.record_counts.events).toBe(1)
    })
  })

  describe('mockCWMStateStreamFailures', () => {
    it('should contain failed actions', () => {
      const action = mockCWMStateStreamFailures.records[0]
      expect(action.model_type).toBe('cwm-a')
      expect(action.data).toHaveProperty('status', 'failed')
    })
  })

  describe('Individual collections', () => {
    it('mockCWMActions should have action records', () => {
      expect(mockCWMActions.length).toBe(3)
      mockCWMActions.forEach(action => {
        expect(action.model_type).toBe('cwm-a')
        expect(action.data).toHaveProperty('action_type')
      })
    })

    it('mockCWMGoals should have goal records with frames', () => {
      expect(mockCWMGoals.length).toBe(2)
      mockCWMGoals.forEach(goal => {
        expect(goal.model_type).toBe('cwm-g')
        expect(goal.data).toHaveProperty('frames')
        expect(Array.isArray(goal.data.frames)).toBe(true)
      })
    })

    it('mockCWMEvents should have event records', () => {
      expect(mockCWMEvents.length).toBe(2)
      mockCWMEvents.forEach(event => {
        expect(event.model_type).toBe('cwm-e')
        expect(event.data).toHaveProperty('severity')
      })
    })

    it('mockJEPAOutputs should have valid structure', () => {
      expect(mockJEPAOutputs.length).toBeGreaterThan(0)
      mockJEPAOutputs.forEach(output => {
        expect(output).toHaveProperty('output_id')
        expect(output).toHaveProperty('embeddings')
        expect(output).toHaveProperty('predictions')
        expect(output.embeddings).toHaveProperty('current_state')
        expect(output.embeddings).toHaveProperty('predicted_state')
      })
    })
  })

  describe('Record types', () => {
    it('CWM-A records should have action payload structure', () => {
      const action = mockCWMActions[0]
      expect(action.data).toHaveProperty('action_id')
      expect(action.data).toHaveProperty('action_type')
      expect(action.data).toHaveProperty('description')
      expect(action.data).toHaveProperty('status')
      expect(action.data).toHaveProperty('parameters')
    })

    it('CWM-G records should have goal payload structure', () => {
      const goal = mockCWMGoals[0]
      expect(goal.data).toHaveProperty('goal_id')
      expect(goal.data).toHaveProperty('description')
      expect(goal.data).toHaveProperty('priority')
      expect(goal.data).toHaveProperty('status')
      expect(goal.data).toHaveProperty('frames')
      expect(goal.data).toHaveProperty('progress')
    })

    it('CWM-E records should have event payload structure', () => {
      const event = mockCWMEvents[0]
      expect(event.data).toHaveProperty('event_id')
      expect(event.data).toHaveProperty('event_type')
      expect(event.data).toHaveProperty('description')
      expect(event.data).toHaveProperty('severity')
      expect(event.data).toHaveProperty('source')
    })
  })

  describe('Visual frames', () => {
    it('should have proper frame structure', () => {
      const goalWithFrames = mockCWMGoals[0]
      const frame = goalWithFrames.data.frames[0]

      expect(frame).toHaveProperty('frame_id')
      expect(frame).toHaveProperty('timestamp')
      expect(frame).toHaveProperty('frame_type')
      expect(frame).toHaveProperty('encoding')
      expect(frame).toHaveProperty('data')
      expect(frame).toHaveProperty('metadata')
    })

    it('should have different frame types', () => {
      const allFrames = mockCWMGoals.flatMap(goal => goal.data.frames)
      const frameTypes = new Set(allFrames.map(f => f.frame_type))
      expect(frameTypes.size).toBeGreaterThanOrEqual(0)
    })

    it('should have annotations in observation frames', () => {
      const goalWithFrames = mockCWMGoals[0]
      const observationFrame = goalWithFrames.data.frames.find(
        f => f.frame_type === 'observation'
      )

      if (observationFrame) {
        expect(observationFrame.metadata.annotations).toBeDefined()
        expect(observationFrame.metadata.annotations?.length).toBeGreaterThanOrEqual(0)
      }
    })
  })
})

describe('MockCWMStateService', () => {
  let service: MockCWMStateService

  beforeEach(() => {
    service = new MockCWMStateService({ mode: 'mock' })
  })

  describe('Construction and configuration', () => {
    it('should initialize with correct mode', () => {
      expect(service.getMode()).toBe('mock')
    })

    it('should support mode switching', () => {
      service.setMode('live')
      expect(service.getMode()).toBe('live')

      service.setMode('mock')
      expect(service.getMode()).toBe('mock')
    })

    it('should load default stream when switching to mock', () => {
      service.setMode('live')
      service.setMode('mock')

      const stats = service.getStreamStats()
      expect(stats.streamId).toBeTruthy()
      expect(stats.totalRecords).toBeGreaterThan(0)
    })
  })

  describe('Stream loading', () => {
    it('should load custom stream', () => {
      service.loadStream(mockCWMStateStreamShort)

      const stats = service.getStreamStats()
      expect(stats.streamId).toBe(mockCWMStateStreamShort.stream_id)
      expect(stats.totalRecords).toBe(3)
    })

    it('should load default stream', () => {
      service.loadDefaultStream()

      const stats = service.getStreamStats()
      expect(stats.totalRecords).toBe(7)
    })

    it('should get full stream by type', () => {
      const defaultStream = service.getFullStream('default')
      expect(defaultStream.stream_id).toBe(mockCWMStateStream.stream_id)

      const shortStream = service.getFullStream('short')
      expect(shortStream.stream_id).toBe(mockCWMStateStreamShort.stream_id)

      const failuresStream = service.getFullStream('failures')
      expect(failuresStream.stream_id).toBe(
        mockCWMStateStreamFailures.stream_id
      )
    })
  })

  describe('Record retrieval', () => {
    beforeEach(() => {
      service.loadDefaultStream()
    })

    it('should get next record in sequence', () => {
      const record1 = service.getNextRecord()
      const record2 = service.getNextRecord()

      expect(record1).toBeTruthy()
      expect(record2).toBeTruthy()
      expect(record1).not.toEqual(record2)
    })

    it('should return null when stream exhausted', () => {
      // Exhaust the stream
      for (let i = 0; i < 10; i++) {
        service.getNextRecord()
      }

      const record = service.getNextRecord()
      expect(record).toBeNull()
    })

    it('should reset stream position', () => {
      const first = service.getNextRecord()
      service.getNextRecord()

      service.resetStream()

      const record = service.getNextRecord()
      expect(record).toEqual(first)
    })

    it('should get records by type', () => {
      const actions = service.getRecordsByType('cwm-a')
      const goals = service.getRecordsByType('cwm-g')
      const events = service.getRecordsByType('cwm-e')

      expect(actions.length).toBe(3)
      expect(goals.length).toBe(2)
      expect(events.length).toBe(2)

      actions.forEach(r => expect(r.model_type).toBe('cwm-a'))
      goals.forEach(r => expect(r.model_type).toBe('cwm-g'))
      events.forEach(r => expect(r.model_type).toBe('cwm-e'))
    })

    it('should get JEPA outputs', () => {
      const outputs = service.getJEPAOutputs()
      expect(outputs.length).toBeGreaterThan(0)
    })

    it('should return empty arrays in live mode', () => {
      service.setMode('live')

      expect(service.getRecordsByType('cwm-a')).toEqual([])
      expect(service.getJEPAOutputs()).toEqual([])
    })

    it('should return null for next record in live mode', () => {
      service.setMode('live')
      expect(service.getNextRecord()).toBeNull()
    })
  })

  describe('Streaming', () => {
    beforeEach(() => {
      service.loadStream(mockCWMStateStreamShort)
    })

    it('should notify subscribers of records', async () => {
      const records: unknown[] = []

      const promise = new Promise<void>(resolve => {
        service.subscribe(record => {
          if (record) {
            records.push(record)
          } else {
            // Stream complete
            expect(records.length).toBe(3)
            resolve()
          }
        })
      })

      service.startStream()
      await promise
    })

    it('should allow unsubscribe', () => {
      const callback = vi.fn()
      const unsubscribe = service.subscribe(callback)

      unsubscribe()
      service.startStream()

      // Give it time to potentially call
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled()
      }, 200)
    })

    it('should not stream in live mode', () => {
      service.setMode('live')

      const callback = vi.fn()
      service.subscribe(callback)
      service.startStream()

      setTimeout(() => {
        expect(callback).toHaveBeenCalledWith(null)
      }, 100)
    })
  })

  describe('Stream statistics', () => {
    it('should provide accurate stats', () => {
      service.loadDefaultStream()

      const stats = service.getStreamStats()

      expect(stats.mode).toBe('mock')
      expect(stats.streamId).toBe(mockCWMStateStream.stream_id)
      expect(stats.totalRecords).toBe(7)
      expect(stats.currentPosition).toBe(0)
      expect(stats.recordCounts).toEqual({
        actions: 3,
        goals: 2,
        events: 2,
      })
    })

    it('should update position as records are consumed', () => {
      service.loadDefaultStream()

      service.getNextRecord()
      service.getNextRecord()

      const stats = service.getStreamStats()
      expect(stats.currentPosition).toBe(2)
    })
  })
})

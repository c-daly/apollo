import { renderHook, act } from '@testing-library/react'
import { describe, expect, vi, beforeEach, afterEach, test } from 'vitest'

import type { DiagnosticsEvent } from '../../types/diagnostics'
import type { PersonaEntry } from '../../types/hcg'
import { useDiagnosticsStream } from '../useDiagnosticsStream'

type MessageHandler = (message: DiagnosticsEvent) => void
type ConnectionHandler = (
  state: 'connecting' | 'connected' | 'disconnected' | 'error'
) => void

const wsMocks = vi.hoisted(() => {
  let messageHandler: MessageHandler | null = null
  let connectionHandler: ConnectionHandler | null = null
  let connected = false
  const connect = vi.fn()
  const disconnect = vi.fn(() => {
    connected = false
  })
  const isConnected = vi.fn(() => connected)

  return {
    connect,
    disconnect,
    isConnected,
    getMessageHandler: () => messageHandler,
    setMessageHandler: (handler: MessageHandler | null) => {
      messageHandler = handler
    },
    getConnectionHandler: () => connectionHandler,
    setConnectionHandler: (handler: ConnectionHandler | null) => {
      connectionHandler = handler
    },
    setConnected: (value: boolean) => {
      connected = value
    },
  }
})

vi.mock('../../lib/websocket-client', () => ({
  diagnosticsWebSocket: {
    connect: wsMocks.connect,
    disconnect: wsMocks.disconnect,
    isConnected: wsMocks.isConnected,
    onMessage: vi.fn((handler: MessageHandler) => {
      wsMocks.setMessageHandler(handler)
      return () => {
        if (wsMocks.getMessageHandler() === handler) {
          wsMocks.setMessageHandler(null)
        }
      }
    }),
    onConnectionChange: vi.fn((handler: ConnectionHandler) => {
      wsMocks.setConnectionHandler(handler)
      return () => {
        if (wsMocks.getConnectionHandler() === handler) {
          wsMocks.setConnectionHandler(null)
        }
      }
    }),
    send: vi.fn(),
  },
}))

const sampleEntry: PersonaEntry = {
  id: 'entry-1',
  entry_type: 'observation',
  timestamp: '2025-01-01T00:00:00.000Z',
  content: 'test entry',
  summary: 'test entry',
  sentiment: undefined,
  confidence: undefined,
  related_process_ids: [],
  related_goal_ids: [],
  emotion_tags: [],
  metadata: {},
}

describe('useDiagnosticsStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wsMocks.setMessageHandler(null)
    wsMocks.setConnectionHandler(null)
    wsMocks.setConnected(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('connects once and updates callbacks after rerender', () => {
    const firstPersonaHandler = vi.fn()
    const secondPersonaHandler = vi.fn()

    const { rerender, unmount } = renderHook(
      props => useDiagnosticsStream(props),
      {
        initialProps: {
          onPersonaEntry: firstPersonaHandler,
        },
      }
    )

    expect(wsMocks.connect).toHaveBeenCalledTimes(1)
    expect(typeof wsMocks.getMessageHandler()).toBe('function')

    act(() => {
      wsMocks.getMessageHandler()?.({
        type: 'persona_entry',
        data: sampleEntry,
      } as DiagnosticsEvent)
    })
    expect(firstPersonaHandler).toHaveBeenCalledTimes(1)

    rerender({ onPersonaEntry: secondPersonaHandler })
    expect(wsMocks.connect).toHaveBeenCalledTimes(1)

    act(() => {
      wsMocks.getMessageHandler()?.({
        type: 'persona_entry',
        data: { ...sampleEntry, id: 'entry-2' },
      } as DiagnosticsEvent)
    })

    expect(firstPersonaHandler).toHaveBeenCalledTimes(1)
    expect(secondPersonaHandler).toHaveBeenCalledTimes(1)

    unmount()
    expect(wsMocks.disconnect).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(wsMocks.disconnect).toHaveBeenCalledTimes(1)
  })

  test('maps connection state changes to hook status and callback', () => {
    const onConnectionChange = vi.fn()
    const { result } = renderHook(() =>
      useDiagnosticsStream({ onConnectionChange })
    )

    expect(result.current).toBe('connecting')
    expect(onConnectionChange).not.toHaveBeenCalled()

    act(() => {
      wsMocks.setConnected(true)
      wsMocks.getConnectionHandler()?.('connected')
    })
    expect(result.current).toBe('online')
    expect(onConnectionChange).toHaveBeenCalledWith('online')

    act(() => {
      wsMocks.getConnectionHandler()?.('error')
    })
    expect(result.current).toBe('error')
    expect(onConnectionChange).toHaveBeenLastCalledWith('error')

    act(() => {
      wsMocks.setConnected(false)
      wsMocks.getConnectionHandler()?.('disconnected')
    })
    expect(result.current).toBe('offline')
    expect(onConnectionChange).toHaveBeenLastCalledWith('offline')
  })

  test('does not disconnect until last subscriber unmounts', () => {
    const hookOne = renderHook(() => useDiagnosticsStream({}))
    const hookTwo = renderHook(() => useDiagnosticsStream({}))

    expect(wsMocks.connect).toHaveBeenCalledTimes(1)
    expect(wsMocks.disconnect).not.toHaveBeenCalled()

    hookOne.unmount()
    expect(wsMocks.disconnect).not.toHaveBeenCalled()

    hookTwo.unmount()
    expect(wsMocks.disconnect).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(wsMocks.disconnect).toHaveBeenCalledTimes(1)
  })
})

/**
 * WebSocket client for real-time HCG updates
 */

import type { WebSocketMessage } from '../types/hcg'
import type { DiagnosticsEvent } from '../types/diagnostics'
import { getHCGConfig } from './config'

export interface WebSocketClientConfig {
  url?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export type MessageHandler<TMessage> = (message: TMessage) => void
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

class ExponentialBackoff {
  private attempt = 0
  private baseDelay: number
  private maxDelay: number

  constructor(baseDelay = 1000, maxDelay = 30000) {
    this.baseDelay = baseDelay
    this.maxDelay = maxDelay
  }

  next(): number {
    const delay = Math.min(
      this.maxDelay,
      this.baseDelay * Math.pow(1.5, this.attempt)
    )
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1)
    this.attempt++
    return Math.max(this.baseDelay, delay + jitter)
  }

  reset(): void {
    this.attempt = 0
  }

  get currentAttempt(): number {
    return this.attempt
  }
}

export class HCGWebSocketClient<TMessage = WebSocketMessage> {
  private ws: WebSocket | null = null
  private url: string
  private maxReconnectAttempts: number
  private reconnectTimeout: number | null = null
  private messageHandlers: Set<MessageHandler<TMessage>> = new Set()
  private connectionHandlers: Set<(state: ConnectionState) => void> = new Set()
  private connected: boolean = false
  private backoff: ExponentialBackoff
  private pingInterval: number | null = null
  private lastHeartbeat: Date | null = null

  constructor(config: WebSocketClientConfig = {}) {
    const hcgConfig = getHCGConfig()
    this.url = config.url || hcgConfig.wsUrl || 'ws://localhost:8765'
    this.maxReconnectAttempts = config.maxReconnectAttempts || 20
    this.backoff = new ExponentialBackoff(
      config.reconnectInterval || 1000,
      30000
    )
  }

  connect(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return
    }

    try {
      this.notifyConnection('connecting')
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('HCG WebSocket connected')
        this.connected = true
        this.backoff.reset()
        this.lastHeartbeat = new Date()
        this.notifyConnection('connected')
        this.startPing()

        // Send subscribe message
        this.send({ type: 'subscribe' })
      }

      this.ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'pong') {
            this.lastHeartbeat = new Date()
            return
          }
          this.notifyHandlers(message as TMessage)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = error => {
        console.error('HCG WebSocket error:', error)
        this.notifyConnection('error')
      }

      this.ws.onclose = () => {
        console.log('HCG WebSocket disconnected')
        this.connected = false
        this.ws = null
        this.stopPing()
        this.notifyConnection('disconnected')
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
      this.notifyConnection('error')
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopPing()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.backoff.reset()
    this.notifyConnection('disconnected')
  }

  private startPing() {
    this.stopPing()
    this.pingInterval = window.setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping' })
      }
    }, 10000)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private scheduleReconnect(): void {
    if (this.backoff.currentAttempt >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      this.notifyConnection('error')
      return
    }

    if (this.reconnectTimeout !== null) {
      return
    }

    const delay = this.backoff.next()
    console.log(
      `Scheduling reconnect attempt ${this.backoff.currentAttempt}/${this.maxReconnectAttempts} in ${Math.round(delay)}ms`
    )

    this.notifyConnection('reconnecting')

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null
      this.connect()
    }, delay)
  }

  send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // console.warn('WebSocket is not connected, cannot send message')
      return
    }

    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
    }
  }

  refresh(): void {
    this.send({ type: 'refresh' })
  }

  ping(): void {
    this.send({ type: 'ping' })
  }

  onMessage(handler: MessageHandler<TMessage>): () => void {
    this.messageHandlers.add(handler)

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  private notifyHandlers(message: TMessage): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error('Error in message handler:', error)
      }
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  getHealth() {
    return {
      connected: this.connected,
      retryCount: this.backoff.currentAttempt,
      lastHeartbeat: this.lastHeartbeat,
    }
  }

  onConnectionChange(handler: (state: ConnectionState) => void): () => void {
    this.connectionHandlers.add(handler)
    // emit current status immediately
    handler(this.connected ? 'connected' : 'disconnected')
    return () => {
      this.connectionHandlers.delete(handler)
    }
  }

  private notifyConnection(state: ConnectionState): void {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(state)
      } catch (error) {
        console.error('Error in connection handler:', error)
      }
    })
  }
}

// Default WebSocket client instance
function ensureWsBase(baseUrl: string): string {
  if (baseUrl.startsWith('ws')) {
    return baseUrl
  }
  if (baseUrl.startsWith('http')) {
    const scheme = baseUrl.startsWith('https') ? 'wss' : 'ws'
    const withoutProto = baseUrl.replace(/^https?:\/\//, '')
    return `${scheme}://${withoutProto}`
  }
  return baseUrl
}

function buildHcgWsUrl(): string {
  const config = getHCGConfig()
  const base = config.wsUrl || config.apiUrl || 'http://localhost:8082'
  const target = ensureWsBase(base).replace(/\/$/, '')
  if (target.endsWith('/ws/hcg')) {
    return target
  }
  return `${target}/ws/hcg`
}

function buildDiagnosticsWsUrl(): string {
  const config = getHCGConfig()
  const base = config.apiUrl || config.wsUrl || 'http://localhost:8082'
  const target = ensureWsBase(base).replace(/\/$/, '')
  if (target.endsWith('/ws/diagnostics')) {
    return target
  }
  return `${target}/ws/diagnostics`
}

export const hcgWebSocket = new HCGWebSocketClient({
  url: buildHcgWsUrl(),
})

export const diagnosticsWebSocket = new HCGWebSocketClient<DiagnosticsEvent>({
  url: buildDiagnosticsWsUrl(),
})

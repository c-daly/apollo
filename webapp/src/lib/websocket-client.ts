/**
 * WebSocket client for real-time HCG updates
 */

import type { WebSocketMessage } from '../types/hcg'
import { getHCGConfig } from './config'

export interface WebSocketClientConfig {
  url?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export type MessageHandler = (message: WebSocketMessage) => void

export class HCGWebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private reconnectAttempts: number = 0
  private reconnectTimeout: number | null = null
  private messageHandlers: Set<MessageHandler> = new Set()
  private connected: boolean = false

  constructor(config: WebSocketClientConfig = {}) {
    const hcgConfig = getHCGConfig()
    this.url = config.url || hcgConfig.wsUrl || 'ws://localhost:8765'
    this.reconnectInterval = config.reconnectInterval || 3000
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10
  }

  connect(): void {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('HCG WebSocket connected')
        this.connected = true
        this.reconnectAttempts = 0

        // Send subscribe message
        this.send({ type: 'subscribe' })
      }

      this.ws.onmessage = event => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          this.notifyHandlers(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = error => {
        console.error('HCG WebSocket error:', error)
      }

      this.ws.onclose = () => {
        console.log('HCG WebSocket disconnected')
        this.connected = false
        this.ws = null
        this.scheduleReconnect()
      }
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
      this.scheduleReconnect()
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.reconnectAttempts = 0
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached')
      return
    }

    if (this.reconnectTimeout !== null) {
      return
    }

    this.reconnectAttempts++
    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
    )

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null
      this.connect()
    }, this.reconnectInterval)
  }

  send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected, cannot send message')
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

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  private notifyHandlers(message: WebSocketMessage): void {
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

export const diagnosticsWebSocket = new HCGWebSocketClient({
  url: buildDiagnosticsWsUrl(),
})

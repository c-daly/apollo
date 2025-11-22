import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react'
import { hermesClient, type LLMResponse } from '../lib/hermes-client'
import {
  buildHermesRequest,
  summarizeHermesResponse,
  DEFAULT_SYSTEM_PROMPT,
  type ChatHistoryMessage,
} from '../lib/chat-llm'
import { getHermesConfig, type HermesLLMConfig } from '../lib/config'
import { sendLLMTelemetry } from '../lib/diagnostics-client'
import { hcgClient } from '../lib/hcg-client'
import type { PersonaEntry } from '../types/hcg'
import './ChatPanel.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const CHAT_METADATA = {
  surface: 'apollo-webapp.chat-panel',
  version: import.meta.env.VITE_APP_VERSION ?? 'dev',
}

const MAX_HISTORY = 12
const PERSONA_CONTEXT_LIMIT = 5

function ChatPanel() {
  const hermesConfig = useMemo(() => getHermesConfig(), [])
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Hello! I'm Apollo, connected to the Hermes LLM gateway. Ask me to summarize state, translate commands, or reason about plans.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const startedAt = performance.now()
      const conversationHistory: ChatHistoryMessage[] = [...messages, userMessage]
        .filter((msg): msg is Message => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          role: msg.role,
          content: msg.content,
        }))

      const { systemPrompt, ...llmOverrides } = hermesConfig.llm
      const personaEntries = await loadPersonaContext(PERSONA_CONTEXT_LIMIT)
      const personaMetadata = buildPersonaMetadata(personaEntries)
      const personaContextBlock =
        typeof personaMetadata['persona_context_block'] === 'string'
          ? (personaMetadata['persona_context_block'] as string)
          : undefined

      const metadata = {
        ...buildChatMetadata({
          sessionId: sessionIdRef.current,
          conversationLength: conversationHistory.length,
          llmOverrides,
        }),
        ...personaMetadata,
      }

      const compositeSystemPrompt = [
        systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        personaContextBlock ? `Persona diary context:\n${personaContextBlock}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n')

      const hermesRequest = buildHermesRequest(conversationHistory, {
        metadata,
        maxHistory: MAX_HISTORY,
        systemPrompt: compositeSystemPrompt,
        overrides: llmOverrides,
      })

      const response = await hermesClient.llmGenerate(hermesRequest)

      if (!response.success || !response.data) {
        throw new Error(
          response.error || 'Hermes did not return a completion response.'
        )
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: summarizeHermesResponse(response.data),
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
      setErrorMessage(null)

      const latencyMs = performance.now() - startedAt
      void sendLLMTelemetry(
        buildTelemetryPayload({
          latencyMs,
          response: response.data,
          metadata,
          sessionId: sessionIdRef.current,
        })
      ).catch(err => {
        console.warn('Failed to emit Hermes telemetry', err)
      })
      void persistPersonaEntry({
        userMessage: userMessage.content,
        assistantMessage: assistantMessage.content,
        response: response.data,
        metadata,
      })
    } catch (error) {
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          error instanceof Error
            ? `I wasn't able to reach Hermes: ${error.message}`
            : 'I was unable to reach Hermes due to an unknown error.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, fallbackMessage])
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown Hermes error'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {errorMessage && (
          <div className="chat-status error">
            Unable to reach Hermes: {errorMessage}. Check your API settings.
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-header">
              <span className="message-role">
                {message.role === 'user' ? '👤 You' : '🤖 Apollo'}
              </span>
              <span className="message-time">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{message.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-header">
              <span className="message-role">🤖 Apollo</span>
            </div>
            <div className="message-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a command or question..."
          disabled={isLoading}
        />
        <button
          type="submit"
          className="chat-submit"
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default ChatPanel

function buildChatMetadata({
  sessionId,
  conversationLength,
  llmOverrides,
}: {
  sessionId: string
  conversationLength: number
  llmOverrides: Omit<HermesLLMConfig, 'systemPrompt'>
}): Record<string, unknown> {
  const browserInfo =
    typeof navigator !== 'undefined'
      ? {
          locale: navigator.language,
          user_agent: navigator.userAgent,
        }
      : {}

  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : undefined

  const metadata = {
    ...CHAT_METADATA,
    session_id: sessionId,
    message_count: conversationLength,
    timezone,
    last_user_message_at: new Date().toISOString(),
    hermes_provider_hint: llmOverrides.provider,
    hermes_model_hint: llmOverrides.model,
    ...browserInfo,
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  )
}

function buildTelemetryPayload({
  latencyMs,
  response,
  metadata,
  sessionId,
}: {
  latencyMs: number
  response?: LLMResponse
  metadata: Record<string, unknown>
  sessionId: string
}) {
  const personaRaw = response?.raw as Record<string, unknown> | undefined
  const personaSentiment =
    typeof personaRaw?.persona_sentiment === 'string'
      ? personaRaw?.persona_sentiment
      : typeof (personaRaw as { persona?: { sentiment?: string } })?.persona
            ?.sentiment === 'string'
        ? (personaRaw as { persona?: { sentiment?: string } }).persona?.sentiment
        : undefined
  const personaConfidence =
    typeof personaRaw?.persona_confidence === 'number'
      ? personaRaw?.persona_confidence
      : typeof (personaRaw as { persona?: { confidence?: number } })?.persona
            ?.confidence === 'number'
        ? (personaRaw as { persona?: { confidence?: number } }).persona?.confidence
        : undefined

  return {
    latency_ms: Math.max(0, Math.round(latencyMs)),
    prompt_tokens: response?.usage?.promptTokens,
    completion_tokens: response?.usage?.completionTokens,
    total_tokens: response?.usage?.totalTokens,
    persona_sentiment: personaSentiment,
    persona_confidence: personaConfidence,
    metadata: {
      ...metadata,
      response_id: response?.id,
      hermes_provider: response?.provider,
      hermes_model: response?.model,
      session_id: sessionId,
    },
  }
}

async function loadPersonaContext(limit: number): Promise<PersonaEntry[]> {
  try {
    return await hcgClient.getPersonaEntries({ limit })
  } catch (error) {
    console.warn('Failed to load persona diary entries for context', error)
    return []
  }
}

function buildPersonaMetadata(
  entries: PersonaEntry[]
): Record<string, unknown> {
  if (!entries.length) {
    return {
      persona_context_used: false,
    }
  }

  return {
    persona_context_used: true,
    persona_entry_ids: entries.map(entry => entry.id),
    persona_entry_types: countBy(entries, 'entry_type'),
    persona_sentiments: countBy(entries, 'sentiment'),
    persona_context_block: summarizePersonaEntries(entries),
    persona_context_count: entries.length,
  }
}

function summarizePersonaEntries(entries: PersonaEntry[]): string {
  return entries
    .map(entry => {
      const sentiment = entry.sentiment ? ` (${entry.sentiment})` : ''
      const timestamp = new Date(entry.timestamp).toLocaleString()
      const summary = entry.summary || entry.content
      return `- ${entry.entry_type}${sentiment} @ ${timestamp}: ${summary}`
    })
    .join('\n')
}

function countBy(
  entries: PersonaEntry[],
  key: keyof PersonaEntry
): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    const value = entry[key]
    if (!value) {
      return acc
    }

    const bucket = String(value)
    acc[bucket] = (acc[bucket] ?? 0) + 1
    return acc
  }, {})
}

function truncateSummary(text: string, maxLength = 160): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength).trim()}…`
}

async function persistPersonaEntry({
  userMessage,
  assistantMessage,
  response,
  metadata,
}: {
  userMessage: string
  assistantMessage: string
  response: LLMResponse
  metadata: Record<string, unknown>
}) {
  try {
    await hcgClient.createPersonaEntry({
      entry_type: 'observation',
      content: assistantMessage,
      summary: truncateSummary(userMessage),
      sentiment: undefined,
      confidence: undefined,
      related_process_ids: [],
      related_goal_ids: [],
      emotion_tags: [],
      metadata: {
        ...metadata,
        hermes_response_id: response.id,
        hermes_provider: response.provider,
        hermes_model: response.model,
      },
    })
  } catch (error) {
    console.warn('Failed to persist persona diary entry', error)
  }
}

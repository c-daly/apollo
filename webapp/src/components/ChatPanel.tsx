import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react'
import { DEFAULT_SYSTEM_PROMPT, type ChatHistoryMessage } from '../lib/chat-llm'
import {
  getHermesConfig,
  getHCGConfig,
  type HermesLLMConfig,
} from '../lib/config'
import { sophiaClient } from '../lib/sophia-client'
import type { PersonaEntryFull } from '../lib/sophia-client'
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

const PERSONA_CONTEXT_LIMIT = 5

function ChatPanel() {
  const hermesConfig = useMemo(() => getHermesConfig(), [])
  const apolloApiBase = useMemo(
    () => (getHCGConfig().apiUrl || 'http://localhost:8082').replace(/\/$/, ''),
    []
  )
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
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

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

    let inflightAssistantId: string | null = null
    try {
      const conversationHistory: ChatHistoryMessage[] = [
        ...messages,
        userMessage,
      ]
        .filter(
          (msg): msg is Message =>
            msg.role === 'user' || msg.role === 'assistant'
        )
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
        personaContextBlock
          ? `Persona diary context:\n${personaContextBlock}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n\n')
      const streamingMessages = [
        { role: 'system', content: compositeSystemPrompt },
        ...conversationHistory,
      ]

      const assistantId = `${Date.now()}-assistant`
      const updateAssistantMessage = (content: string) => {
        setMessages(prev =>
          prev.map(message =>
            message.id === assistantId ? { ...message, content } : message
          )
        )
      }
      inflightAssistantId = assistantId
      const placeholder: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, placeholder])

      const controller = new AbortController()
      abortControllerRef.current = controller
      const response = await fetch(`${apolloApiBase}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: streamingMessages,
          metadata,
          provider: llmOverrides.provider,
          model: llmOverrides.model,
          temperature: llmOverrides.temperature,
          max_tokens: llmOverrides.maxTokens,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Failed to open chat stream via Apollo API.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantBuffer = ''
      let streamCompleted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          if (!event.startsWith('data:')) continue
          const payload = event.replace(/^data:\s*/, '')
          if (!payload) continue
          const parsed = JSON.parse(payload) as {
            type: string
            content?: string
            message?: string
          }
          if (parsed.type === 'chunk' && parsed.content) {
            assistantBuffer += parsed.content
            updateAssistantMessage(assistantBuffer)
          } else if (parsed.type === 'end') {
            if (parsed.content) {
              assistantBuffer = parsed.content
              updateAssistantMessage(assistantBuffer)
            }
            streamCompleted = true
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message || 'Hermes streaming error')
          }
        }
      }

      abortControllerRef.current = null
      if (!streamCompleted) {
        throw new Error('Chat stream ended unexpectedly.')
      }
      setErrorMessage(null)
    } catch (error) {
      abortControllerRef.current = null
      if (inflightAssistantId) {
        setMessages(prev =>
          prev.filter(message => message.id !== inflightAssistantId)
        )
      }
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

async function loadPersonaContext(limit: number): Promise<PersonaEntryFull[]> {
  try {
    const response = await sophiaClient.getPersonaEntries({ limit })
    if (!response.success || !response.data) {
      console.warn('Failed to load persona entries:', response.error)
      return []
    }
    return response.data.entries
  } catch (error) {
    console.warn('Failed to load persona diary entries for context', error)
    return []
  }
}

function buildPersonaMetadata(
  entries: PersonaEntryFull[]
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

function summarizePersonaEntries(entries: PersonaEntryFull[]): string {
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
  entries: PersonaEntryFull[],
  key: keyof PersonaEntryFull
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

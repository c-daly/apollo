import { useState, useRef, useEffect, type FormEvent } from 'react'
import { sophiaClient } from '../lib/sophia-client'
import './ChatPanel.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        "Hello! I'm Apollo, your interface to the LOGOS cognitive system. How can I help you today?",
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
      const response = await sophiaClient.sendCommand(userMessage.content)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: formatSophiaResponse(response),
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
      setErrorMessage(null)
    } catch (error) {
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          error instanceof Error
            ? `I wasn't able to reach Sophia: ${error.message}`
            : 'I was unable to reach Sophia due to an unknown error.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, fallbackMessage])
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown Sophia error'
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
            Unable to reach Sophia: {errorMessage}. Check your API settings.
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

function formatSophiaResponse(
  response: Awaited<ReturnType<typeof sophiaClient.sendCommand>>
): string {
  if (response.success && response.data !== undefined) {
    if (typeof response.data === 'string') {
      return response.data
    }
    try {
      return JSON.stringify(response.data, null, 2)
    } catch {
      return String(response.data)
    }
  }

  return (
    response.error ||
    "Sophia couldn't process that command. Please verify the agent is running."
  )
}

export default ChatPanel

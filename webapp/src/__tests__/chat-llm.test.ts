import { describe, expect, it } from 'vitest'
import {
  buildHermesRequest,
  summarizeHermesResponse,
  DEFAULT_SYSTEM_PROMPT,
  type ChatHistoryMessage,
} from '../lib/chat-llm'
import type { LLMResponse } from '../lib/hermes-client'

const sampleHistory: ChatHistoryMessage[] = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: 'hi there' },
  { role: 'user', content: 'plan a route' },
]

describe('chat-llm helpers', () => {
  it('builds a request with trimmed history and default system prompt', () => {
    const request = buildHermesRequest(sampleHistory, { maxHistory: 2 })

    expect(request.messages?.length).toBe(3) // system + last two
    expect(request.messages?.[0]?.content).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(request.prompt).toBe('plan a route')
  })

  it('applies overrides and sanitizes metadata', () => {
    const request = buildHermesRequest(sampleHistory, {
      overrides: { provider: 'echo', model: 'gpt', temperature: 0.2 },
      metadata: {
        surface: 'apollo',
        session_id: 'abc',
        omit_me: undefined,
      },
    })

    expect(request.provider).toBe('echo')
    expect(request.model).toBe('gpt')
    expect(request.temperature).toBe(0.2)
    expect(request.metadata).toEqual({
      surface: 'apollo',
      session_id: 'abc',
    })
  })

  it('summarizes Hermes responses with usage notes', () => {
    const response: LLMResponse = {
      id: 'chatcmpl-1',
      provider: 'echo',
      model: 'echo',
      created: Date.now(),
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Done.' },
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    }

    const summary = summarizeHermesResponse(response)
    expect(summary).toContain('Done.')
    expect(summary).toContain('usage: prompt 10')
  })
})

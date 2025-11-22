import type { LLMRequest, LLMResponse } from './hermes-client'

export type ChatHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type HermesOverrides = Pick<
  LLMRequest,
  'provider' | 'model' | 'temperature' | 'maxTokens'
>

export interface BuildHermesRequestOptions {
  metadata?: Record<string, unknown>
  maxHistory?: number
  systemPrompt?: string
  overrides?: HermesOverrides
}

const DEFAULT_MAX_HISTORY = 12

export const DEFAULT_SYSTEM_PROMPT = [
  'You are the Hermes gateway for the LOGOS project.',
  'Provide concise assistance, reference the Hybrid Causal Graph when relevant,',
  'and assume Apollo will relay actions to Sophia/Talos as needed.',
].join(' ')

export function buildHermesRequest(
  conversation: ChatHistoryMessage[],
  options: BuildHermesRequestOptions = {}
): LLMRequest {
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY
  const trimmed = conversation.slice(-maxHistory)
  const historyMessages = trimmed.map(message => ({
    role: message.role,
    content: message.content,
  }))

  const lastUserMessage = [...trimmed]
    .reverse()
    .find(message => message.role === 'user')

  const request: LLMRequest = {
    prompt: lastUserMessage?.content,
    messages: [
      {
        role: 'system',
        content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      },
      ...historyMessages,
    ],
    metadata: sanitizeMetadata(options.metadata),
  }

  if (options.overrides) {
    const { provider, model, temperature, maxTokens } = options.overrides
    if (provider) request.provider = provider
    if (model) request.model = model
    if (typeof temperature === 'number') request.temperature = temperature
    if (typeof maxTokens === 'number') request.maxTokens = maxTokens
  }

  return request
}

export function summarizeHermesResponse(response?: LLMResponse): string {
  if (!response?.choices?.length) {
    return 'Hermes did not return a completion.'
  }

  const contentSegments = response.choices
    .map(choice => choice.message?.content?.trim())
    .filter(Boolean) as string[]

  const baseContent =
    contentSegments.length > 0
      ? contentSegments.join('\n\n').trim()
      : 'Hermes returned an empty message.'

  const usageNote = formatUsage(response.usage)
  return usageNote ? `${baseContent}\n\n_${usageNote}_` : baseContent
}

function formatUsage(usage: LLMResponse['usage']): string | undefined {
  if (!usage) {
    return undefined
  }

  const parts: string[] = []
  if (typeof usage.promptTokens === 'number') {
    parts.push(`prompt ${usage.promptTokens}`)
  }
  if (typeof usage.completionTokens === 'number') {
    parts.push(`completion ${usage.completionTokens}`)
  }
  if (typeof usage.totalTokens === 'number') {
    parts.push(`total ${usage.totalTokens}`)
  }

  if (!parts.length) {
    return undefined
  }

  return `usage: ${parts.join(' · ')}`
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined
  }

  const filtered = Object.entries(metadata).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  )

  if (!filtered.length) {
    return undefined
  }

  return Object.fromEntries(filtered)
}

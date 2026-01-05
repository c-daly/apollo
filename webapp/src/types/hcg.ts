/**
 * TypeScript types for HCG data models
 * Mirrors Python models from apollo.data.models
 */

export interface Entity {
  id: string
  type: string
  properties: Record<string, unknown>
  labels: string[]
  created_at?: string
  updated_at?: string
}

export interface State {
  id: string
  type: string
  description: string
  variables: Record<string, unknown>
  timestamp: string
  properties: Record<string, unknown>
}

export interface Process {
  id: string
  type: string
  name: string
  description?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  inputs: string[]
  outputs: string[]
  properties: Record<string, unknown>
  created_at: string
  completed_at?: string
}

export interface CausalEdge {
  id: string
  source_id: string
  target_id: string
  edge_type: string
  properties: Record<string, unknown>
  weight: number
  created_at: string
}

export interface PlanHistory {
  id: string
  goal_id: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  steps: Array<Record<string, unknown>>
  created_at: string
  started_at?: string
  completed_at?: string
  result?: Record<string, unknown>
}

export interface StateHistory {
  id: string
  state_id: string
  timestamp: string
  changes: Record<string, unknown>
  previous_values?: Record<string, unknown>
  trigger?: string
}

export interface GraphSnapshot {
  entities: Entity[]
  edges: CausalEdge[]
  timestamp: string
  metadata: Record<string, unknown>
}

export interface PersonaEntry {
  /** @deprecated Use entry_id instead */
  id?: string
  entry_id: string
  timestamp: string
  entry_type: 'belief' | 'decision' | 'observation' | 'reflection'
  content: string
  summary?: string
  trigger?: string
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed'
  confidence?: number
  related_process_ids: string[]
  related_goal_ids: string[]
  emotion_tags: string[]
  metadata: Record<string, unknown>
}

export interface CreatePersonaEntryRequest {
  entry_type: string
  content: string
  summary?: string
  sentiment?: string
  confidence?: number
  related_process_ids?: string[]
  related_goal_ids?: string[]
  emotion_tags?: string[]
  metadata?: Record<string, unknown>
}

export interface WebSocketMessage {
  type: 'snapshot' | 'update' | 'error' | 'pong'
  timestamp?: string
  message?: string
  data?: unknown
}

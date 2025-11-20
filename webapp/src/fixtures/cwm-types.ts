/**
 * Type definitions for Continuous World Model (CWM) State data
 * 
 * CWM tracks three primary record types:
 * - CWM-A: Actions/Activities performed by the agent
 * - CWM-G: Goals with associated visual frames and metadata
 * - CWM-E: Events observed in the environment
 */

/**
 * Unified envelope format for all CWM records
 */
export interface CWMEnvelope<T = unknown> {
  record_type: 'CWM-A' | 'CWM-G' | 'CWM-E'
  record_id: string
  timestamp: string
  sequence_number: number
  payload: T
  metadata: {
    source: string
    version: string
    [key: string]: unknown
  }
}

/**
 * CWM-A: Action record
 * Represents actions or activities performed by the agent
 */
export interface CWMActionPayload {
  action_id: string
  action_type: string
  description: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  parameters: Record<string, unknown>
  started_at?: string
  completed_at?: string
  result?: {
    success: boolean
    output?: unknown
    error?: string
  }
  preconditions?: string[]
  effects?: string[]
}

/**
 * CWM-G: Goal record with visual frames
 * Represents goals with associated visual observations and metadata
 */
export interface CWMGoalPayload {
  goal_id: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'active' | 'suspended' | 'achieved' | 'abandoned'
  frames: CWMFrame[]
  context: {
    location?: string
    actors?: string[]
    related_goals?: string[]
    [key: string]: unknown
  }
  progress: number // 0-100
  created_at: string
  updated_at: string
}

/**
 * Visual frame data for CWM-G records
 */
export interface CWMFrame {
  frame_id: string
  timestamp: string
  frame_type: 'observation' | 'prediction' | 'simulation'
  encoding: 'base64' | 'url' | 'tensor'
  data: string // base64 encoded image or URL
  dimensions?: {
    width: number
    height: number
    channels?: number
  }
  metadata: {
    camera_id?: string
    resolution?: string
    format?: string
    confidence?: number
    annotations?: Array<{
      label: string
      bbox?: [number, number, number, number]
      confidence?: number
    }>
    [key: string]: unknown
  }
}

/**
 * CWM-E: Event record
 * Represents events observed in the environment
 */
export interface CWMEventPayload {
  event_id: string
  event_type: string
  description: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  source: string
  detected_at: string
  properties: Record<string, unknown>
  related_entities?: Array<{
    entity_id: string
    entity_type: string
    relationship: string
  }>
  context?: {
    location?: string
    actors?: string[]
    [key: string]: unknown
  }
}

/**
 * JEPA (Joint-Embedding Predictive Architecture) output
 * Represents learned representations and predictions from the world model
 */
export interface JEPAOutput {
  output_id: string
  timestamp: string
  model_version: string
  input_context: {
    context_type: 'observation' | 'goal' | 'plan'
    context_id: string
    window_size: number
  }
  embeddings: {
    current_state: number[]
    predicted_state: number[]
    dimensions: number
  }
  predictions: Array<{
    horizon: number // time steps ahead
    predicted_features: Record<string, unknown>
    confidence: number
    uncertainty?: number
  }>
  metrics: {
    loss?: number
    accuracy?: number
    latency_ms?: number
    [key: string]: unknown
  }
}

/**
 * CWMState stream containing multiple records
 */
export interface CWMStateStream {
  stream_id: string
  start_time: string
  end_time?: string
  records: Array<CWMEnvelope<CWMActionPayload | CWMGoalPayload | CWMEventPayload>>
  jepa_outputs?: JEPAOutput[]
  metadata: {
    total_records: number
    record_counts: {
      actions: number
      goals: number
      events: number
    }
    source: string
    [key: string]: unknown
  }
}

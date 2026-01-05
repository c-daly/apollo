import type { Entity } from '../types/hcg'
import type { HCGEntity } from './sophia-client'

/** Minimal snapshot interface for summarization */
type SummarizableSnapshot = {
  entities: Array<Entity | HCGEntity>
}

export interface WorldEntitySummary {
  id: string
  type: string
  name: string
  status?: string
  position?: {
    x?: number
    y?: number
    z?: number
  }
  raw: Entity | HCGEntity
}

export type WorldDeltaType = 'added' | 'removed' | 'status' | 'position'

export interface WorldDelta {
  id: string
  entityType: string
  type: WorldDeltaType
  label: string
  previous?: WorldEntitySummary
  current?: WorldEntitySummary
}

export function summarizeSnapshot(
  snapshot: SummarizableSnapshot
): Map<string, WorldEntitySummary> {
  const map = new Map<string, WorldEntitySummary>()
  snapshot.entities.forEach(entity => {
    map.set(entity.id, summarizeEntity(entity))
  })
  return map
}

export function summarizeEntity(entity: Entity | HCGEntity): WorldEntitySummary {
  const props = entity.properties || {}
  return {
    id: entity.id,
    type: entity.type,
    name: inferName(entity),
    status: inferStatus(props),
    position: inferPosition(props),
    raw: entity,
  }
}

export function computeWorldDeltas(
  previous: Map<string, WorldEntitySummary>,
  current: Map<string, WorldEntitySummary>
): WorldDelta[] {
  const deltas: WorldDelta[] = []

  current.forEach(summary => {
    if (!previous.has(summary.id)) {
      deltas.push({
        id: summary.id,
        entityType: summary.type,
        type: 'added',
        label: `${summary.name} appeared`,
        current: summary,
      })
      return
    }

    const prev = previous.get(summary.id)!
    if (summary.status && prev.status && summary.status !== prev.status) {
      deltas.push({
        id: summary.id,
        entityType: summary.type,
        type: 'status',
        label: `${summary.name} ${prev.status} → ${summary.status}`,
        previous: prev,
        current: summary,
      })
    }

    if (positionsDiffer(prev.position, summary.position)) {
      deltas.push({
        id: summary.id,
        entityType: summary.type,
        type: 'position',
        label: `${summary.name} moved`,
        previous: prev,
        current: summary,
      })
    }
  })

  previous.forEach(summary => {
    if (!current.has(summary.id)) {
      deltas.push({
        id: summary.id,
        entityType: summary.type,
        type: 'removed',
        label: `${summary.name} removed`,
        previous: summary,
      })
    }
  })

  return deltas
}

export function formatPosition(summary?: WorldEntitySummary | null): string {
  if (!summary?.position) {
    return '—'
  }
  const { x, y, z } = summary.position
  const parts = [x, y, z].filter(value => typeof value === 'number')
  if (parts.length === 0) {
    return '—'
  }
  return parts
    .map((value, index) => {
      const axis = ['x', 'y', 'z'][index]
      return `${axis}:${Number(value).toFixed(1)}`
    })
    .join(' ')
}

function inferName(entity: Entity): string {
  const props = entity.properties || {}
  return (
    (props.name as string) ||
    (props.id as string) ||
    (props.description as string) ||
    entity.id
  )
}

function inferStatus(props: Record<string, unknown>): string | undefined {
  if (typeof props.status === 'string') {
    return props.status.toLowerCase()
  }
  if (typeof props.state === 'string') {
    return props.state.toLowerCase()
  }
  return undefined
}

function inferPosition(
  props: Record<string, unknown>
): WorldEntitySummary['position'] | undefined {
  const x = coerceNumber(props.x ?? props.pos_x ?? props.lat ?? props.lon)
  const y = coerceNumber(props.y ?? props.pos_y ?? props.lng ?? props.long)
  const z = coerceNumber(props.z ?? props.pos_z ?? props.alt)

  if (x == null && y == null && z == null) {
    const position = props.position
    if (
      position &&
      typeof position === 'object' &&
      'x' in position &&
      'y' in position
    ) {
      return {
        x: coerceNumber((position as Record<string, unknown>).x),
        y: coerceNumber((position as Record<string, unknown>).y),
        z: coerceNumber((position as Record<string, unknown>).z),
      }
    }
    return undefined
  }

  return { x, y, z }
}

function coerceNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN
  return Number.isFinite(num) ? num : undefined
}

function positionsDiffer(
  a?: WorldEntitySummary['position'],
  b?: WorldEntitySummary['position']
): boolean {
  if (!a && !b) return false
  if (!a || !b) return true
  return (
    !nearlyEqual(a.x, b.x) || !nearlyEqual(a.y, b.y) || !nearlyEqual(a.z, b.z)
  )
}

function nearlyEqual(a?: number, b?: number): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 1e-3
}

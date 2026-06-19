/**
 * Tests for the HCG Explorer state context, focused on the lazy-load
 * (seed + expand) working-set reducer behaviour.
 */

import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { HCGExplorerProvider, useHCGExplorer } from './context'
import type { NeighborhoodPayload } from './types'

const wrapper = ({ children }: { children: ReactNode }) => (
  <HCGExplorerProvider>{children}</HCGExplorerProvider>
)

const neighborhood = (
  nodes: NeighborhoodPayload['nodes'],
  edges: NeighborhoodPayload['edges']
): NeighborhoodPayload => ({ nodes, edges })

describe('HCGExplorer context — lazy-load reducer', () => {
  it('starts in lazy mode with an empty working set', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })
    expect(result.current.state.dataMode).toBe('lazy')
    expect(result.current.state.workingSet.entities).toHaveLength(0)
    expect(result.current.state.workingSet.edges).toHaveLength(0)
    expect(result.current.state.expandedNodeIds).toHaveLength(0)
  })

  it('seeds the working set and marks the root expanded', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })

    act(() => {
      result.current.mergeNeighborhood(
        neighborhood(
          [
            { uuid: 'a', name: 'A', type: 'entity', properties: {} },
            { uuid: 'b', name: 'B', type: 'concept', properties: {} },
          ],
          [{ id: 'e1', source: 'a', target: 'b', relation: 'IS_A' }]
        ),
        'a'
      )
    })

    expect(result.current.state.dataMode).toBe('lazy')
    expect(result.current.state.workingSet.entities).toHaveLength(2)
    expect(result.current.state.workingSet.edges).toHaveLength(1)
    expect(result.current.state.expandedNodeIds).toEqual(['a'])
  })

  it('merges a second neighborhood with dedupe and accumulates expanded ids', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })

    act(() => {
      result.current.mergeNeighborhood(
        neighborhood([{ uuid: 'a', name: 'A', type: 'entity', properties: {} }], []),
        'a'
      )
    })
    act(() => {
      result.current.mergeNeighborhood(
        neighborhood(
          [
            { uuid: 'a', name: 'A', type: 'entity', properties: {} },
            { uuid: 'c', name: 'C', type: 'entity', properties: {} },
          ],
          [{ id: 'e2', source: 'a', target: 'c', relation: 'RELATED_TO' }]
        ),
        'c'
      )
    })

    expect(
      result.current.state.workingSet.entities.map(e => e.id).sort()
    ).toEqual(['a', 'c'])
    expect(result.current.state.workingSet.edges).toHaveLength(1)
    expect(result.current.state.expandedNodeIds).toEqual(['a', 'c'])
  })

  it('does not duplicate an expanded id when the same root is re-expanded', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })

    act(() => {
      result.current.mergeNeighborhood(
        neighborhood([{ uuid: 'a', name: 'A', type: 'entity', properties: {} }], []),
        'a'
      )
    })
    act(() => {
      result.current.mergeNeighborhood(
        neighborhood([{ uuid: 'a', name: 'A', type: 'entity', properties: {} }], []),
        'a'
      )
    })

    expect(result.current.state.expandedNodeIds).toEqual(['a'])
  })

  it('resets the working set back to empty', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })

    act(() => {
      result.current.mergeNeighborhood(
        neighborhood([{ uuid: 'a', name: 'A', type: 'entity', properties: {} }], []),
        'a'
      )
      result.current.selectNode('a')
    })
    expect(result.current.state.workingSet.entities).toHaveLength(1)

    act(() => {
      result.current.resetWorkingSet()
    })

    expect(result.current.state.workingSet.entities).toHaveLength(0)
    expect(result.current.state.expandedNodeIds).toHaveLength(0)
    expect(result.current.state.selectedNodeId).toBeNull()
  })

  it('switches data mode without touching the working set', () => {
    const { result } = renderHook(() => useHCGExplorer(), { wrapper })

    act(() => {
      result.current.mergeNeighborhood(
        neighborhood([{ uuid: 'a', name: 'A', type: 'entity', properties: {} }], []),
        'a'
      )
    })
    act(() => {
      result.current.setDataMode('full')
    })

    expect(result.current.state.dataMode).toBe('full')
    expect(result.current.state.workingSet.entities).toHaveLength(1)
  })
})

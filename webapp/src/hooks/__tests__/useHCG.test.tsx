/**
 * Tests for the lazy-load HCG hooks, focused on the seed-search debounce and
 * the null/undefined-tolerant query term (review follow-ups).
 */

import { renderHook, act } from '@testing-library/react'
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useHCGSearch, HCG_SEARCH_DEBOUNCE_MS } from '../useHCG'
import { sophiaClient } from '../../lib/sophia-client'

const searchSpy = vi.spyOn(sophiaClient, 'searchHCG')

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useHCGSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchSpy.mockReset()
    searchSpy.mockResolvedValue({
      success: true,
      data: [{ uuid: 'u-1', name: 'hit', type: 'entity' }],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not issue a request until the query has been stable for the debounce', async () => {
    const wrapper = makeWrapper()
    const { rerender } = renderHook(({ q }: { q: string }) => useHCGSearch(q), {
      wrapper,
      initialProps: { q: 'e' },
    })

    // Simulate fast typing: each keystroke re-renders with a longer query
    // before the debounce elapses.
    rerender({ q: 'en' })
    rerender({ q: 'ent' })
    rerender({ q: 'enti' })
    rerender({ q: 'entit' })
    rerender({ q: 'entity' })

    // Mid-typing (before the debounce window): no request yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HCG_SEARCH_DEBOUNCE_MS - 50)
    })
    expect(searchSpy).not.toHaveBeenCalled()

    // Once typing settles past the debounce, exactly one request fires for the
    // final term -- not one per keystroke.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(searchSpy).toHaveBeenCalledWith('entity', 20)
  })

  it('never issues a request for an empty or whitespace query', () => {
    const wrapper = makeWrapper()
    renderHook(() => useHCGSearch('   '), { wrapper })
    act(() => {
      vi.advanceTimersByTime(HCG_SEARCH_DEBOUNCE_MS + 100)
    })
    expect(searchSpy).not.toHaveBeenCalled()
  })

  it('tolerates a null/undefined query without throwing', () => {
    const wrapper = makeWrapper()
    expect(() => {
      renderHook(() => useHCGSearch(null), { wrapper })
      renderHook(() => useHCGSearch(undefined), { wrapper })
    }).not.toThrow()
    act(() => {
      vi.advanceTimersByTime(HCG_SEARCH_DEBOUNCE_MS + 100)
    })
    expect(searchSpy).not.toHaveBeenCalled()
  })
})

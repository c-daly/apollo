import type { HCGGraphSnapshot } from '../../../hooks/useHCG'

/**
 * Cheap content signature of a raw HCG snapshot that DELIBERATELY ignores the
 * server's top-level `timestamp`. Sophia stamps that timestamp per request, so
 * it differs on every 15s poll even when the graph is byte-for-byte identical
 * — which defeats React Query's structural sharing and makes the snapshot
 * `useEffect` re-run the full rebuild (convertSnapshot + addSnapshot +
 * buildGraph + Cytoscape re-sync + force layout) for no reason.
 *
 * Gating that rebuild on this fingerprint skips the work when nothing changed.
 * It covers structural changes (add / remove / rewire) and renames. The single
 * case it misses is a property-only edit that leaves every id, name, edge
 * endpoint and the counts unchanged; that surfaces on the next structural
 * change. Computing it is one O(N) pass with no allocation, far cheaper than
 * the rebuild it guards.
 */
export function snapshotFingerprint(hcg: HCGGraphSnapshot): string {
  // FNV-1a hash over ids / names / edge endpoints. Math.imul keeps h a 32-bit
  // integer so the accumulator never deopts into a float.
  let h = 0x811c9dc5
  const mix = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
    }
    h = Math.imul(h ^ 0x2c, 0x01000193) // field separator
  }
  for (const e of hcg.entities) {
    mix(e.id)
    mix(e.name)
  }
  for (const e of hcg.edges) {
    mix(e.id)
    mix(e.source_id)
    mix(e.target_id)
    mix(e.edge_type)
  }
  return `${hcg.entity_count}:${hcg.edge_count}:${(h >>> 0).toString(16)}`
}

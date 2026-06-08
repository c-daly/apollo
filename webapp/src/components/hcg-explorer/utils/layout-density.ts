/**
 * Layout density parameters shared by the 3D force renderer (d3-force-3d) and
 * the 2D Cytoscape force layout (fcose). The sliders in HCGExplorer drive these
 * values; the mapping helpers translate them into per-renderer force settings
 * so a single set of controls re-lays-out both views consistently.
 */

export interface DensityParams {
  /** Node repulsion magnitude (higher = nodes pushed further apart). */
  repulsion: number
  /** Preferred edge length (higher = longer links / more spread). */
  linkDistance: number
  /** Centering/gravity strength toward the origin (0 = none, 1 = strong). */
  gravity: number
}

/** Defaults reproduce the historical force settings: charge -100, link 50,
 *  fcose nodeRepulsion 4500 / idealEdgeLength 100. Gravity is a new, mild pull. */
export const DEFAULT_DENSITY: DensityParams = {
  repulsion: 100,
  linkDistance: 50,
  gravity: 0.1,
}

export const DENSITY_RANGES: Record<
  keyof DensityParams,
  { min: number; max: number; step: number }
> = {
  repulsion: { min: 10, max: 500, step: 10 },
  linkDistance: { min: 10, max: 300, step: 5 },
  gravity: { min: 0, max: 1, step: 0.05 },
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Map density params to d3-force-3d settings used by ThreeRenderer. */
export function densityToForce3D(p: DensityParams): {
  chargeStrength: number
  linkDistance: number
  gravity: number
} {
  const repulsion = clamp(
    p.repulsion,
    DENSITY_RANGES.repulsion.min,
    DENSITY_RANGES.repulsion.max
  )
  return {
    chargeStrength: -repulsion,
    linkDistance: clamp(
      p.linkDistance,
      DENSITY_RANGES.linkDistance.min,
      DENSITY_RANGES.linkDistance.max
    ),
    gravity: clamp(p.gravity, DENSITY_RANGES.gravity.min, DENSITY_RANGES.gravity.max),
  }
}

/** Map density params to cytoscape fcose force-layout settings. */
export function densityToFcose(p: DensityParams): {
  nodeRepulsion: number
  idealEdgeLength: number
  gravity: number
} {
  return {
    nodeRepulsion:
      clamp(p.repulsion, DENSITY_RANGES.repulsion.min, DENSITY_RANGES.repulsion.max) *
      45,
    idealEdgeLength:
      clamp(
        p.linkDistance,
        DENSITY_RANGES.linkDistance.min,
        DENSITY_RANGES.linkDistance.max
      ) * 2,
    gravity: clamp(p.gravity, DENSITY_RANGES.gravity.min, DENSITY_RANGES.gravity.max),
  }
}

/**
 * Spacing factor for non-force 2D layouts (breadthfirst / hierarchical / circle
 * / concentric). Only the link-distance (spacing) slider is meaningful for
 * these; repulsion and gravity do not apply. Default link distance maps to the
 * historical spacing factor of ~1.4.
 */
export function densitySpacingFactor(p: DensityParams): number {
  const linkDistance = clamp(
    p.linkDistance,
    DENSITY_RANGES.linkDistance.min,
    DENSITY_RANGES.linkDistance.max
  )
  return clamp((linkDistance / DEFAULT_DENSITY.linkDistance) * 1.4, 0.5, 4)
}

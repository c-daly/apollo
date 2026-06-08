/**
 * Tests for the layout-density param mapping (force-3d + fcose + spacing).
 */

import { describe, it, expect } from "vitest"
import {
  DEFAULT_DENSITY,
  DENSITY_RANGES,
  densityToForce3D,
  densityToFcose,
  densitySpacingFactor,
  type DensityParams,
} from "./layout-density"

const params = (p: Partial<DensityParams>): DensityParams => ({
  ...DEFAULT_DENSITY,
  ...p,
})

describe("densityToForce3D", () => {
  it("maps the defaults to the historical d3-force-3d settings", () => {
    const f = densityToForce3D(DEFAULT_DENSITY)
    expect(f.chargeStrength).toBe(-100)
    expect(f.linkDistance).toBe(50)
    expect(f.gravity).toBe(0.1)
  })

  it("negates the repulsion magnitude into a repulsive charge", () => {
    expect(densityToForce3D(params({ repulsion: 250 })).chargeStrength).toBe(-250)
  })

  it("clamps repulsion / link distance / gravity into range", () => {
    const high = densityToForce3D(
      params({ repulsion: 9999, linkDistance: 9999, gravity: 9 })
    )
    expect(high.chargeStrength).toBe(-DENSITY_RANGES.repulsion.max)
    expect(high.linkDistance).toBe(DENSITY_RANGES.linkDistance.max)
    expect(high.gravity).toBe(DENSITY_RANGES.gravity.max)

    const low = densityToForce3D(
      params({ repulsion: -50, linkDistance: -1, gravity: -1 })
    )
    expect(low.chargeStrength).toBe(-DENSITY_RANGES.repulsion.min)
    expect(low.linkDistance).toBe(DENSITY_RANGES.linkDistance.min)
    expect(low.gravity).toBe(DENSITY_RANGES.gravity.min)
  })

  it("falls back to the minimum for NaN input", () => {
    expect(densityToForce3D(params({ repulsion: NaN })).chargeStrength).toBe(
      -DENSITY_RANGES.repulsion.min
    )
  })
})

describe("densityToFcose", () => {
  it("maps the defaults to the historical fcose settings", () => {
    const f = densityToFcose(DEFAULT_DENSITY)
    expect(f.nodeRepulsion).toBe(4500)
    expect(f.idealEdgeLength).toBe(100)
    expect(f.gravity).toBe(0.1)
  })

  it("scales repulsion and link distance", () => {
    const f = densityToFcose(params({ repulsion: 200, linkDistance: 100 }))
    expect(f.nodeRepulsion).toBe(9000)
    expect(f.idealEdgeLength).toBe(200)
  })
})

describe("densitySpacingFactor", () => {
  it("maps the default link distance to ~1.4", () => {
    expect(densitySpacingFactor(DEFAULT_DENSITY)).toBeCloseTo(1.4)
  })

  it("grows with link distance and stays within bounds", () => {
    expect(densitySpacingFactor(params({ linkDistance: 100 }))).toBeCloseTo(2.8)
    expect(
      densitySpacingFactor(params({ linkDistance: 10 }))
    ).toBeGreaterThanOrEqual(0.5)
    expect(
      densitySpacingFactor(params({ linkDistance: 300 }))
    ).toBeLessThanOrEqual(4)
  })
})

import { describe, it, expect } from 'vitest'
import * as ThreeRendererModule from './ThreeRenderer'

describe('ThreeRenderer exports', () => {
  it('exports ThreeRenderer component', () => {
    expect(ThreeRendererModule.ThreeRenderer).toBeDefined()
  })
})

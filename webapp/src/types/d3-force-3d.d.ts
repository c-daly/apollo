/**
 * Type declarations for d3-force-3d
 */

declare module 'd3-force-3d' {
  export interface SimulationNode {
    id?: string
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
    index?: number
  }

  export interface SimulationLink<N extends SimulationNode = SimulationNode> {
    source: string | N
    target: string | N
    index?: number
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface Force<N extends SimulationNode, L extends SimulationLink<N>> {
    (alpha: number): void
    initialize?(nodes: N[], random: () => number): void
  }

  export interface Simulation<N extends SimulationNode, L extends SimulationLink<N>> {
    restart(): this
    stop(): this
    tick(iterations?: number): this
    nodes(): N[]
    nodes(nodes: N[]): this
    alpha(): number
    alpha(alpha: number): this
    alphaMin(): number
    alphaMin(min: number): this
    alphaDecay(): number
    alphaDecay(decay: number): this
    alphaTarget(): number
    alphaTarget(target: number): this
    velocityDecay(): number
    velocityDecay(decay: number): this
    force(name: string): Force<N, L> | undefined
    force(name: string, force: Force<N, L> | null): this
    find(x: number, y: number, z?: number, radius?: number): N | undefined
    on(typenames: string): ((this: Simulation<N, L>) => void) | undefined
    on(typenames: string, listener: ((this: Simulation<N, L>) => void) | null): this
  }

  export function forceSimulation<N extends SimulationNode = SimulationNode>(
    nodes?: N[],
    numDimensions?: number
  ): Simulation<N, SimulationLink<N>>

  export function forceCenter<N extends SimulationNode = SimulationNode>(
    x?: number,
    y?: number,
    z?: number
  ): Force<N, SimulationLink<N>> & {
    x(): number
    x(x: number): Force<N, SimulationLink<N>>
    y(): number
    y(y: number): Force<N, SimulationLink<N>>
    z(): number
    z(z: number): Force<N, SimulationLink<N>>
  }

  export function forceCollide<N extends SimulationNode = SimulationNode>(
    radius?: number | ((node: N) => number)
  ): Force<N, SimulationLink<N>> & {
    radius(): number | ((node: N) => number)
    radius(radius: number | ((node: N) => number)): Force<N, SimulationLink<N>>
    strength(): number
    strength(strength: number): Force<N, SimulationLink<N>>
    iterations(): number
    iterations(iterations: number): Force<N, SimulationLink<N>>
  }

  export function forceLink<
    N extends SimulationNode = SimulationNode,
    L extends SimulationLink<N> = SimulationLink<N>
  >(
    links?: L[]
  ): Force<N, L> & {
    links(): L[]
    links(links: L[]): Force<N, L>
    id(): (node: N, i: number, nodes: N[]) => string
    id(id: (node: N, i: number, nodes: N[]) => string): Force<N, L>
    distance(): number | ((link: L, i: number, links: L[]) => number)
    distance(distance: number | ((link: L, i: number, links: L[]) => number)): Force<N, L>
    strength(): number | ((link: L, i: number, links: L[]) => number)
    strength(strength: number | ((link: L, i: number, links: L[]) => number)): Force<N, L>
    iterations(): number
    iterations(iterations: number): Force<N, L>
  }

  export function forceManyBody<N extends SimulationNode = SimulationNode>(): Force<
    N,
    SimulationLink<N>
  > & {
    strength(): number | ((node: N, i: number, nodes: N[]) => number)
    strength(strength: number | ((node: N, i: number, nodes: N[]) => number)): Force<N, SimulationLink<N>>
    theta(): number
    theta(theta: number): Force<N, SimulationLink<N>>
    distanceMin(): number
    distanceMin(distance: number): Force<N, SimulationLink<N>>
    distanceMax(): number
    distanceMax(distance: number): Force<N, SimulationLink<N>>
  }

  export function forceX<N extends SimulationNode = SimulationNode>(
    x?: number | ((node: N) => number)
  ): Force<N, SimulationLink<N>>

  export function forceY<N extends SimulationNode = SimulationNode>(
    y?: number | ((node: N) => number)
  ): Force<N, SimulationLink<N>>

  export function forceZ<N extends SimulationNode = SimulationNode>(
    z?: number | ((node: N) => number)
  ): Force<N, SimulationLink<N>>

  export function forceRadial<N extends SimulationNode = SimulationNode>(
    radius: number | ((node: N) => number),
    x?: number,
    y?: number,
    z?: number
  ): Force<N, SimulationLink<N>>
}
